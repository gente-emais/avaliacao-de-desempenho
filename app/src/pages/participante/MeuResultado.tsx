import { useEffect, useState } from 'react'
import { supabase, rpc } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'

// Devolutiva do colaborador: mostra só a classificação (faixa), sem notas numéricas.
interface Res { rodada_id: string; nota_final: number | null; nota_autoavaliacao: number | null; faixa_nome: string | null; rodada: { nome: string; ano: number } }
interface Faixa { nome: string; minimo: number; maximo: number; ordem: number }
interface BlocoMedia { nome: string; gestor: number | null; auto: number | null }
interface Lider { pergunta: string; media: number; respondentes: number }

const CORES = ['#f3c9b9', '#dbe4f0', '#4ed8b0', '#1e756a']
const CORES_TEXTO = ['#9a3d1d', '#2f4858', '#14604f', '#ffffff']
const CONCORDANCIA = ['Estou seguro que não', 'Na maioria das vezes, não', 'Na maioria das vezes, sim', 'Estou seguro que sim']

export default function MeuResultado() {
  const { eu, temEquipe } = useAuth()
  const [lista, setLista] = useState<Res[]>([])
  const [sel, setSel] = useState<string>('')
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [blocos, setBlocos] = useState<BlocoMedia[]>([])
  const [textos, setTextos] = useState<{ fortes?: string; desenvolver?: string }>({})
  const [lider, setLider] = useState<Lider[] | null>(null)

  useEffect(() => {
    if (!eu) return
    supabase.from('resultados').select('rodada_id, nota_final, nota_autoavaliacao, faixa_nome, rodada:rodadas(nome, ano)')
      .eq('pessoa_id', eu.id).order('calculado_em', { ascending: false })
      .then(({ data }) => { const l = (data as unknown as Res[]) ?? []; setLista(l); if (l[0]) setSel(l[0].rodada_id) })
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
      const { data: rs } = await supabase.from('respostas').select('avaliacao_id, valor, texto, pergunta:perguntas(tipo, ordem, bloco:blocos(nome, tipo))').in('avaliacao_id', ids)
      type R = { avaliacao_id: string; valor: number | null; texto: string | null; pergunta: { tipo: string; ordem: number; bloco: { nome: string; tipo: string } } }
      const linhas = (rs as unknown as R[]) ?? []
      const grupoDe = (id: string) => av.find((a) => a.id === id)?.grupo
      const acc: Record<string, { g: number[]; a: number[] }> = {}
      linhas.filter((r) => r.pergunta.bloco.tipo === 'competencia' && r.valor != null).forEach((r) => {
        const nome = r.pergunta.bloco.nome.replace(/ - .*$/, '')
        acc[nome] ||= { g: [], a: [] }
        ;(grupoDe(r.avaliacao_id) === 'gestor' ? acc[nome].g : acc[nome].a).push(Number(r.valor))
      })
      const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null)
      setBlocos(Object.entries(acc).map(([nome, v]) => ({ nome, gestor: media(v.g), auto: media(v.a) })))
      const pot = linhas.filter((r) => r.pergunta.bloco.tipo === 'potencial' && grupoDe(r.avaliacao_id) === 'gestor').sort((x, y) => x.pergunta.ordem - y.pergunta.ordem)
      setTextos({ fortes: pot[0]?.texto ?? undefined, desenvolver: pot[1]?.texto ?? undefined })
      if (temEquipe) {
        try { setLider(await rpc<Lider[]>('resultado_como_lider', { p_rodada: sel, p_gestor: null })) } catch { setLider(null) }
      }
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

      <section className="card">
        <div className="linha entre">
          <h2>Por competência</h2>
          <span className="muted">O que o seu gestor avaliou e o que você se deu</span>
        </div>
        <div className="tabela-box">
          <table style={{ minWidth: 520 }}>
            <thead><tr><th>Competência</th><th>Avaliação do gestor</th><th>Sua autoavaliação</th></tr></thead>
            <tbody>
              {blocos.map((b) => {
                const g = faixaDe(b.gestor)
                const a = faixaDe(b.auto)
                return (
                  <tr key={b.nome}>
                    <td><strong>{b.nome}</strong></td>
                    <td>{g ? <Selo i={g.i} nome={g.nome} /> : '—'}</td>
                    <td>{a ? <Selo i={a.i} nome={a.nome} /> : <span className="muted">Não se aplica</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {(textos.fortes || textos.desenvolver) && (
        <div className="grade">
          {textos.fortes && <section className="card"><h2 style={{ color: 'var(--ok)' }}>Pontos fortes</h2><p style={{ whiteSpace: 'pre-line' }}>{textos.fortes}</p></section>}
          {textos.desenvolver && <section className="card"><h2 style={{ color: 'var(--pend)' }}>Pontos a desenvolver</h2><p style={{ whiteSpace: 'pre-line' }}>{textos.desenvolver}</p></section>}
        </div>
      )}

      {lider && lider.length > 0 && (
        <section className="card">
          <h2>Como seu time te avaliou como líder</h2>
          <p className="muted">Resposta predominante do time, sem identificar quem respondeu (mínimo de 3 respostas).</p>
          {lider.map((l) => (
            <div key={l.pergunta} className="linha entre" style={{ borderTop: '1px solid #e8eef6', paddingTop: 10 }}>
              <span style={{ flex: '1 1 300px' }}>{l.pergunta}</span>
              <span className="pill neutro">{CONCORDANCIA[Math.min(3, Math.max(0, Math.round(Number(l.media)) - 1))]}</span>
            </div>
          ))}
        </section>
      )}
    </>
  )
}

function Selo({ i, nome }: { i: number; nome: string }) {
  return <span className="pill" style={{ background: CORES[i], color: CORES_TEXTO[i] }}>{nome}</span>
}
