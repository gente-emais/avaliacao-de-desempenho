import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase, rpc } from '../../../lib/supabase'

// Importação de resultados de rodadas anteriores (ex.: exportação da Mindsight) com de/para.
const CAMPOS = [
  { k: 'cpf', rotulo: 'CPF', obrigatorio: true, pistas: ['cpf', 'documento'] },
  { k: 'nome', rotulo: 'Nome', obrigatorio: false, pistas: ['nome', 'colaborador', 'participante', 'avaliado'] },
  { k: 'nota_final', rotulo: 'Nota final', obrigatorio: false, pistas: ['notafinal', 'mediafinal', 'media', 'nota', 'resultado', 'score'] },
  { k: 'faixa', rotulo: 'Classificação (faixa)', obrigatorio: false, pistas: ['classificacao', 'faixa', 'conceito', 'categoria', 'enquadramento'] },
  { k: 'nota_auto', rotulo: 'Nota da autoavaliação', obrigatorio: false, pistas: ['autoavaliacao', 'auto', 'mediaauto'] },
  { k: 'cargo', rotulo: 'Cargo', obrigatorio: false, pistas: ['cargo', 'funcao'] },
  { k: 'area', rotulo: 'Área', obrigatorio: false, pistas: ['area', 'departamento', 'setor'] },
] as const
type Campo = (typeof CAMPOS)[number]['k']

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
const MANTER = '__manter__'

interface Previa {
  lidas: number; validas: number; encontradas: number; novas: number; gravado: boolean; rodada_existente: boolean
  erros: { linha: number; nome: string | null; erro: string }[]
  faixas: { faixa: string; pessoas: number; menor: number | null; maior: number | null }[]
  divergentes?: { linha: number; nome: string | null; nota: number; faixa: string; pela_nota: string }[]
}
const virgula = (n: number) => Number(n).toFixed(2).replace('.', ',')

