// Envia o link de primeiro acesso / troca de senha para o e-mail do cadastro.
// Dois usos:
//   1) Tela de login: { cpf, redirectTo }  — resposta sempre genérica (não revela se o CPF existe)
//   2) RH administrador: { pessoa_ids: [...], redirectTo } com o token de login
// O e-mail sai pelo n8n (variável N8N_WEBHOOK_ACESSO), usando o e-mail corporativo.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return resposta('ok')
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const webhook = Deno.env.get('N8N_WEBHOOK_ACESSO')
  if (!webhook) return resposta({ erro: 'O envio de e-mail ainda não foi configurado (n8n).' }, 503)

  const corpo = await req.json().catch(() => ({}))
  const redirectTo = String(corpo.redirectTo ?? '')
  let alvos: { id: string; nome: string; email: string | null; email_ficticio: boolean; user_id: string | null }[] = []

  if (Array.isArray(corpo.pessoa_ids)) {
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
    const { data: quem } = await admin.auth.getUser(token)
    const { data: eu } = quem.user ? await admin.from('pessoas').select('papel').eq('user_id', quem.user.id).maybeSingle() : { data: null }
    if (eu?.papel !== 'admin_rh') return resposta({ erro: 'Apenas o RH administrador.' }, 403)
    const { data } = await admin.from('pessoas').select('id, nome, email, email_ficticio, user_id').in('id', corpo.pessoa_ids).eq('ativo', true)
    alvos = data ?? []
  } else {
    const cpf = String(corpo.cpf ?? '').replace(/\D/g, '')
    const { data } = await admin.from('pessoas').select('id, nome, email, email_ficticio, user_id').eq('cpf', cpf).eq('ativo', true)
    alvos = data ?? []
  }

  let enviados = 0
  for (const p of alvos) {
    if (!p.user_id || !p.email || p.email_ficticio) continue
    const { data: u } = await admin.auth.admin.getUserById(p.user_id)
    if (!u.user?.email) continue
    const { data: link } = await admin.auth.admin.generateLink({ type: 'recovery', email: u.user.email, options: { redirectTo } })
    if (!link?.properties?.action_link) continue
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo: 'acesso', nome: p.nome, email: p.email, link: link.properties.action_link }),
    })
    if (r.ok) enviados++
    await admin.from('notificacoes').insert({
      tipo: 'acesso', destinatario_id: p.id, chave: `acesso:${p.id}:${Date.now()}`,
      status: r.ok ? 'enviado' : 'erro', enviado_em: r.ok ? new Date().toISOString() : null,
    })
  }
  // Na tela de login a resposta é sempre a mesma, exista ou não o CPF.
  return Array.isArray(corpo.pessoa_ids) ? resposta({ ok: true, enviados }) : resposta({ ok: true })
})
