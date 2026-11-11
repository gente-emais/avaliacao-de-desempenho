import { useEffect, useState } from 'react'
import { supabase, rpc } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'

// Devolutiva do colaborador: mostra só a classificação (faixa), sem notas numéricas.
interface Res { rodada_id: string; nota_final: number | null; nota_autoavaliacao: number | null; faixa_nome: string | null; rodada: { nome: string; ano: number } }
interface Faixa { nome: string; minimo: number; maximo: number; ordem: number }
interface BlocoMedia { nome: string; gestor: number | null; auto: number | null }
interface Resp { rotulo: string | null; texto: string | null; evidencia: string | null; valor: number | null }
interface PerguntaDet { id: number; texto: string; tipo: string; ordem: number; auto?: Resp; gestor?: Resp }
interface BlocoDet { id: number; nome: string; tipo: string; ordem: number; perguntas: PerguntaDet[]; mediaGestor: number | null; mediaAuto: number | null }
interface LiderDet { respondentes: number; perguntas: { texto: string; tipo: string; opcoes: { rotulo: string; valor: number; n: number }[]; textos: string[] }[] }

const CORES = ['#f3c9b9', '#dbe4f0', '#4ed8b0', '#1e756a']
const CORES_TEXTO = ['#9a3d1d', '#2f4858', '#14604f', '#ffffff']
const COR_CONC: Record<number, string> = { 4: '#1e756a', 3: '#4ed8b0', 2: '#fadb19', 1: '#ea7b5e' }