export default function ImportarResultados() {
  const [nome, setNome] = useState('')
  const [ano, setAno] = useState(new Date().getFullYear() - 1)
  const [arquivo, setArquivo] = useState('')
  const [colunas, setColunas] = useState<string[]>([])
  const [linhasBrutas, setLinhasBrutas] = useState<Record<string, string>[]>([])
  const [mapa, setMapa] = useState<Record<Campo, string>>({} as Record<Campo, string>)
  const [deParaFaixa, setDeParaFaixa] = useState<Record<string, string>>({})
  const [faixasSistema, setFaixasSistema] = useState<string[]>([])
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)

  useEffect(() => {
    supabase.from('faixas_classificacao').select('nome').is('rodada_id', null).order('ordem')
      .then(({ data }) => setFaixasSistema(((data as { nome: string }[]) ?? []).map((f) => f.nome)))
  }, [])

  async function ler(f: File) {
    setMsg(null); setPrevia(null)
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
    const dados = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
    const linhas = dados.map((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, String(v ?? '').trim()])))
      .filter((l) => Object.values(l).some(Boolean))
    if (!linhas.length) return setMsg({ t: 'A planilha está vazia.', c: 'erro' })
    const cols = Object.keys(linhas[0])
    setArquivo(f.name); setColunas(cols); setLinhasBrutas(linhas)
    // Sugestão automática do de/para de colunas
    const sugestao = {} as Record<Campo, string>
    for (const c of CAMPOS) {
      const achada = cols.find((col) => c.pistas.some((p) => normal(col) === p)) ?? cols.find((col) => c.pistas.some((p) => normal(col).includes(p)))
      sugestao[c.k] = achada ?? ''
    }
    if (sugestao.nota_auto && sugestao.nota_auto === sugestao.nota_final) sugestao.nota_auto = ''
    setMapa(sugestao)
    const m = f.name.match(/20\d{2}/)
    if (m) { setAno(Number(m[0])); if (!nome) setNome(`Ciclo Avaliativo ${m[0]} (Mindsight)`) }
  }

  // Valores distintos da coluna de classificação → de/para de faixas
  const valoresFaixa = useMemo(() => {
    if (!mapa.faixa) return []
    return [...new Set(linhasBrutas.map((l) => l[mapa.faixa]).filter(Boolean))].sort()
  }, [linhasBrutas, mapa.faixa])
  useEffect(() => {
    setDeParaFaixa((atual) => Object.fromEntries(valoresFaixa.map((v) => [v, atual[v] ?? (faixasSistema.find((f) => normal(f) === normal(v)) ?? MANTER)])))
  }, [valoresFaixa, faixasSistema])

  function montarLinhas() {
    return linhasBrutas.map((l) => Object.fromEntries(CAMPOS.map((c) => [c.k, mapa[c.k] ? l[mapa[c.k]] ?? '' : ''])))
  }
  const deParaLista = () => Object.entries(deParaFaixa).map(([original, faixa]) => ({ original, faixa: faixa === MANTER ? original : faixa }))

  async function conferir() {
    setMsg(null)
    if (!mapa.cpf) return setMsg({ t: 'Indique qual coluna tem o CPF.', c: 'erro' })
    if (!mapa.nota_final && !mapa.faixa) return setMsg({ t: 'Indique a coluna da nota final ou a da classificação.', c: 'erro' })
    if (!nome.trim()) return setMsg({ t: 'Dê um nome para a rodada.', c: 'erro' })
    try { setPrevia(await rpc<Previa>('importar_resultados_historicos', { p_nome: nome, p_ano: ano, p_linhas: montarLinhas(), p_faixas: deParaLista(), p_confirmar: false })) }
    catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }
  async function importar() {
    try {
      const r = await rpc<Previa>('importar_resultados_historicos', { p_nome: nome, p_ano: ano, p_linhas: montarLinhas(), p_faixas: deParaLista(), p_confirmar: true })
      setMsg({ t: `Rodada "${nome}" importada com ${r.validas} resultados. Veja em Resultados.`, c: 'ok' })
      setPrevia(null); setLinhasBrutas([]); setColunas([]); setArquivo(''); setNome('')
    } catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }

  const exemplo = linhasBrutas[0]
  return (
    <>
      {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}
      <section className="card">
        <h2>1. Rodada e arquivo</h2>
        <p className="muted">Importe os resultados de uma rodada anterior (por exemplo, a exportação da Mindsight). A rodada entra como histórica e somente leitura.</p>
        <div className="grade" style={{ ['--min' as string]: '220px' }}>
          <label className="campo">Nome da rodada<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ciclo Avaliativo 2024 (Mindsight)" /></label>
          <label className="campo">Ano<input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} /></label>
          <label className="campo">Planilha (.xlsx ou .csv)<input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && ler(e.target.files[0])} /></label>
        </div>
        {arquivo && <div className="aviso ok">{arquivo} · {linhasBrutas.length} linhas · {colunas.length} colunas</div>}
      </section>

      {colunas.length > 0 && (
        <section className="card">
          <h2>2. De/para das colunas</h2>
          <p className="muted">Para cada informação do sistema, escolha a coluna correspondente na sua planilha. Já sugerimos pelo nome.</p>
          <div className="tabela-box"><table style={{ minWidth: 620 }}>
            <thead><tr><th>No sistema</th><th>Coluna da planilha</th><th>Exemplo da 1ª linha</th></tr></thead>
            <tbody>{CAMPOS.map((c) => (
              <tr key={c.k}>
                <td><strong>{c.rotulo}</strong>{c.obrigatorio && <span className="pill erro" style={{ marginLeft: 6 }}>obrigatório</span>}</td>
                <td><select value={mapa[c.k] ?? ''} onChange={(e) => setMapa((m) => ({ ...m, [c.k]: e.target.value }))} aria-label={`Coluna para ${c.rotulo}`}>
                  <option value="">— não usar —</option>
                  {colunas.map((col) => <option key={col} value={col}>{col}</option>)}
                </select></td>
                <td className="muted">{mapa[c.k] && exemplo ? exemplo[mapa[c.k]] : ''}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {valoresFaixa.length > 0 && (
        <section className="card">
          <h2>3. De/para das classificações</h2>
          <p className="muted">A planilha usa estes nomes de classificação. Escolha a faixa equivalente no sistema ou mantenha o nome original.</p>
          <div className="tabela-box"><table style={{ minWidth: 560 }}>
            <thead><tr><th>Na planilha</th><th>Pessoas</th><th>No sistema</th></tr></thead>
            <tbody>{valoresFaixa.map((v) => (
              <tr key={v}>
                <td><strong>{v}</strong></td>
                <td className="muted">{linhasBrutas.filter((l) => l[mapa.faixa] === v).length}</td>
                <td><select value={deParaFaixa[v] ?? MANTER} onChange={(e) => setDeParaFaixa((d) => ({ ...d, [v]: e.target.value }))} aria-label={`Faixa para ${v}`}>
                  <option value={MANTER}>Manter "{v}"</option>
                  {faixasSistema.map((f) => <option key={f} value={f}>{f}</option>)}
                </select></td>
              </tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      {colunas.length > 0 && (
        <section className="card">
          <h2>4. Conferir e importar</h2>
          <div className="linha"><button onClick={conferir}>Conferir</button></div>
          {previa && (
            <>
              <div className="grade" style={{ ['--min' as string]: '140px' }}>
                <Caixa n={previa.validas} t="linhas válidas" c="ok" />
                <Caixa n={previa.encontradas} t="pessoas já na base" c="info" />
                <Caixa n={previa.novas} t="entram como inativas" c="pend" />
                <Caixa n={previa.erros.length} t="com erro (ficam fora)" c="erro" />
              </div>
              {previa.rodada_existente && <div className="aviso erro">Já existe uma rodada com esse nome. Mude o nome para importar.</div>}
              <h3>Como vão ficar as faixas</h3>
              <div className="linha">{previa.faixas.map((f) => <span key={f.faixa} className="pill roxo" style={{ fontSize: 13 }}>{f.faixa}: {f.pessoas}</span>)}</div>
              {(previa.divergentes?.length ?? 0) > 0 && (
                <>
                  <div className="aviso erro">
                    {previa.divergentes!.length} pessoa(s) com nota que não bate com a faixa escolhida no de/para
                    (régua: 0,00–1,99 A desenvolver · 2,00–2,99 Em desenvolvimento · 3,00–3,49 Desenvolvido · 3,50–4,00 Consolidado).
                    Confira o de/para do passo 3 antes de importar.
                  </div>
                  <div className="tabela-box"><table style={{ minWidth: 520 }}>
                    <thead><tr><th>Linha</th><th>Nome</th><th>Nota</th><th>Faixa do de/para</th><th>Faixa pela nota</th></tr></thead>
                    <tbody>{previa.divergentes!.map((d) => <tr key={d.linha}><td>{d.linha + 1}</td><td>{d.nome}</td><td>{virgula(d.nota)}</td><td>{d.faixa}</td><td><strong>{d.pela_nota}</strong></td></tr>)}</tbody>
                  </table></div>
                </>
              )}
              {previa.divergentes?.length === 0 && <div className="aviso ok">Todas as notas batem com a régua de faixas.</div>}
              {previa.erros.length > 0 && (
                <div className="tabela-box"><table style={{ minWidth: 480 }}>
                  <thead><tr><th>Linha</th><th>Nome</th><th>Erro</th></tr></thead>
                  <tbody>{previa.erros.map((e) => <tr key={e.linha}><td>{e.linha + 1}</td><td>{e.nome}</td><td>{e.erro}</td></tr>)}</tbody>
                </table></div>
              )}
              <div className="linha"><button className="primario" disabled={!previa.validas || previa.rodada_existente} onClick={importar}>Importar {previa.validas} resultados</button></div>
            </>
          )}
        </section>
      )}
    </>
  )
}

function Caixa({ n, t, c }: { n: number; t: string; c: string }) {
  return <div style={{ borderRadius: 12, padding: 14, background: `var(--${c}-bg)`, color: `var(--${c})` }}><div style={{ fontSize: 26, fontWeight: 700 }}>{n}</div><div style={{ fontSize: 13 }}>{t}</div></div>
}
