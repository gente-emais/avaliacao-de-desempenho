import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { rpc } from '../../lib/supabase'
import { baixarCsv, data } from '../../lib/format'

// Painel estratégico da AVD: jornada por etapa, indicadores, funil, faixas, liderança, desenvolvimento e pontos de atenção.
// Todo cartão é clicável e abre o detalhamento (com exportação).

interface P { id: string; nome: string; area: string | null; cargo: string | null; gestor_id: string | null; perfil: string | null }
interface Av { tipo: string; grupo: string; status: string; avaliado: string; avaliador: string; aceite: boolean }
interface Dados {
  ano: number; anos: number[]
  rodadas: { id: string; tipo: string; nome: string; status: string; liberado: boolean }[]
  pessoas: P[]; avaliacoes: Av[]
  feedback: { pessoa: string; prazo: string | null; concorda: string | null }[]
  lideranca: { gestor: string; respondentes: number; media: number | null }[]
  resultados: { ano: number; pessoa: string; faixa: string | null; nota: number | null; auto: number | null; liberado: boolean }[]
  faixas: { nome: string; minimo: number; maximo: number }[]
  encontros: { gestor: string; liderado: string; data: string }[]
  combinados: { responsavel: string; prazo: string; status: string }[]
  pdi: { pessoa: string; status: string; horas: number | null; fim: string }[]
}
type Cel = string | number
interface Detalhe { titulo: string; sub?: string; colunas: string[]; linhas: Cel[][] }

const COR_FAIXA = ['#ea7b5e', '#ffefab', '#4ed8b0', '#1e756a']
const TXT_FAIXA = ['#130c0e', '#130c0e', '#130c0e', '#ffffff']
const GRUPO_AV: Record<string, string> = { auto: 'Pré-work e autoavaliação', gestor: 'Avaliação do gestor', lider: 'Avalia o gestor', par: 'Pares' }
const GRUPO_FB: Record<string, string> = { gestor: 'Registro do gestor', auto: 'Resposta do colaborador' }
const STATUS_TXT: Record<string, string> = { pendente: 'Não iniciada', em_andamento: 'Em andamento', enviada: 'Aguardando revisão', concluida: 'Concluída' }
const feito = (s: string) => s === 'concluida' || s === 'enviada'
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null)
const sem = (p: number | null) => (p == null ? 'n' : p >= 80 ? 'v' : p >= 50 ? 'a' : 'l')
const fmt = (n: number | null | undefined, c = 2) => (n == null ? '—' : Number(n).toFixed(c).replace('.', ','))
const DIAS = (d: string) => Math.floor((Date.now() - new Date(d + 'T12:00:00').getTime()) / 86400000)