export default function MeuResultado() {
  const { eu, temEquipe } = useAuth()
  const [lista, setLista] = useState<Res[]>([])
  const [sel, setSel] = useState<string>('')
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [blocos, setBlocos] = useState<BlocoMedia[]>([])
  const [det, setDet] = useState<BlocoDet[]>([])
  const [lider, setLider] = useState<LiderDet | null>(null)

  useEffect(() => {
    if (!eu) return
    supabase.from('resultados').select('rodada_id, nota_final, nota_autoavaliacao, faixa_nome, rodada:rodadas(nome, ano)')
      .eq('pessoa_id', eu.id).order('calculado_em', { ascending: false })
      .then(({ data }) => {
        // mais recente primeiro, pelo ano da rodada (as importadas da Mindsight têm data de cálculo de hoje)
        const l = ((data as unknown as Res[]) ?? []).sort((a, b) => b.rodada.ano - a.rodada.ano || a.rodada.nome.localeCompare(b.rodada.nome))
        setLista(l); if (l[0]) setSel(l[0].rodada_id)
      })
  }, [eu?.id])

  useEffect(() => {
    if (!sel || !eu) return
    ;(async () => {
      const [{ data: fx }, { data: avs }] = await Promise.all([
        supabase.from('faixas_classificacao').select('nome, minimo, maximo, ordem').eq('rodada_id', sel).order('ordem'),
        supabase.from('avaliacoes').select('id, grupo, formulario_id').eq('rodada_id', sel).eq('avaliado_id', eu.id).in('grupo', ['gestor', 'auto']).neq('status', 'cancelada'),
      ])
      setFaixas((fx as Faixa[]) ?? [])
      const av = (avs as { id: string; grupo: string; formulario_id: number }[]) ?? []
      const ids = av.map((a) => a.id)
      const formGestor = av.find((a) => a.grupo === 'gestor')?.formulario_id ?? av[0]?.formulario_id
      const [{ data: rs }, { data: ops }, { data: fbs }] = await Promise.all([
        supabase.from('respostas').select('avaliacao_id, valor, opcao, texto, evidencia, pergunta:perguntas(id, texto, tipo, ordem, escala_id, bloco:blocos(id, nome, tipo))').in('avaliacao_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']),
        supabase.from('escala_opcoes').select('escala_id, valor, rotulo'),
        supabase.from('formulario_blocos').select('bloco_id, ordem').eq('formulario_id', formGestor ?? 0),
      ])
      type R = { avaliacao_id: string; valor: number | null; opcao: string | null; texto: string | null; evidencia: string | null
        pergunta: { id: number; texto: string; tipo: string; ordem: number; escala_id: number | null; bloco: { id: number; nome: string; tipo: string } } }
      const linhas = (rs as unknown as R[]) ?? []
      const opcoes = (ops as { escala_id: number; valor: number; rotulo: string }[]) ?? []
      const ordemBloco = new Map(((fbs as { bloco_id: number; ordem: number }[]) ?? []).map((f) => [f.bloco_id, f.ordem]))
      const grupoDe = (id: string) => av.find((a) => a.id === id)?.grupo
      const media = (v: number[]) => (v.length ? v.reduce((s2, x) => s2 + x, 0) / v.length : null)
      const blocosMap = new Map<number, BlocoDet>()
      // só competências e perguntas de potencial (o pré-work fica fora da devolutiva)
      linhas.filter((x) => ['competencia', 'potencial'].includes(x.pergunta.bloco.tipo)).forEach((x) => {
        const b = x.pergunta.bloco
        if (!blocosMap.has(b.id)) blocosMap.set(b.id, { id: b.id, nome: b.nome, tipo: b.tipo, ordem: ordemBloco.get(b.id) ?? 999, perguntas: [], mediaGestor: null, mediaAuto: null })
        const bl = blocosMap.get(b.id)!
        let pg = bl.perguntas.find((q) => q.id === x.pergunta.id)
        if (!pg) { pg = { id: x.pergunta.id, texto: x.pergunta.texto, tipo: x.pergunta.tipo, ordem: x.pergunta.ordem }; bl.perguntas.push(pg) }
        const rot = x.valor != null ? opcoes.find((o) => o.escala_id === x.pergunta.escala_id && Number(o.valor) === Number(x.valor))?.rotulo ?? null : x.opcao
        const resp: Resp = { rotulo: rot, texto: x.texto, evidencia: x.evidencia, valor: x.valor == null ? null : Number(x.valor) }
        if (grupoDe(x.avaliacao_id) === 'gestor') pg.gestor = resp; else pg.auto = resp
      })
      const lista2 = [...blocosMap.values()].sort((a, b) => a.ordem - b.ordem)
      lista2.forEach((b) => {
        b.perguntas.sort((a, c) => a.ordem - c.ordem)
        b.mediaGestor = media(b.perguntas.map((q) => q.gestor?.valor).filter((v): v is number => v != null))
        b.mediaAuto = media(b.perguntas.map((q) => q.auto?.valor).filter((v): v is number => v != null))
      })
      setDet(lista2)
      setBlocos(lista2.filter((b) => b.tipo === 'competencia').map((b) => ({ nome: b.nome.replace(/ - .*$/, ''), gestor: b.mediaGestor, auto: b.mediaAuto })))
      if (temEquipe) {
        try { setLider(await rpc<LiderDet>('resultado_como_lider_detalhe', { p_rodada: sel, p_gestor: null })) } catch { setLider(null) }
      } else setLider(null)
    })()
  }, [sel, eu?.id, temEquipe])

  // Converte uma média na faixa correspondente (mesmas faixas da nota final)
  const faixaDe = (v: number | null) => {
    if (v == null) return null
    const r = Math.round(v * 100) / 100
    const i = faixas.findIndex((f) => r >= Number(f.minimo) && r <= Number(f.maximo))
    return i >= 0 ? { nome: faixas[i].nome, i } : null
  }

  const atual = lista.find((l) => l.rodada_id === sel)
  if (!lista.length) return (
    <>
      <div className="cabecalho"><div><div className="migalha">Meu espaço</div><h1>Meu resultado</h1></div></div>
      <div className="card"><p>Seu resultado aparece aqui quando o RH liberar a devolutiva da rodada.</p></div>
    </>
  )
  const iFinal = faixas.findIndex((f) => f.nome === atual?.faixa_nome)
  // Comparativo com o ano anterior: só nomes de faixa, sem notas
  const ordemFaixa = (nome: string | null) => faixas.findIndex((f) => f.nome === nome)
  const historico = lista.filter((l) => l.faixa_nome && atual && l.rodada.ano <= atual.rodada.ano)
    .sort((a, b) => a.rodada.ano - b.rodada.ano).slice(-4)
  const anterior = atual ? lista.filter((l) => l.rodada.ano < atual.rodada.ano && l.faixa_nome).sort((a, b) => b.rodada.ano - a.rodada.ano)[0] : undefined
  const passo = anterior ? iFinal - ordemFaixa(anterior.faixa_nome) : 0
  const tendencia = !anterior || ordemFaixa(anterior.faixa_nome) < 0 || iFinal < 0 ? null
    : passo > 0 ? { t: `Subiu ${passo > 1 ? `${passo} faixas` : 'uma faixa'} em relação a ${anterior.rodada.ano}`, s: '↑', c: 'ok' }
    : passo < 0 ? { t: `Ficou ${-passo > 1 ? `${-passo} faixas` : 'uma faixa'} abaixo de ${anterior.rodada.ano}`, s: '↓', c: 'pend' }
    : { t: `Manteve a mesma faixa de ${anterior.rodada.ano}`, s: '=', c: 'info' }
  const auto = faixaDe(atual?.nota_autoavaliacao ?? null)

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Meu espaço</div><h1>Meu resultado</h1></div>
        <div className="linha">
          <select value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Rodada">
            {lista.map((l) => <option key={l.rodada_id} value={l.rodada_id}>{l.rodada.nome}</option>)}
          </select>
          <button onClick={() => window.print()}>Baixar PDF</button>
        </div>
      </div>

      <section className="card" style={{ gap: 18 }}>
        <span className="muted">Sua classificação</span>
        <div className="linha" style={{ alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontSize: 40, fontWeight: 800, color: 'var(--verde-escuro)', lineHeight: 1.1 }}>{atual?.faixa_nome}</span>
          {auto && <span className="muted">Na sua autoavaliação: <strong>{auto.nome}</strong></span>}
          {tendencia && <span className={`pill ${tendencia.c}`} style={{ fontSize: 14, padding: '6px 12px' }}>{tendencia.s} {tendencia.t}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${faixas.length || 1}, minmax(0, 1fr))`, gap: 6 }}>
          {faixas.map((f, i) => {
            const ativa = i === iFinal
            return (
              <div key={f.nome} style={{
                borderRadius: 10, padding: '14px 10px', textAlign: 'center', fontSize: 14, fontWeight: ativa ? 800 : 500,
                background: ativa ? CORES[i] : '#f3f6fa', color: ativa ? CORES_TEXTO[i] : 'var(--muted)',
                outline: ativa ? '3px solid var(--verde-escuro)' : 'none', outlineOffset: 2,
              }}>
                {ativa && <div style={{ fontSize: 12, marginBottom: 4 }}>você está aqui</div>}
                {f.nome}
              </div>
            )
          })}
        </div>
      </section>

      {historico.length > 1 && (
        <section className="card">
          <div className="linha entre">
            <h2>Sua evolução</h2>
            <span className="muted">Classificação final em cada ciclo</span>
          </div>
          <div className="linha" style={{ gap: 8, alignItems: 'stretch' }}>
            {historico.map((h, k) => {
              const i = ordemFaixa(h.faixa_nome)
              const eAtual = h.rodada_id === sel
              return (
                <div key={h.rodada_id} className="linha" style={{ gap: 8, flex: '1 1 150px' }}>
                  {k > 0 && <span aria-hidden="true" className="muted" style={{ fontSize: 18 }}>→</span>}
                  <button onClick={() => setSel(h.rodada_id)} aria-pressed={eAtual} title={h.rodada.nome}
                    style={{ flex: 1, flexDirection: 'column', alignItems: 'flex-start', gap: 6, padding: '10px 14px', minHeight: 0, height: 'auto',
                      borderColor: eAtual ? 'var(--verde-escuro)' : 'var(--borda)', borderWidth: eAtual ? 2 : 1 }}>
                    <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>{h.rodada.ano}</span>
                    {i >= 0 ? <Selo i={i} nome={h.faixa_nome!} /> : <span className="pill neutro">{h.faixa_nome}</span>}
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {det.length === 0 && <p className="muted">Nesta rodada não há detalhe por competência (resultado trazido do sistema anterior).</p>}

      {blocos.length > 0 && (
        <section className="card">
          <div className="linha entre"><h2>Resumo por competência</h2><span className="muted">O que o seu gestor avaliou e o que você se deu</span></div>
          <div className="tabela-box"><table style={{ minWidth: 520 }}>
            <thead><tr><th>Competência</th><th>Avaliação do gestor</th><th>Sua autoavaliação</th></tr></thead>
            <tbody>{blocos.map((b) => {
              const g = faixaDe(b.gestor); const a = faixaDe(b.auto)
              return (
                <tr key={b.nome}>
                  <td><a href={`#bloco-${b.nome}`}><strong>{b.nome}</strong></a></td>
                  <td>{g ? <Selo i={g.i} nome={g.nome} /> : '—'}</td>
                  <td>{a ? <Selo i={a.i} nome={a.nome} /> : <span className="muted">Não se aplica</span>}</td>
                </tr>
              )
            })}</tbody>
          </table></div>
        </section>
      )}

      {det.map((b) => {
        const g = faixaDe(b.mediaGestor); const a = faixaDe(b.mediaAuto)
        const temAuto = b.perguntas.some((q) => q.auto)
        return (
          <section className="card devolutiva" key={b.id} id={`bloco-${b.nome.replace(/ - .*$/, '')}`}>
            <div className="devolutiva-topo">
              <h2>{b.tipo === 'potencial' ? 'Perguntas de potencial' : b.nome}</h2>
              {b.tipo === 'competencia' && (
                <div className="linha">
                  <span className="muted">Gestor</span>{g ? <Selo i={g.i} nome={g.nome} /> : '—'}
                  {temAuto && <><span className="muted" style={{ marginLeft: 8 }}>Sua autoavaliação</span>{a ? <Selo i={a.i} nome={a.nome} /> : '—'}</>}
                </div>
              )}
            </div>
            {b.perguntas.map((q) => (
              <div key={q.id} className="pergunta-det">
                <h3>{q.texto}</h3>
                {q.tipo === 'escala' && (
                  <div className="respostas-escala">
                    {q.auto && <div><span className="muted">Autoavaliação</span><SeloRotulo rotulo={q.auto.rotulo} faixas={faixas} /></div>}
                    {q.gestor && <div><span className="muted">Gestor</span><SeloRotulo rotulo={q.gestor.rotulo} faixas={faixas} /></div>}
                  </div>
                )}
                {(q.tipo !== 'escala' || q.auto?.evidencia || q.gestor?.evidencia) && (
                  <div className="comentarios">
                    {q.tipo === 'escala' && <strong className="muted">Evidências</strong>}
                    {(q.auto?.evidencia || (q.tipo !== 'escala' && (q.auto?.texto || q.auto?.rotulo))) && (
                      <div><b>Autoavaliação</b><p>{q.tipo === 'escala' ? q.auto?.evidencia : q.auto?.texto ?? q.auto?.rotulo}</p></div>
                    )}
                    {(q.gestor?.evidencia || (q.tipo !== 'escala' && (q.gestor?.texto || q.gestor?.rotulo))) && (
                      <div><b>Gestor</b><p>{q.tipo === 'escala' ? q.gestor?.evidencia : q.gestor?.texto ?? q.gestor?.rotulo}</p></div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </section>
        )
      })}

      {temEquipe && lider && (
        <section className="card devolutiva">
          <div className="devolutiva-topo"><h2>Como seu time te avaliou como gestor</h2><span className="muted">{lider.respondentes} {lider.respondentes === 1 ? 'resposta' : 'respostas'} · sem identificar quem respondeu</span></div>
          {lider.perguntas.length === 0 && <p className="muted">O resultado aparece com 3 respostas ou mais, para preservar o anonimato.</p>}
          {lider.perguntas.map((q, k) => {
            const tot = q.opcoes.reduce((s2, o) => s2 + o.n, 0)
            return (
              <div key={k} className="pergunta-det">
                <h3>{q.texto}</h3>
                {q.tipo === 'escala' && tot > 0 && (
                  <>
                    <div className="pilha-lider">
                      {q.opcoes.filter((o) => o.n > 0).map((o) => (
                        <span key={o.rotulo} style={{ flex: o.n, background: COR_CONC[o.valor] ?? '#dbe4f0', color: o.valor >= 4 ? '#fff' : '#130c0e' }} title={o.rotulo}>
                          {Math.round((o.n / tot) * 100)}%
                        </span>
                      ))}
                    </div>
                    <div className="legenda">{q.opcoes.map((o) => <span key={o.rotulo}><i style={{ background: COR_CONC[o.valor] ?? '#dbe4f0' }} />{o.rotulo} ({o.n})</span>)}</div>
                  </>
                )}
                {q.textos.length > 0 && (
                  <div className="comentarios"><b>Time</b>{q.textos.map((t, i) => <p key={i}>• {t}</p>)}</div>
                )}
              </div>
            )
          })}
        </section>
      )}
    </>
  )
}

function SeloRotulo({ rotulo, faixas }: { rotulo: string | null; faixas: Faixa[] }) {
  if (!rotulo) return <span className="muted">—</span>
  const i = faixas.findIndex((f) => f.nome === rotulo)
  return i >= 0 ? <Selo i={i} nome={rotulo} /> : <span className="pill neutro">{rotulo}</span>
}

function Selo({ i, nome }: { i: number; nome: string }) {
  return <span className="pill" style={{ background: CORES[i], color: CORES_TEXTO[i] }}>{nome}</span>
}
