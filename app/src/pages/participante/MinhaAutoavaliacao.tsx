import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type StatusAvaliacao } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { STATUS, dataHora } from '../../lib/format'

// Autoavaliação e pré-work do colaborador (perfis Tático, Especialista, Liderança e Estratégico).
interface Auto {
  id: string; status: StatusAvaliacao; iniciada_em: string | null; enviada_em: string | null
  rodada: { nome: string; ano: number; status: string }
}

export default function MinhaAutoavaliacao() {
  const { eu } = useAuth()
  const [lista, setLista] = useState<Auto[] | null>(null)

  useEffect(() => {
    if (!eu) return
    supabase.from('avaliacoes').select('id, status, iniciada_em, enviada_em, rodada:rodadas!inner(nome, ano, status, tipo)')
      .eq('avaliado_id', eu.id).eq('avaliador_id', eu.id).eq('grupo', 'auto').eq('rodada.tipo', 'avaliativo').neq('status', 'cancelada')
      .then(({ data }) => setLista(((data as unknown as Auto[]) ?? []).sort((a, b) => b.rodada.ano - a.rodada.ano)))
  }, [eu?.id])

  const aberta = lista?.find((a) => a.rodada.status === 'aberta')
  const anteriores = lista?.filter((a) => a !== aberta) ?? []
  const acao = (s: StatusAvaliacao) => (s === 'pendente' ? 'Começar' : s === 'em_andamento' ? 'Continuar' : 'Ver respostas')

  return (
    <>
      <div className="cabecalho"><div><div className="migalha">Meu espaço</div><h1>Minha autoavaliação</h1></div></div>
      <p className="muted" style={{ maxWidth: 760 }}>
        No Ciclo Avaliativo você responde o pré-work e se avalia nas mesmas perguntas que o seu gestor vai responder.
        Ele vê a sua autoavaliação ao lado de cada pergunta, para alinharem as expectativas na conversa de feedback.
      </p>

      {lista === null ? <div className="card"><p>Carregando…</p></div> : (
        <>
          <section className="card">
            <h2>Rodada atual</h2>
            {aberta ? (
              <div className="linha entre">
                <div>
                  <strong>{aberta.rodada.nome}</strong>
                  <div className="linha" style={{ marginTop: 6 }}>
                    <span className={`pill ${STATUS[aberta.status].classe}`}>{STATUS[aberta.status].rotulo}</span>
                    {aberta.enviada_em && <span className="muted">Enviada em {dataHora(aberta.enviada_em)}</span>}
                  </div>
                </div>
                <Link className={`botao ${aberta.status === 'pendente' || aberta.status === 'em_andamento' ? 'primario' : ''}`} to={`/avaliacao/${aberta.id}`}>{acao(aberta.status)}</Link>
              </div>
            ) : <p className="muted">Nenhuma autoavaliação aberta agora. Ela aparece aqui quando o RH abrir o Ciclo Avaliativo.</p>}
          </section>

          {anteriores.length > 0 && (
            <section className="card">
              <h2>Anteriores</h2>
              {anteriores.map((a) => (
                <div key={a.id} className="linha entre" style={{ borderTop: '1px solid #e8eef6', paddingTop: 12 }}>
                  <div><strong>{a.rodada.nome}</strong><div className="muted">{STATUS[a.status].rotulo}{a.enviada_em ? ` · enviada em ${dataHora(a.enviada_em)}` : ''}</div></div>
                  <Link className="botao pequeno" to={`/avaliacao/${a.id}`}>Ver respostas</Link>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </>
  )
}
