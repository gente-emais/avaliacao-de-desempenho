// Cria o PRIMEIRO administrador de RH. Só funciona enquanto não existir nenhum admin_rh.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const DOMINIO_LOGIN = 'login.emais.app' // e-mail técnico do Auth: <cpf>@login.emais.app
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

function cpfValido(d: string) {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const dv = (n: number) => {
    let s = 0
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i)
    const r = (s * 10) % 11
    return r === 10 ? 0 : r
  }
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10])
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return resposta('ok')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { count } = await admin.from('pessoas').select('id', { count: 'exact', head: true }).eq('papel', 'admin_rh')
  if (req.method === 'GET') return resposta({ disponivel: (count ?? 0) === 0 })
  if ((count ?? 0) > 0) return resposta({ erro: 'Já existe um administrador. Peça acesso a ele.' }, 403)

  const { cpf, nome, email, senha } = await req.json().catch(() => ({}))
  const d = String(cpf ?? '').replace(/\D/g, '')
  if (!cpfValido(d)) return resposta({ erro: 'CPF inválido.' }, 400)
  if (!nome || String(senha ?? '').length < 8) return resposta({ erro: 'Informe nome e uma senha com 8 caracteres ou mais.' }, 400)

  const { data: u, error } = await admin.auth.admin.createUser({ email: `${d}@${DOMINIO_LOGIN}`, password: senha, email_confirm: true })
  if (error || !u.user) return resposta({ erro: 'Não foi possível criar o login: ' + (error?.message ?? '') }, 400)

  const { error: e2 } = await admin.from('pessoas').upsert(
    { cpf: d, nome, email: email || null, papel: 'admin_rh', user_id: u.user.id, ativo: true },
    { onConflict: 'cpf' },
  )
  if (e2) {
    await admin.auth.admin.deleteUser(u.user.id)
    return resposta({ erro: 'Não foi possível gravar o cadastro: ' + e2.message }, 400)
  }
  return resposta({ ok: true })
})
