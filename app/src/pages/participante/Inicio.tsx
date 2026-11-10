import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, rpc, type Grupo, type StatusAvaliacao, type TipoRodada } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { STATUS, dataHora, tituloTarefa } from '../../lib/format'

interface Tarefa {
  id: string
  grupo: Grupo
  status: StatusAvaliacao
  avaliado_id: string
  avaliador_id: string
  rodada: { nome: string; tipo: TipoRodada; status: string; etapas: { fim: string; status: string }[] }
  avaliado: { nome: string; acesso_assistido: boolean }
  avaliador: { nome: string; gestor_id: string | null }
  aceite: { aceito_em: string }[] | null
}

const SELECT = `id, grupo, status, avaliado_id, avaliador_id,
  rodada:rodadas!inner(nome, tipo, status, etapas:rodada_etapas(fim, status)),
  avaliado:pessoas!avaliacoes_avaliado_id_fkey(nome, acesso_assistido),
  avaliador:pessoas!avaliacoes_avaliador_id_fkey(nome, gestor_id),
  aceite:aceites(aceito_em)`


export default function Inicio() {
  const { eu } = useAuth()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [revisoes, setRevisoes] = useState<Tarefa[]>([])
  const [aceites, setAceites] = useState<Tarefa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState('')

  async function carregar() {
    if (!eu) return
    setCarregando(true)
    const [t, r, c] = await Promise.all([
      supabase.from('avaliacoes').select(SELECT).eq('avaliador_id', eu.id).in('status', ['pendente', 'em_andamento']).eq('rodada.status', 'aberta'),
      supabase.from('avaliacoes').select(SELECT).eq('grupo', 'gestor').eq('status', 'enviada').neq('avaliador_id', eu.id),
      supabase.from('avaliacoes').select(SELECT).eq('grupo', 'gestor').eq('status', 'concluida').eq('rodada.tipo', 'contratacao'),
    ])
    setTarefas((t.data as unknown as Tarefa[]) ?? [])
    setRevisoes(((r.data as unknown as Tarefa[]) ?? []).filter((x) => x.avaliador?.gestor_id === eu.id))
    // contratações que eu (ou, no assistido, eu como gestor) preciso dar aceite
    setAceites(((c.data as unknown as Tarefa[]) ?? []).filter((x) => !x.aceite?.length && (x.avaliado_id === eu.id || (x.avaliador_id === eu.id && x.avaliado?.acesso_assistido))))
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [eu?.id])

  async function aceitar(id: string) {
    try { await rpc('dar_aceite', { p_avaliacao: id }); setMsg('Aceite registrado.'); carregar() } catch (e) { setMsg((e as Error).message) }
  }

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Meu espaço</div><h1>Olá, {eu?.nome.split(' ')[0]}</h1></div>
      </div>
      {msg && <div className="aviso info">{msg}</div>}

      <section className="card card-escuro">
        <h2>O que você precisa fazer agora</h2>
        {carregando ? <p>Carregando…</p> : tarefas.length === 0 && revisoes.length === 0 && aceites.length === 0 ? (
          <p>Nada pendente. Quando uma rodada abrir, suas tarefas aparecem aqui e você recebe um e-mail.</p>
        ) : (
          <div className="grade" style={{ ['--min' as string]: '240px' }}>
            {tarefas.map((t) => (
              <Link key={t.id} to={`/avaliacao/${t.id}`} className="card" style={{ background: 'var(--cinza-verde-2)', borderColor: 'transparent', color: '#fff', textDecoration: 'none', gap: 6 }}>
                <span className="muted" style={{ color: '#c9d6de' }}>{t.rodada.nome}</span>
                <strong>{tituloTarefa(t.rodada.tipo, t.grupo, t.avaliado?.nome ?? '', t.avaliado_id === eu?.id)}</strong>
                <span style={{ fontSize: 13, color: '#dfe8ee' }}>{STATUS[t.status].rotulo}</span>
              </Link>
            ))}
            {revisoes.map((t) => (
              <Link key={t.id} to={`/avaliacao/${t.id}`} className="card" style={{ background: 'var(--cinza-verde-2)', borderColor: 'transparent', color: '#fff', textDecoration: 'none', gap: 6 }}>
                <span className="muted" style={{ color: '#c9d6de' }}>{t.rodada.nome}</span>
                <strong>Revisar nota de {t.avaliado?.nome}</strong>
                <span style={{ fontSize: 13, color: '#dfe8ee' }}>Avaliado por {t.avaliador?.nome}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {aceites.length > 0 && (
        <section className="card">
          <h2>Contratação de Desempenho para dar aceite</h2>
          {aceites.map((a) => (
            <div key={a.id} className="linha entre" style={{ borderTop: '1px solid #e8eef6', paddingTop: 12 }}>
              <div>
                <strong>{a.avaliado_id === eu?.id ? 'Sua contratação' : `Contratação de ${a.avaliado?.nome} (você marca por ele)`}</strong>
                <div className="muted">{a.rodada.nome}</div>
              </div>
              <div className="linha">
                <Link className="botao pequeno" to={`/avaliacao/${a.id}`}>Ler</Link>
                <button className="primario pequeno" onClick={() => aceitar(a.id)}>Li e estou ciente</button>
              </div>
            </div>
          ))}
        </section>
      )}
      <p className="muted">Atualizado em {dataHora(new Date().toISOString())}</p>
    </>
  )
}
