import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, rpc, type Grupo, type StatusAvaliacao, type TipoRodada } from '../lib/supabase'
import { STATUS, dataHora, umAceite } from '../lib/format'

// Painel "Avaliações de <pessoa>" numa rodada: quem preenche cada parte e a situação.
// RH administrador também lembra, troca quem preenche e reabre.
interface Av {
  id: string; grupo: Grupo; status: StatusAvaliacao; avaliador_id: string; enviada_em: string | null
  avaliador: { nome: string; email: string | null; gestor_id: string | null } | null
  aceite: { aceito_em: string } | { aceito_em: string }[] | null
}

const ROTULOS: Record<TipoRodada, Partial<Record<Grupo, string>>> = {
  avaliativo: { auto: 'Autoavaliação e pré-work', gestor: 'Gestor', lider: 'Time (avalia o gestor)', par: 'Pares' },
  feedback: { gestor: 'Registro do gestor', auto: 'Resposta do colaborador' },
  contratacao: { gestor: 'Contratação (registro do gestor)' },
}

export default function AvaliacoesPessoa({ rodadaId, pessoaId, podeAgir, onFechar, onMudou, nome }: {
  rodadaId: string; pessoaId: string; podeAgir: boolean; onFechar: () => void; onMudou?: () => void; nome?: string
}) {
  const [rodada, setRodada] = useState<{ nome: string; tipo: TipoRodada; status: string } | null>(null)
  const [pessoa, setPessoa] = useState<{ nome: string; perfil: string | null } | null>(null)
  const [avs, setAvs] = useState<Av[]>([])
  const [revisor, setRevisor] = useState<string | null>(null)
  const [ativos, setAtivos] = useState<{ id: string; nome: string }[]>([])
  const [trocando, setTrocando] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)

  async function carregar() {
    const [{ data: r }, { data: rp }, { data: a }] = await Promise.all([
      supabase.from('rodadas').select('nome, tipo, status').eq('id', rodadaId).single(),
      supabase.from('rodada_participantes').select('nome, perfil:perfis(nome)').eq('rodada_id', rodadaId).eq('pessoa_id', pessoaId).maybeSingle(),
      supabase.from('avaliacoes').select('id, grupo, status, avaliador_id, enviada_em, avaliador:pessoas!avaliacoes_avaliador_id_fkey(nome, email, gestor_id), aceite:aceites(aceito_em)')
        .eq('rodada_id', rodadaId).eq('avaliado_id', pessoaId).neq('status', 'cancelada'),
    ])
    setRodada(r as typeof rodada)
    const p = rp as unknown as { nome: string; perfil: { nome: string } | null } | null
    setPessoa(p ? { nome: p.nome, perfil: p.perfil?.nome ?? null } : null)
    const lista = ((a as unknown as Av[]) ?? []).sort((x, y) => (x.avaliador?.nome ?? '').localeCompare(y.avaliador?.nome ?? ''))
    setAvs(lista)
    const g = lista.find((x) => x.grupo === 'gestor')
    if (g?.avaliador?.gestor_id) {
      const { data } = await supabase.from('pessoas').select('nome').eq('id', g.avaliador.gestor_id).maybeSingle()
      setRevisor((data as { nome: string } | null)?.nome ?? null)
    } else setRevisor(null)
  }
  useEffect(() => { carregar() }, [rodadaId, pessoaId])
  useEffect(() => {
    if (podeAgir) supabase.from('pessoas').select('id, nome').eq('ativo', true).order('nome').then(({ data }) => setAtivos((data as { id: string; nome: string }[]) ?? []))
  }, [podeAgir])

  async function lembrar(a: Av) {
    const hoje = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('notificacoes').upsert([{
      tipo: 'lembrete_manual', destinatario_id: a.avaliador_id, rodada_id: rodadaId,
      chave: `lembrete_manual:${rodadaId}:${a.avaliador_id}:${hoje}`, payload: { avaliacao: a.id },
    }], { onConflict: 'chave', ignoreDuplicates: true })
    setMsg(error ? { t: error.message, c: 'erro' } : { t: `Lembrete na fila para ${a.avaliador?.nome}.`, c: 'ok' })
  }
  async function trocar(a: Av, novo: string) {
    try { await rpc('trocar_avaliador', { p_avaliacao: a.id, p_novo: novo }); setMsg({ t: 'Quem preenche foi trocado.', c: 'ok' }); setTrocando(null); carregar(); onMudou?.() }
    catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }
  async function reabrir(a: Av) {
    if (!window.confirm(`Reabrir a avaliação preenchida por ${a.avaliador?.nome}? Ela volta para "em andamento".`)) return
    try { await rpc('reabrir_avaliacao', { p_avaliacao: a.id }); setMsg({ t: 'Avaliação reaberta.', c: 'ok' }); carregar(); onMudou?.() }
    catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }

  const tipo = rodada?.tipo ?? 'avaliativo'
  const grupos = Object.entries(ROTULOS[tipo]) as [Grupo, string][]
  const aberta = rodada?.status === 'aberta'
  const gestorAv = avs.find((a) => a.grupo === 'gestor')

  return (
    <div className="gaveta-fundo" onClick={onFechar}>
      <aside className="gaveta" role="dialog" aria-modal="true" aria-label={`Avaliações de ${pessoa?.nome ?? ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="linha entre">
          <div>
            <span className="muted">{rodada?.nome}{pessoa?.perfil ? ` · ${pessoa.perfil}` : ''}</span>
            <h2 style={{ fontSize: 22 }}>Avaliações de {pessoa?.nome ?? nome ?? '…'}</h2>
          </div>
          <button className="pequeno" onClick={onFechar}>Fechar</button>
        </div>
        {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}

        {grupos.map(([g, rotulo]) => {
          const lista = avs.filter((a) => a.grupo === g)
          const feitas = lista.filter((a) => a.status === 'concluida' || a.status === 'enviada').length
          return (
            <section key={g} className="grupo-av">
              <h3>
                {rotulo}
                {lista.length === 0 ? <span className="pill neutro">não se aplica a este perfil</span>
                  : <span className={`pill ${aberta ? 'info' : 'neutro'}`}>{aberta ? 'aberta' : 'fechada'}</span>}
                {g === 'lider' && lista.length > 0 && <span className="muted">respostas anônimas · {feitas} de {lista.length}</span>}
              </h3>
              {lista.length > 0 && (
                <div className="tabela-box"><table>
                  <thead><tr><th>Quem preenche</th><th>E-mail</th><th>Situação</th>{podeAgir && <th></th>}</tr></thead>
                  <tbody>{lista.map((a) => {
                    const ac = umAceite(a.aceite)
                    const pend = a.status === 'pendente' || a.status === 'em_andamento'
                    return (
                      <tr key={a.id}>
                        <td>{a.avaliador?.nome ?? '—'}</td>
                        <td className="muted">{a.avaliador?.email ?? '—'}</td>
                        <td>
                          <span className={`pill ${STATUS[a.status].classe}`}>{STATUS[a.status].rotulo}</span>
                          {tipo === 'contratacao' && a.status === 'concluida' && <div className="muted">{ac ? `Aceite em ${dataHora(ac.aceito_em)}` : 'Aguardando aceite'}</div>}
                        </td>
                        {podeAgir && (
                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {a.status !== 'pendente' && a.status !== 'cancelada' && <><Link className="botao pequeno" to={`/avaliacao/${a.id}`}>Ver respostas</Link>{' '}</>}
                            {aberta && pend && <button className="pequeno" onClick={() => lembrar(a)}>Lembrar</button>}{' '}
                            {aberta && pend && g !== 'auto' && (trocando === a.id
                              ? <select autoFocus defaultValue="" onChange={(e) => e.target.value && trocar(a, e.target.value)} aria-label="Nova pessoa">
                                  <option value="" disabled>Trocar por…</option>
                                  {ativos.filter((x) => x.id !== a.avaliador_id && x.id !== pessoaId).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                                </select>
                              : <button className="pequeno" onClick={() => setTrocando(a.id)}>Trocar</button>)}
                            {aberta && !pend && <button className="pequeno" onClick={() => reabrir(a)}>Reabrir</button>}
                          </td>
                        )}
                      </tr>
                    )
                  })}</tbody>
                </table></div>
              )}
            </section>
          )
        })}

        {tipo === 'avaliativo' && (
          <section className="grupo-av">
            <h3>Revisão do gestor acima
              {!gestorAv ? <span className="pill neutro">não se aplica</span>
                : gestorAv.status === 'enviada' ? <span className="pill roxo">aguardando {revisor ?? 'revisão'}</span>
                : gestorAv.status === 'concluida' ? <span className="pill ok">concluída</span>
                : <span className="pill neutro">aguarda o gestor enviar</span>}
            </h3>
          </section>
        )}
      </aside>
    </div>
  )
}
