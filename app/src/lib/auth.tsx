import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, PESSOA_COLS, type Pessoa } from './supabase'

interface AuthCtx {
  carregando: boolean
  sessao: Session | null
  eu: Pessoa | null
  ehRh: boolean
  ehAdmin: boolean
  temEquipe: boolean
  temAutoavaliacao: boolean
  sair: () => Promise<void>
}

const Ctx = createContext<AuthCtx>({
  carregando: true, sessao: null, eu: null, ehRh: false, ehAdmin: false, temEquipe: false, temAutoavaliacao: false, sair: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null)
  const [eu, setEu] = useState<Pessoa | null>(null)
  const [temEquipe, setTemEquipe] = useState(false)
  const [temAuto, setTemAuto] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let ativo = true
    async function carregar() {
      if (!sessao) { setEu(null); setCarregando(false); return }
      setCarregando(true)
      const { data } = await supabase.from('pessoas').select(PESSOA_COLS).eq('user_id', sessao.user.id).maybeSingle()
      const p = data as Pessoa | null
      let equipe = false
      let auto = false
      if (p) {
        const { count } = await supabase.from('pessoas').select('id', { count: 'exact', head: true }).eq('gestor_id', p.id).eq('ativo', true)
        equipe = (count ?? 0) > 0
        // Autoavaliação: o perfil tem esse bloco no Ciclo Avaliativo, ou a pessoa já teve uma
        const [{ count: jaTeve }, { count: perfilTem }] = await Promise.all([
          supabase.from('avaliacoes').select('id, rodada:rodadas!inner(tipo)', { count: 'exact', head: true })
            .eq('avaliado_id', p.id).eq('avaliador_id', p.id).eq('grupo', 'auto').eq('rodada.tipo', 'avaliativo'),
          p.perfil_id
            ? supabase.from('formulario_blocos').select('id, formulario:formularios!inner(perfil_id, tipo_rodada, ativo)', { count: 'exact', head: true })
                .eq('grupo', 'auto').eq('formulario.perfil_id', p.perfil_id).eq('formulario.tipo_rodada', 'avaliativo').eq('formulario.ativo', true)
            : Promise.resolve({ count: 0 }),
        ])
        auto = (jaTeve ?? 0) > 0 || (perfilTem ?? 0) > 0
      }
      if (ativo) { setEu(p); setTemEquipe(equipe); setTemAuto(auto); setCarregando(false) }
    }
    carregar()
    return () => { ativo = false }
  }, [sessao])

  const valor: AuthCtx = {
    carregando,
    sessao,
    eu,
    ehRh: eu?.papel === 'admin_rh' || eu?.papel === 'bp_rh',
    ehAdmin: eu?.papel === 'admin_rh',
    temEquipe,
    temAutoavaliacao: temAuto,
    sair: async () => { await supabase.auth.signOut() },
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export const useAuth = () => useContext(Ctx)

// Login por CPF: no Auth o login técnico é <cpf>@login.emais.app (nunca recebe e-mail).
export const DOMINIO_LOGIN = 'login.emais.app'

// Aceita CPF (colaboradores) ou e-mail (logins de teste e administradores).
export async function entrarComCpf(cpfOuEmail: string, senha: string) {
  const email = cpfOuEmail.includes('@') ? cpfOuEmail.trim().toLowerCase() : `${cpfOuEmail.replace(/\D/g, '')}@${DOMINIO_LOGIN}`
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(/rate|many/i.test(error.message) ? 'Muitas tentativas. Aguarde alguns minutos.' : 'CPF ou senha incorretos.')
}

// Link de primeiro acesso / troca de senha, enviado ao e-mail do cadastro (via n8n).
export async function pedirLinkDeSenha(cpf: string) {
  const { error } = await supabase.functions.invoke('enviar-acesso', {
    body: { cpf, redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}definir-senha` },
  })
  if (error) throw new Error('Não foi possível enviar o link agora. Procure o time de Gente e Gestão.')
}
