import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import SeletorRodada from '../../components/SeletorRodada'
import { supabase, rpc, type Rodada, nomesPorId } from '../../lib/supabase'
import { baixarCsv, dataHora, nota } from '../../lib/format'

interface Res {
  pessoa_id: string; nota_calculada: number | null; nota_final: number | null; nota_autoavaliacao: number | null; faixa_nome: string | null
  pessoa: { nome: string; area: string | null; gestor: { nome: string } | null }
}
interface Faixa { nome: string; minimo: number; maximo: number; ordem: number }
const CORES = ['#d46039', '#9fb6c4', '#2d8c7e', '#1e756a']

export default function Resultados() {
  const [params, setParams] = useSearchParams()
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [res, setRes] = useState<Res[]>([])
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [filtroFaixa, setFiltroFaixa] = useState('')
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)
  const rodadaId = params.get('rodada') ?? ''
  const rodada = rodadas.find((r) => r.id === rodadaId)

  useEffect(() => {
    supabase.from('rodadas').select('*').eq('tipo', 'avaliativo').neq('status', 'rascunho').order('ano', { ascending: false }).order('criado_em', { ascending: false }).then(({ data }) => {
      const l = (data as Rodada[]) ?? []
      setRodadas(l)
      if (!rodadaId && l[0]) setParams({ rodada: l[0].id })
    })
  }, [])

  async function carregar() {
    if (!rodadaId) return
    const [{ data: r }, { data: f }, { data: rl }] = await Promise.all([
      supabase.from('resultados').select('pessoa_id, nota_calculada, nota_final, nota_autoavaliacao, faixa_nome, pessoa:pessoas(nome, area, gestor_id)').eq('rodada_id', rodadaId),
      supabase.from('faixas_classificacao').select('nome, minimo, maximo, ordem').eq('rodada_id', rodadaId).order('ordem'),
      supabase.from('rodadas').select('*').eq('id', rodadaId).single(),
    ])
    const lista = (r as unknown as (Res & { pessoa: { gestor_id: string | null } })[]) ?? []
    const nomes = await nomesPorId(lista.map((x) => x.pessoa?.gestor_id))
    setRes(lista.map((x) => ({ ...x, pessoa: x.pessoa && { ...x.pessoa, gestor: x.pessoa.gestor_id && nomes[x.pessoa.gestor_id] ? { nome: nomes[x.pessoa.gestor_id] } : null } }))
      .sort((a, b) => Number(b.nota_final) - Number(a.nota_final)))
    setFaixas((f as Faixa[]) ?? [])
    if (rl) setRodadas((x) => x.map((y) => (y.id === rodadaId ? (rl as Rodada) : y)))
  }
  useEffect(() => { carregar() }, [rodadaId])

  async function acao(fn: 'calcular_resultados' | 'liberar_resultados') {
    if (fn === 'liberar_resultados' && !confirmar()) return
    try { await rpc(fn, { p_rodada: rodadaId }); setMsg({ t: fn === 'calcular_resultados' ? 'Notas recalculadas.' : 'Devolutivas liberadas para colaboradores e gestores.', c: 'ok' }); carregar() }
    catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }
  const confirmar = () => window.confirm('Liberar o resultado para todos os participantes desta rodada?')

  const dist = useMemo(() => faixas.map((f) => ({ ...f, n: res.filter((r) => r.faixa_nome === f.nome).length })), [faixas, res])
  const maxDist = Math.max(1, ...dist.map((d) => d.n))
  const porArea = useMemo(() => {
    const m: Record<string, number[]> = {}
    res.forEach((r) => { const a = r.pessoa?.area ?? 'Sem área'; (m[a] ||= []).push(Number(r.nota_final)) })
    return Object.entries(m).map(([area, v]) => ({ area, n: v.length, media: v.reduce((s, x) => s + x, 0) / v.length })).sort((a, b) => b.media - a.media)
  }, [res])
  const media = res.length ? res.reduce((s, r) => s + Number(r.nota_final), 0) / res.length : null
  const lista = filtroFaixa ? res.filter((r) => r.faixa_nome === filtroFaixa) : res

  function exportar() {
    baixarCsv(`resultados_${rodada?.nome ?? ''}.csv`, [
      ['Nome', 'Área', 'Gestor', 'Nota calculada', 'Nota final', 'Faixa', 'Autoavaliação'],
      ...res.map((r) => [r.pessoa?.nome, r.pessoa?.area, r.pessoa?.gestor?.nome, nota(r.nota_calculada), nota(r.nota_final), r.faixa_nome, nota(r.nota_autoavaliacao)]),
    ])
  }

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Visão RH</div><h1>Resultados das rodadas</h1></div>
        <div className="linha">
          {!rodada?.somente_leitura && <button onClick={() => acao('calcular_resultados')}>Recalcular notas</button>}
          {!rodada?.somente_leitura && !rodada?.resultado_liberado_em && <button className="primario" onClick={() => acao('liberar_resultados')}>Liberar devolutivas</button>}
          <button onClick={exportar}>Exportar planilha</button>
        </div>
      </div>
      {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}
      <section className="card" style={{ padding: '16px 20px' }}>
        <SeletorRodada rodadas={rodadas} valor={rodadaId} onChange={(id) => setParams({ rodada: id })} tipos={['avaliativo']} />
      </section>
      {rodada?.somente_leitura && <div className="aviso neutro">Rodada histórica migrada da Mindsight: somente leitura, com a escala e as faixas originais.</div>}
      {rodada?.resultado_liberado_em && <div className="aviso ok">Devolutivas liberadas em {dataHora(rodada.resultado_liberado_em)}.</div>}

      <div className="grade" style={{ ['--min' as string]: '180px' }}>
        <div className="card"><span className="muted">Média geral</span><span className="kpi">{nota(media)}</span><span className="muted">escala de 1 a 4</span></div>
        <div className="card"><span className="muted">Avaliados</span><span className="kpi">{res.length}</span><span className="muted">com nota fechada</span></div>
        {dist.slice().reverse().slice(0, 2).map((d) => (
          <div className="card" key={d.nome}><span className="muted">{d.nome}</span><span className="kpi">{res.length ? Math.round((d.n / res.length) * 100) : 0}%</span><span className="muted">{d.n} pessoas</span></div>
        ))}
      </div>

      <div className="grade" style={{ ['--min' as string]: '380px' }}>
        <section className="card">
          <h2>Distribuição por faixa</h2>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dist.length || 1}, minmax(0, 1fr))`, gap: 16, alignItems: 'end', height: 200, borderBottom: '1px solid var(--borda-forte)' }}>
            {dist.map((d, i) => (
              <button key={d.nome} onClick={() => setFiltroFaixa(filtroFaixa === d.nome ? '' : d.nome)} title={`Filtrar ${d.nome}`}
                style={{ border: 0, background: 'transparent', padding: 0, height: '100%', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 6, minHeight: 0 }}>
                <span style={{ fontWeight: 700, color: 'var(--texto)' }}>{d.n}</span>
                <span style={{ width: '70%', height: `${(d.n / maxDist) * 150}px`, background: CORES[i] ?? '#9fb6c4', borderRadius: '6px 6px 0 0', outline: filtroFaixa === d.nome ? '3px solid var(--verde)' : 'none' }} />
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${dist.length || 1}, minmax(0, 1fr))`, gap: 16 }}>
            {dist.map((d) => <span key={d.nome} className="muted" style={{ textAlign: 'center' }}>{d.nome}<br />{nota(d.minimo)}–{nota(d.maximo)}</span>)}
          </div>
        </section>
        <section className="card">
          <h2>Média por área</h2>
          {porArea.map((a) => (
            <div key={a.area} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 48px', gap: 12, alignItems: 'center', fontSize: 14 }}>
              <span>{a.area} <span className="muted">· {a.n}</span></span>
              <div className="barra" style={{ height: 12 }}><div style={{ width: `${(a.media / 4) * 100}%`, background: 'var(--verde-escuro-2)' }} /></div>
              <strong style={{ textAlign: 'right' }}>{nota(a.media)}</strong>
            </div>
          ))}
        </section>
      </div>

      <section className="card" style={{ padding: 8 }}>
        <div className="linha entre" style={{ padding: '12px 12px 0' }}>
          <h2>Resultado por pessoa {filtroFaixa && <span className="pill info">{filtroFaixa}</span>}</h2>
        </div>
        <div className="tabela-box"><table>
          <thead><tr><th>Colaborador</th><th>Gestor</th><th style={{ textAlign: 'right' }}>Nota final</th><th>Faixa</th><th style={{ textAlign: 'right' }}>Autoavaliação</th><th>Revisão</th></tr></thead>
          <tbody>{lista.map((r) => (
            <tr key={r.pessoa_id}>
              <td><strong>{r.pessoa?.nome}</strong><div className="muted">{r.pessoa?.area}</div></td>
              <td>{r.pessoa?.gestor?.nome ?? '—'}</td>
              <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 16 }}>{nota(r.nota_final)}</td>
              <td><span className="pill ok">{r.faixa_nome}</span></td>
              <td style={{ textAlign: 'right' }} className="muted">{nota(r.nota_autoavaliacao)}</td>
              <td className="muted">{Number(r.nota_calculada) !== Number(r.nota_final) ? `Ajustada ${nota(r.nota_calculada)} → ${nota(r.nota_final)}` : 'Mantida'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  )
}
