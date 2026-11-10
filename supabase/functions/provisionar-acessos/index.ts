// Cria o login (Supabase Auth) de quem está ativo, tem acesso próprio e ainda não tem usuário.
// Só o RH administrador pode chamar. O login é o CPF; o e-mail técnico nunca recebe mensagens.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const DOMINIO_LOGIN = 'login.emais.app'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return resposta('ok')
  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // Quem chamou?
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: quem } = await admin.auth.getUser(token)
  if (!quem.user) return resposta({ erro: 'Faça login novamente.' }, 401)
  const { data: eu } = await admin.from('pessoas').select('papel, ativo').eq('user_id', quem.user.id).maybeSingle()
  if (eu?.papel !== 'admin_rh' || !eu.ativo) return resposta({ erro: 'Apenas o RH administrador cria acessos.' }, 403)

  const { data: pessoas } = await admin.from('pessoas').select('id, cpf').eq('ativo', true).eq('acesso_assistido', false).is('user_id', null)
  let criados = 0
  const falhas: string[] = []
  for (const p of pessoas ?? []) {
    const senha = crypto.randomUUID() + crypto.randomUUID() // provisória; a pessoa define a dela pelo link
    let { data: u, error } = await admin.auth.admin.createUser({ email: `${p.cpf}@${DOMINIO_LOGIN}`, password: senha, email_confirm: true })
    if (error && /already/i.test(error.message)) {
      // já existia (ex.: pessoa reativada): procura e vincula
      const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
      const achado = lista?.users.find((x) => x.email === `${p.cpf}@${DOMINIO_LOGIN}`)
      u = achado ? { user: achado } : null
      error = achado ? null : error
    }
    if (error || !u?.user) { falhas.push(p.id); continue }
    await admin.from('pessoas').update({ user_id: u.user.id }).eq('id', p.id)
    criados++
  }
  return resposta({ ok: true, criados, falhas: falhas.length })
})