export default function PainelEstrategico() {
  const [ano, setAno] = useState(new Date().getFullYear())
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [area, setArea] = useState('')
  const [gestor, setGestor] = useState('')
  const [det, setDet] = useState<Detalhe | null>(null)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setD(null); setErro('')
    rpc<Dados>('painel_estrategico', { p_ano: ano }).then(setD).catch((e) => setErro((e as Error).message))
  }, [ano])

  const c = useMemo(() => (d ? calcular(d, area, gestor) : null), [d, area, gestor])
  if (erro) return <div className="aviso erro">{erro}</div>
  if (!d || !c) return <><Cabecalho /><div className="card"><p>Carregando…</p></div></>

  const nome = c.nome
  const abrir = (x: Detalhe) => setDet(x)
  const areas = [...new Set(d.pessoas.map((p) => p.area).filter(Boolean))].sort() as string[]
  const gestoresLista = [...new Set(d.pessoas.map((p) => p.gestor_id).filter(Boolean))].map((g) => ({ id: g as string, nome: nome(g) })).sort((a, b) => a.nome.localeCompare(b.nome))

  function Cabecalho() {
    return (
      <div className="cabecalho">
        <div><div className="migalha">Visão RH</div><h1>Painel estratégico da AVD</h1></div>
        <div className="linha">
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))} aria-label="Ano">
            {(d?.anos.length ? d.anos : [ano]).map((a) => <option key={a} value={a}>Ano: {a}</option>)}
          </select>
          {d && <select value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área"><option value="">Área: todas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select>}
          {d && <select value={gestor} onChange={(e) => setGestor(e.target.value)} aria-label="Gestor"><option value="">Gestor: todos</option>{gestoresLista.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select>}
          <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : raiz.current?.requestFullscreen())}>Modo TV</button>
        </div>
      </div>
    )
  }

  return (
    <div ref={raiz} className="estrategico">
      <Cabecalho />

      <section className="card">
        <div className="linha entre"><h2>Jornada da AVD {ano} · gestão à vista de cada etapa</h2><span className="muted">Clique em uma etapa para ver o detalhe</span></div>
        <div className="jornada">
          {c.jornada.map((j) => (
            <button key={j.chave} className="etapa" onClick={() => abrir(j.detalhe)} disabled={j.pct == null && !j.detalhe.linhas.length}>
              <span className="etapa-n">{j.quando}</span>
              <strong>{j.nome}</strong>
              <span className="etapa-p">{j.pct == null ? '—' : `${j.pct}%`}</span>
              <Barra p={j.pct} />
              <span className={`tag t${sem(j.pct)}`}>{j.resumo}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="kpis">
        {c.kpis.map((k) => (
          <button key={k.t} className="kpi-card" onClick={() => abrir(k.detalhe)}>
            <span className="kpi-t">{k.t}</span><span className="kpi-n">{k.v}</span><span className="muted">{k.d}</span>
          </button>
        ))}
      </div>

      <div className="grade" style={{ ['--min' as string]: '420px' }}>
        <section className="card">
          <h2>Funil do Ciclo Avaliativo</h2>
          {c.funil.length === 0 && <p className="muted">Nenhum Ciclo Avaliativo aberto ou encerrado em {ano}.</p>}
          {c.funil.map((f) => (
            <button key={f.nome} className="funil-linha" onClick={() => abrir(f.detalhe)}>
              <span>{f.nome}</span><Barra p={f.pct} alto /><b>{f.pct ?? 0}%</b>
            </button>
          ))}
          {c.gargalo && <span className="muted">{c.gargalo}</span>}
        </section>

        <section className="card">
          <h2>Distribuição das faixas · evolução</h2>
          {c.evolucao.map((e) => (
            <div key={e.ano} className="dist-linha">
              <span>{e.ano}</span>
              <div className="pilha">
                {e.partes.map((p) => p.n > 0 && (
                  <button key={p.faixa} style={{ flex: p.n, background: COR_FAIXA[p.i] ?? '#dbe4f0', color: TXT_FAIXA[p.i] ?? '#130c0e' }}
                    title={`${p.faixa}: ${p.n}`} onClick={() => abrir(p.detalhe)}>{p.n}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="legenda">{d.faixas.map((f, i) => <span key={f.nome}><i style={{ background: COR_FAIXA[i] }} />{f.nome}</span>)}</div>
          {c.porArea.ano && (
            <>
              <h3>Faixas por área · {c.porArea.ano}</h3>
              <div className="tabela-box"><table>
                <thead><tr><th>Área</th>{d.faixas.map((f) => <th key={f.nome} className="c">{f.nome}</th>)}</tr></thead>
                <tbody>{c.porArea.linhas.map((l) => (
                  <tr key={l.area} className="clicavel" onClick={() => abrir(l.detalhe)}><td>{l.area}</td>{l.n.map((n, i) => <td key={i} className="c">{n}</td>)}</tr>
                ))}</tbody>
              </table></div>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <div className="linha entre"><h2>Qualidade da liderança · por gestor</h2>
          <span className="muted linha"><Ponto c="v" />no ritmo <Ponto c="a" />atenção <Ponto c="l" />atrasado ou fora do padrão</span></div>
        <div className="tabela-box"><table style={{ minWidth: 980 }}>
          <thead><tr><th>Gestor</th><th className="c">Time</th><th className="c">Contratação</th><th className="c">One a One (90 dias)</th><th className="c">Feedback registrado</th><th className="c">Concordância do time</th><th className="c">Avaliações enviadas</th><th className="c">Faixas que dá</th><th className="c">Índice de liderança</th></tr></thead>
          <tbody>{c.gestores.map((g) => (
            <tr key={g.id} className="clicavel" onClick={() => abrir(g.detalhe)}>
              <td><strong>{g.nome}</strong></td><td className="c">{g.time}</td>
              <td className="c"><Ponto c={sem(g.contr.p)} />{g.contr.t}</td>
              <td className="c"><Ponto c={g.one >= 3 ? 'v' : g.one >= 1 ? 'a' : 'l'} />{g.one}</td>
              <td className="c"><Ponto c={sem(g.fb.p)} />{g.fb.t}</td>
              <td className="c">{g.conc.p == null ? '—' : <><Ponto c={sem(g.conc.p)} />{g.conc.p}%</>}</td>
              <td className="c"><Ponto c={sem(g.av.p)} />{g.av.t}</td>
              <td className="c">{g.faixas.alerta ? <span className="tag tl">{g.faixas.t}</span> : g.faixas.t}</td>
              <td className="c">{g.indice == null ? <span className="muted">{g.respondentes ? 'menos de 3' : '—'}</span> : <><Ponto c={g.indice >= 3 ? 'v' : g.indice >= 2.5 ? 'a' : 'l'} />{fmt(g.indice, 1)}</>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>

      <div className="grade" style={{ ['--min' as string]: '320px' }}>
        <section className="card">
          <h2>Desenvolvimento · PDI por faixa</h2>
          {!c.pdiFaixa.ano && <p className="muted">Sem resultados para cruzar com o PDI.</p>}
          {c.pdiFaixa.linhas.map((l) => (
            <button key={l.faixa} className="funil-linha" onClick={() => abrir(l.detalhe)}>
              <span>{l.faixa}</span><Barra p={pct(l.com, l.tot)} /><b>{l.com}/{l.tot}</b>
            </button>
          ))}
          <span className="muted">Faixas de {c.pdiFaixa.ano ?? '—'} × PDI de {ano} · objetivos concluídos: {c.pdiTotais.conc} de {c.pdiTotais.tot} · {fmt(c.pdiTotais.hc, 0)} h de {fmt(c.pdiTotais.ht, 0)} h</span>
        </section>

        <section className="card">
          <h2>Talentos e riscos</h2>
          <p className="muted">Comparando {c.talentos.ano ?? '—'} com o ano anterior.</p>
          {c.talentos.grupos.map((t) => (
            <button key={t.nome} className="talento" onClick={() => abrir(t.detalhe)} style={{ background: t.bg, color: t.fg }}>
              <b>{t.n}</b><span>{t.nome}</span><small>{t.desc}</small>
            </button>
          ))}
          <span className="muted">O 9-box (desempenho × potencial) entra quando o critério de potencial for definido.</span>
        </section>

        <section className="card">
          <h2>Pontos de atenção</h2>
          {c.alertas.length === 0 && <p className="em-dia">✓ Nenhum ponto de atenção com os filtros atuais.</p>}
          {c.alertas.map((a, i) => (
            <button key={i} className="alerta" onClick={() => abrir(a.detalhe)}>
              <span className={`tag t${a.nivel}`}>{a.tag}</span><span>{a.texto}</span>
            </button>
          ))}
        </section>
      </div>

      {det && (
        <div className="gaveta-fundo" onClick={() => setDet(null)}>
          <aside className="gaveta" role="dialog" aria-modal="true" aria-label={det.titulo} onClick={(e) => e.stopPropagation()}>
            <div className="linha entre">
              <div><h2>{det.titulo}</h2>{det.sub && <span className="muted">{det.sub}</span>}</div>
              <div className="linha">
                <button className="pequeno" onClick={() => baixarCsv(`${det.titulo}.csv`, [det.colunas, ...det.linhas])}>Exportar</button>
                <button className="pequeno" onClick={() => setDet(null)} aria-label="Fechar">Fechar</button>
              </div>
            </div>
            <p className="muted">{det.linhas.length} {det.linhas.length === 1 ? 'linha' : 'linhas'}</p>
            <div className="tabela-box"><table>
              <thead><tr>{det.colunas.map((x) => <th key={x}>{x}</th>)}</tr></thead>
              <tbody>{det.linhas.map((l, i) => <tr key={i}>{l.map((x, j) => <td key={j}>{x}</td>)}</tr>)}</tbody>
            </table></div>
          </aside>
        </div>
      )}
    </div>
  )
}

function Barra({ p, alto }: { p: number | null; alto?: boolean }) {
  return <div className={`barra${alto ? ' alta' : ''}`}><i className={sem(p)} style={{ width: `${p ?? 0}%` }} /></div>
}
function Ponto({ c }: { c: string }): ReactNode { return <span className={`ponto-s ${c}`} aria-hidden="true" /> }

// ---------- Cálculo dos indicadores (com o detalhamento de cada um) ----------
export function calcular(d: Dados, area: string, gestorSel: string) {
  const todos = new Map(d.pessoas.map((p) => [p.id, p]))
  const nome = (id: string | null | undefined) => (id ? todos.get(id)?.nome ?? '—' : '—')
  const pessoas = d.pessoas.filter((p) => (!area || p.area === area) && (!gestorSel || p.gestor_id === gestorSel))
  const ids = new Set(pessoas.map((p) => p.id))
  const dono = (a: Av) => (a.grupo === 'lider' ? a.avaliador : a.avaliado)
  const av = d.avaliacoes.filter((a) => ids.has(dono(a)))
  const P = (id: string) => todos.get(id)
  const linhaPessoa = (id: string) => [nome(id), P(id)?.area ?? '—', nome(P(id)?.gestor_id)]
  const rodada = (t: string) => d.rodadas.find((r) => r.tipo === t)
  const hoje = new Date().toISOString().slice(0, 10)

  // Jornada
  const contr = av.filter((a) => a.tipo === 'contratacao' && a.grupo === 'gestor')
  const contrOk = contr.filter((a) => a.status === 'concluida' && a.aceite).length
  const gestoresIds = [...new Set(pessoas.map((p) => p.gestor_id).filter(Boolean))] as string[]
  const enc = d.encontros
  const ultimo = (g: string) => enc.filter((e) => e.gestor === g).map((e) => e.data).sort().pop()
  const gestoresMes = gestoresIds.filter((g) => { const u = ultimo(g); return u && DIAS(u) <= 30 }).length
  const fb = av.filter((a) => a.tipo === 'feedback')
  const ava = av.filter((a) => a.tipo === 'avaliativo')
  const rAva = rodada('avaliativo')
  const resAno = d.resultados.filter((r) => r.ano === d.ano && ids.has(r.pessoa))
  const pdiPessoas = new Set(d.pdi.map((x) => x.pessoa))
  const comPdi = pessoas.filter((p) => pdiPessoas.has(p.id)).length

  const detAv = (titulo: string, lista: Av[], rot: Record<string, string>): Detalhe => ({
    titulo, colunas: ['Avaliado', 'Área', 'Etapa', 'Quem preenche', 'Situação'],
    linhas: lista.sort((a, b) => Number(feito(a.status)) - Number(feito(b.status)) || nome(a.avaliado).localeCompare(nome(b.avaliado)))
      .map((a) => [nome(a.avaliado), P(dono(a))?.area ?? '—', rot[a.grupo] ?? a.grupo, nome(a.avaliador), STATUS_TXT[a.status] ?? a.status]),
  })

  const jornada = [
    { chave: 'contr', quando: 'Etapa 1', nome: 'Contratação', pct: rodada('contratacao') ? pct(contrOk, contr.length) : null,
      resumo: rodada('contratacao') ? `${contrOk} de ${contr.length} aceites` : 'sem rodada no ano',
      detalhe: { titulo: 'Contratação de Desempenho', colunas: ['Colaborador', 'Área', 'Gestor', 'Situação'],
        linhas: contr.map((a) => [...linhaPessoa(a.avaliado), a.status !== 'concluida' ? 'Gestor não registrou' : a.aceite ? 'Aceite dado' : 'Aguardando aceite'] as Cel[]).sort((a, b) => String(a[3]).localeCompare(String(b[3]))) } },
    { chave: 'one', quando: 'Contínuo', nome: 'One a One', pct: pct(gestoresMes, gestoresIds.length), resumo: `${gestoresMes} de ${gestoresIds.length} gestores no mês`,
      detalhe: { titulo: 'One a One · encontros por gestor', sub: 'Gestores com time nos filtros atuais', colunas: ['Gestor', 'Time', 'Encontros (90 dias)', 'Último encontro'],
        linhas: gestoresIds.map((g) => [nome(g), pessoas.filter((p) => p.gestor_id === g).length, enc.filter((e) => e.gestor === g && DIAS(e.data) <= 90).length, ultimo(g) ? data(ultimo(g)) : 'nunca'] as Cel[]).sort((a, b) => Number(a[2]) - Number(b[2])) } },
    { chave: 'fb', quando: 'Etapa 2', nome: 'Ciclo de Feedback', pct: rodada('feedback') ? pct(fb.filter((a) => feito(a.status)).length, fb.length) : null,
      resumo: rodada('feedback') ? `${fb.filter((a) => feito(a.status)).length} de ${fb.length}` : 'sem rodada no ano', detalhe: detAv('Ciclo de Feedback', fb, GRUPO_FB) },
    { chave: 'av', quando: 'Etapa 3', nome: 'Ciclo Avaliativo', pct: rAva ? pct(ava.filter((a) => feito(a.status)).length, ava.length) : null,
      resumo: rAva ? `${ava.filter((a) => feito(a.status)).length} de ${ava.length}` : 'sem rodada no ano', detalhe: detAv('Ciclo Avaliativo', ava, GRUPO_AV) },
    { chave: 'dev', quando: 'Etapa 4', nome: 'Devolutiva',
      pct: rAva?.liberado ? pct(resAno.length, pessoas.length) : null,
      resumo: rAva?.liberado ? `${resAno.length} resultados liberados` : resAno.length ? 'calculada, não liberada' : 'não iniciada',
      detalhe: { titulo: `Resultados ${d.ano}`, colunas: ['Colaborador', 'Área', 'Gestor', 'Faixa', 'Nota', 'Autoavaliação'],
        linhas: resAno.map((r) => [...linhaPessoa(r.pessoa), r.faixa ?? '—', fmt(r.nota), fmt(r.auto)] as Cel[]) } },
    { chave: 'pdi', quando: 'Contínuo', nome: 'PDI', pct: pct(comPdi, pessoas.length), resumo: `${comPdi} de ${pessoas.length} com PDI`,
      detalhe: { titulo: `PDI ${d.ano} por pessoa`, colunas: ['Colaborador', 'Área', 'Gestor', 'Objetivos', 'Concluídos'],
        linhas: pessoas.map((p) => { const o = d.pdi.filter((x) => x.pessoa === p.id); return [p.nome, p.area ?? '—', nome(p.gestor_id), o.length, o.filter((x) => x.status === 'concluido').length] as Cel[] }).sort((a, b) => Number(a[3]) - Number(b[3])) } },
  ]

  // KPIs
  const fbResp = d.feedback.filter((f) => ids.has(f.pessoa))
  const noPrazo = fbResp.filter((f) => f.prazo === 'Recebi o feedback dentro do prazo').length
  const concTot = fbResp.filter((f) => f.concorda === 'Concordo totalmente').length
  const anosRes = [...new Set(d.resultados.map((r) => r.ano))].filter((a) => a <= d.ano).sort((a, b) => b - a)
  const anoGap = anosRes.find((a) => d.resultados.some((r) => r.ano === a && r.auto != null && ids.has(r.pessoa)))
  const gaps = d.resultados.filter((r) => r.ano === anoGap && r.auto != null && r.nota != null && ids.has(r.pessoa))
  const gapMedio = gaps.length ? gaps.reduce((s, r) => s + (Number(r.auto) - Number(r.nota)), 0) / gaps.length : null
  const lid = d.lideranca.filter((l) => l.media != null && (gestorSel ? l.gestor === gestorSel : gestoresIds.includes(l.gestor) || !area))
  const indice = lid.length ? lid.reduce((s, l) => s + Number(l.media) * l.respondentes, 0) / lid.reduce((s, l) => s + l.respondentes, 0) : null
  const pend = av.filter((a) => !feito(a.status))
  const detFb = (titulo: string): Detalhe => ({ titulo, colunas: ['Colaborador', 'Área', 'Gestor', 'Recebeu no prazo?', 'Concorda?'],
    linhas: fbResp.map((f) => [...linhaPessoa(f.pessoa), f.prazo ?? '—', f.concorda ?? '—'] as Cel[]) })

  const kpis = [
    { t: 'Adesão geral', v: `${pct(av.filter((a) => feito(a.status)).length, av.length) ?? 0}%`, d: `formulários entregues em ${d.ano} · meta 90%`,
      detalhe: { titulo: 'Formulários pendentes', sub: 'Todas as rodadas do ano', colunas: ['Avaliado', 'Área', 'Rodada', 'Etapa', 'Quem preenche', 'Situação'],
        linhas: pend.map((a) => [nome(a.avaliado), P(dono(a))?.area ?? '—', a.tipo === 'avaliativo' ? 'Ciclo Avaliativo' : a.tipo === 'feedback' ? 'Ciclo de Feedback' : 'Contratação',
          (a.tipo === 'feedback' ? GRUPO_FB : GRUPO_AV)[a.grupo] ?? a.grupo, nome(a.avaliador), STATUS_TXT[a.status]] as Cel[]) } },
    { t: 'Feedback no prazo', v: fbResp.length ? `${pct(noPrazo, fbResp.length)}%` : '—', d: `segundo o colaborador · ${fbResp.length} respostas`, detalhe: detFb('Feedback recebido no prazo') },
    { t: 'Concordância', v: fbResp.length ? `${pct(concTot, fbResp.length)}%` : '—', d: 'concordam totalmente com o feedback', detalhe: detFb('Concordância com o feedback') },
    { t: 'Auto × gestor', v: gapMedio == null ? '—' : `${gapMedio > 0 ? '+' : ''}${fmt(gapMedio)}`, d: anoGap ? `autoavaliação menos nota final · ${anoGap}` : 'sem autoavaliações',
      detalhe: { titulo: `Autoavaliação × nota do gestor · ${anoGap ?? ''}`, colunas: ['Colaborador', 'Área', 'Gestor', 'Nota final', 'Autoavaliação', 'Diferença'],
        linhas: gaps.map((r) => [...linhaPessoa(r.pessoa), fmt(r.nota), fmt(r.auto), fmt(Number(r.auto) - Number(r.nota))] as Cel[]).sort((a, b) => Number(String(b[5]).replace(',', '.')) - Number(String(a[5]).replace(',', '.'))) } },
    { t: 'Índice de liderança', v: indice == null ? '—' : `${fmt(indice, 1)}/4`, d: 'avaliação do gestor pelo time',
      detalhe: { titulo: 'Índice de liderança por gestor', sub: 'Só aparece com 3 respostas ou mais, para preservar o anonimato', colunas: ['Gestor', 'Respostas', 'Índice'],
        linhas: d.lideranca.filter((l) => !gestorSel || l.gestor === gestorSel).map((l) => [nome(l.gestor), l.respondentes, l.media == null ? 'menos de 3' : fmt(l.media, 1)] as Cel[]) } },
  ]

  // Funil do Ciclo Avaliativo
  const funil = rAva ? (['auto', 'gestor', 'lider', 'par'] as const).map((g) => {
    const l = ava.filter((a) => a.grupo === g)
    return l.length ? { nome: GRUPO_AV[g], pct: pct(l.filter((a) => feito(a.status)).length, l.length), detalhe: detAv(GRUPO_AV[g], l, GRUPO_AV) } : null
  }).filter(Boolean) as { nome: string; pct: number | null; detalhe: Detalhe }[] : []
  const envGestor = ava.filter((a) => a.grupo === 'gestor' && feito(a.status))
  if (envGestor.length) funil.push({ nome: 'Revisão do gestor acima', pct: pct(envGestor.filter((a) => a.status === 'concluida').length, envGestor.length),
    detalhe: { titulo: 'Revisão do gestor acima', colunas: ['Avaliado', 'Área', 'Avaliado por', 'Situação'],
      linhas: envGestor.map((a) => [nome(a.avaliado), P(a.avaliado)?.area ?? '—', nome(a.avaliador), a.status === 'enviada' ? 'Aguardando revisão' : 'Concluída'] as Cel[]) } })
  const pior = [...funil].sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0))[0]
  const zerados = gestoresIds.filter((g) => { const l = ava.filter((a) => a.grupo === 'gestor' && a.avaliador === g); return l.length && !l.some((a) => feito(a.status)) }).length
  const gargalo = pior ? `Gargalo: ${pior.nome.toLowerCase()} (${pior.pct ?? 0}%).${zerados ? ` ${zerados} ${zerados === 1 ? 'gestor ainda não enviou' : 'gestores ainda não enviaram'} nenhuma avaliação.` : ''}` : ''

  // Faixas
  const iFaixa = (n: string | null) => d.faixas.findIndex((f) => f.nome === n)
  const anosEvol = [...anosRes].reverse().slice(-4)
  const evolucao = anosEvol.map((a) => {
    const rs = d.resultados.filter((r) => r.ano === a && ids.has(r.pessoa))
    return { ano: a, partes: d.faixas.map((f, i) => {
      const l = rs.filter((r) => r.faixa === f.nome)
      return { faixa: f.nome, i, n: l.length, detalhe: { titulo: `${f.nome} · ${a}`, colunas: ['Colaborador', 'Área', 'Gestor', 'Nota'], linhas: l.map((r) => [...linhaPessoa(r.pessoa), fmt(r.nota)] as Cel[]) } }
    }) }
  })
  const anoArea = anosRes[0]
  const rsArea = d.resultados.filter((r) => r.ano === anoArea && ids.has(r.pessoa))
  const areasRes = [...new Set(rsArea.map((r) => P(r.pessoa)?.area ?? '—'))].sort()
  const porArea = { ano: anoArea, linhas: areasRes.map((ar) => {
    const l = rsArea.filter((r) => (P(r.pessoa)?.area ?? '—') === ar)
    return { area: ar, n: d.faixas.map((f) => l.filter((r) => r.faixa === f.nome).length),
      detalhe: { titulo: `${ar} · ${anoArea}`, colunas: ['Colaborador', 'Gestor', 'Faixa', 'Nota'], linhas: l.map((r) => [nome(r.pessoa), nome(P(r.pessoa)?.gestor_id), r.faixa ?? '—', fmt(r.nota)] as Cel[]) } }
  }) }

  // Liderança por gestor
  const gestores = gestoresIds.map((g) => {
    const time = pessoas.filter((p) => p.gestor_id === g)
    const tIds = new Set(time.map((p) => p.id))
    const cG = contr.filter((a) => tIds.has(a.avaliado))
    const cOk = cG.filter((a) => a.status === 'concluida' && a.aceite).length
    const fbG = fb.filter((a) => a.grupo === 'gestor' && a.avaliador === g)
    const respG = fbResp.filter((f) => tIds.has(f.pessoa))
    const avG = ava.filter((a) => a.grupo === 'gestor' && a.avaliador === g)
    const resG = d.resultados.filter((r) => r.ano === anoArea && tIds.has(r.pessoa))
    const faixasG = [...new Set(resG.map((r) => r.faixa))]
    const l = d.lideranca.find((x) => x.gestor === g)
    return {
      id: g, nome: nome(g), time: time.length,
      contr: { p: cG.length ? pct(cOk, cG.length) : null, t: cG.length ? `${cOk}/${cG.length}` : '—' },
      one: enc.filter((e) => e.gestor === g && DIAS(e.data) <= 90).length,
      fb: { p: fbG.length ? pct(fbG.filter((a) => feito(a.status)).length, fbG.length) : null, t: fbG.length ? `${fbG.filter((a) => feito(a.status)).length}/${fbG.length}` : '—' },
      conc: { p: respG.length >= 3 ? pct(respG.filter((f) => f.concorda === 'Concordo totalmente').length, respG.length) : null },
      av: { p: avG.length ? pct(avG.filter((a) => feito(a.status)).length, avG.length) : null, t: avG.length ? `${avG.filter((a) => feito(a.status)).length}/${avG.length}` : '—' },
      faixas: resG.length >= 3 && faixasG.length === 1 ? { alerta: true, t: `todos ${faixasG[0]}` } : { alerta: false, t: resG.length ? 'variadas' : '—' },
      indice: l?.media ?? null, respondentes: l?.respondentes ?? 0,
      detalhe: { titulo: `Time de ${nome(g)}`, colunas: ['Colaborador', 'Contratação', 'Feedback', 'Avaliação do gestor', `Faixa ${anoArea ?? ''}`],
        linhas: time.map((p) => {
          const c1 = cG.find((a) => a.avaliado === p.id); const f1 = fbG.find((a) => a.avaliado === p.id); const a1 = avG.find((a) => a.avaliado === p.id)
          return [p.nome, c1 ? (c1.status !== 'concluida' ? 'não registrada' : c1.aceite ? 'aceite dado' : 'aguardando aceite') : '—',
            f1 ? STATUS_TXT[f1.status] : '—', a1 ? STATUS_TXT[a1.status] : '—', resG.find((r) => r.pessoa === p.id)?.faixa ?? '—'] as Cel[]
        }) },
    }
  }).sort((a, b) => (a.av.p ?? 101) - (b.av.p ?? 101))

  // PDI por faixa
  const anoPdi = anosRes[0]
  const rsPdi = d.resultados.filter((r) => r.ano === anoPdi && ids.has(r.pessoa))
  const pdiFaixa = { ano: anoPdi, linhas: d.faixas.map((f) => {
    const l = rsPdi.filter((r) => r.faixa === f.nome)
    return { faixa: f.nome, tot: l.length, com: l.filter((r) => pdiPessoas.has(r.pessoa)).length,
      detalhe: { titulo: `PDI · ${f.nome} (${anoPdi})`, colunas: ['Colaborador', 'Área', 'Gestor', 'Tem PDI?'], linhas: l.map((r) => [...linhaPessoa(r.pessoa), pdiPessoas.has(r.pessoa) ? 'Sim' : 'Não'] as Cel[]).sort((a, b) => String(a[3]).localeCompare(String(b[3]))) } }
  }).filter((l) => l.tot > 0) }
  const pdiF = d.pdi.filter((x) => ids.has(x.pessoa))
  const pdiTotais = { tot: pdiF.length, conc: pdiF.filter((x) => x.status === 'concluido').length,
    ht: pdiF.reduce((s, x) => s + Number(x.horas ?? 0), 0), hc: pdiF.filter((x) => x.status === 'concluido').reduce((s, x) => s + Number(x.horas ?? 0), 0) }

  // Talentos e riscos (evolução entre os dois últimos anos com resultado)
  const [aT, aAnt] = anosRes
  const ordem = (r?: { faixa: string | null }) => (r ? iFaixa(r.faixa) : -1)
  const pares = aT && aAnt ? pessoas.map((p) => ({ p, at: d.resultados.find((r) => r.ano === aT && r.pessoa === p.id), an: d.resultados.find((r) => r.ano === aAnt && r.pessoa === p.id) })).filter((x) => x.at && x.an) : []
  const topo = d.faixas.length - 1
  const grupoT = (nomeG: string, desc: string, bg: string, fg: string, l: typeof pares) => ({ nome: nomeG, desc, bg, fg, n: l.length,
    detalhe: { titulo: `${nomeG} · ${aAnt} → ${aT}`, colunas: ['Colaborador', 'Área', 'Gestor', String(aAnt), String(aT)], linhas: l.map((x) => [...linhaPessoa(x.p.id), x.an!.faixa ?? '—', x.at!.faixa ?? '—'] as Cel[]) } })
  const talentos = { ano: aT, grupos: pares.length ? [
    grupoT('Talentos consistentes', `${d.faixas[topo]?.nome} nos dois anos`, '#1e756a', '#ffffff', pares.filter((x) => ordem(x.at) === topo && ordem(x.an) === topo)),
    grupoT('Em ascensão', 'subiram de faixa', '#d5f5ea', '#14604f', pares.filter((x) => ordem(x.at) > ordem(x.an))),
    grupoT('Em queda', 'desceram de faixa', '#f8ddd3', '#8a3416', pares.filter((x) => ordem(x.at) < ordem(x.an))),
  ] : [] }

  // Pontos de atenção
  const alertas: { tag: string; nivel: string; texto: string; detalhe: Detalhe }[] = []
  const semPdi = rsPdi.filter((r) => iFaixa(r.faixa) === 0 && !pdiPessoas.has(r.pessoa))
  if (semPdi.length) alertas.push({ tag: 'PDI', nivel: 'l', texto: `${semPdi.length} em ${d.faixas[0]?.nome} sem PDI em ${d.ano}`,
    detalhe: { titulo: `${d.faixas[0]?.nome} sem PDI`, colunas: ['Colaborador', 'Área', 'Gestor'], linhas: semPdi.map((r) => linhaPessoa(r.pessoa)) } })
  gestores.filter((g) => g.faixas.alerta).forEach((g) => alertas.push({ tag: 'Liderança', nivel: 'l', texto: `${g.nome}: ${g.faixas.t} no time`, detalhe: g.detalhe }))
  gestores.filter((g) => g.conc.p != null && g.conc.p < 50).forEach((g) => alertas.push({ tag: 'Feedback', nivel: 'a', texto: `${g.nome}: só ${g.conc.p}% do time concorda totalmente com o feedback`, detalhe: g.detalhe }))
  const semEncontro = pessoas.filter((p) => p.gestor_id && !enc.some((e) => e.liderado === p.id && DIAS(e.data) <= 60))
  if (semEncontro.length) alertas.push({ tag: 'One a One', nivel: 'a', texto: `${semEncontro.length} liderados sem encontro há mais de 60 dias`,
    detalhe: { titulo: 'Sem One a One há mais de 60 dias', colunas: ['Colaborador', 'Área', 'Gestor'], linhas: semEncontro.map((p) => linhaPessoa(p.id)) } })
  const vencidos = d.combinados.filter((x) => x.prazo < hoje && ids.has(x.responsavel))
  if (vencidos.length) alertas.push({ tag: 'Combinados', nivel: 'a', texto: `${vencidos.length} combinados do One a One vencidos`,
    detalhe: { titulo: 'Combinados vencidos', colunas: ['Responsável', 'Área', 'Gestor', 'Prazo'], linhas: vencidos.map((x) => [...linhaPessoa(x.responsavel), data(x.prazo)]) } })
  const semAceite = contr.filter((a) => a.status === 'concluida' && !a.aceite)
  if (semAceite.length) alertas.push({ tag: 'Contratação', nivel: 'a', texto: `${semAceite.length} contratações aguardando aceite`,
    detalhe: { titulo: 'Contratações aguardando aceite', colunas: ['Colaborador', 'Área', 'Gestor'], linhas: semAceite.map((a) => linhaPessoa(a.avaliado)) } })
  if (rAva?.status === 'aberta') {
    const ars = [...new Set(pessoas.map((p) => p.area ?? '—'))]
    ars.forEach((ar) => {
      const l = ava.filter((a) => (P(dono(a))?.area ?? '—') === ar)
      if (l.length && !l.some((a) => feito(a.status))) alertas.push({ tag: 'Prazo', nivel: 'l', texto: `${ar} com 0% no Ciclo Avaliativo`, detalhe: detAv(`Ciclo Avaliativo · ${ar}`, l, GRUPO_AV) })
    })
  }

  return { nome, jornada, kpis, funil, gargalo, evolucao, porArea, gestores, pdiFaixa, pdiTotais, talentos, alertas }
}
