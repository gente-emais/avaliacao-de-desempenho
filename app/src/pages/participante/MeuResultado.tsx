import { useEffect, useState } from 'react'
import { supabase, rpc } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { nota } from '../../lib/format'

interface Res { rodada_id: string; nota_final: number | null; nota_autoavaliacao: number | null; faixa_nome: string | null; rodada: { nome: string; ano: number } }
interface Faixa { nome: string; minimo: number; maximo: number; ordem: number }
interface BlocoMedia { nome: string; gestor: number | null; auto: number | null }
interface Lider { pergunta: string; media: number; respondentes: number }

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
        supabase.from('avaliacoes').select('id, grupo, formulario_id').eq('rodada_id', sel).eq('avaliado_id', eu.id).in('grupo', ['gestor', 'auto']),
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

  const atual = lista.find((l) => l.rodada_id === sel)
  if (!lista.length) return (
    <>
      <div className="cabecalho"><div><div className="migalha">Meu espaço</div><h1>Meu resultado</h1></div></div>
      <div className="card"><p>Seu resultado aparece aqui quando o RH liberar a devolutiva da rodada.</p></div>
    </>
  )
  const nf = Number(atual?.nota_final ?? 0)

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
      <section className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 32, alignItems: 'center' }}>
        <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="muted">Nota final</span>
          <span style={{ fontSize: 60, fontWeight: 800, color: 'var(--verde-escuro)', lineHeight: 1 }}>{nota(atual?.nota_final)}</span>
          <span className="pill ok" style={{ alignSelf: 'flex-start', fontSize: 14 }}>{atual?.faixa_nome}</span>
          <span className="muted">Autoavaliação: {nota(atual?.nota_autoavaliacao)}</span>
        </div>
        <div style={{ flex: '3 1 420px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ position: 'relative', paddingTop: 28 }}>
            <div style={{ position: 'absolute', top: 0, left: `${(nf / 4) * 100}%`, transform: 'translateX(-50%)', fontSize: 13, fontWeight: 700 }}>você ▾</div>
            <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', gap: 2 }}>
              {faixas.map((f, i) => (
                <div key={f.nome} style={{ flex: `${Number(f.maximo) - Number(f.minimo) + 0.01} 1 0`, background: ['#f3c9b9', '#dbe4f0', '#4ed8b0', '#1e756a'][i] ?? '#dbe4f0' }} />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 2, fontSize: 12 }} className="muted">
            {faixas.map((f) => <span key={f.nome} style={{ flex: `${Number(f.maximo) - Number(f.minimo) + 0.01} 1 0`, fontWeight: f.nome === atual?.faixa_nome ? 700 : 400 }}>{f.nome}<br />{nota(f.minimo)}–{nota(f.maximo)}</span>)}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="linha entre">
          <h2>Por competência: gestor × autoavaliação</h2>
          <span className="muted">Escala de 1 a 4 · só o gestor conta na nota</span>
        </div>
        {blocos.map((b) => (
          <div key={b.nome} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 240px) 1fr', gap: 16, alignItems: 'center', borderTop: '1px solid #e8eef6', paddingTop: 10 }}>
            <strong style={{ fontSize: 14 }}>{b.nome}</strong>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Barra v={b.gestor} cor="var(--verde-escuro)" rotulo="Gestor" />
              {b.auto != null && <Barra v={b.auto} cor="#7e5bdd" rotulo="Você" />}
            </div>
          </div>
        ))}
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
          <p className="muted">Médias de {lider[0].respondentes} respostas, sem identificar quem respondeu (mínimo de 3).</p>
          {lider.map((l) => <div key={l.pergunta} className="linha entre" style={{ borderTop: '1px solid #e8eef6', paddingTop: 10 }}><span>{l.pergunta}</span><strong>{nota(l.media)}</strong></div>)}
        </section>
      )}
    </>
  )
}

function Barra({ v, cor, rotulo }: { v: number | null; cor: string; rotulo: string }) {
  return (
    <div className="linha" style={{ flexWrap: 'nowrap' }}>
      <span className="muted" style={{ width: 48 }}>{rotulo}</span>
      <div className="barra" style={{ flex: 1, height: 12 }}><div style={{ width: `${((v ?? 0) / 4) * 100}%`, background: cor }} /></div>
      <strong style={{ width: 40, textAlign: 'right' }}>{nota(v)}</strong>
    </div>
  )
}
