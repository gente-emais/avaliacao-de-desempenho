import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, rpc, type Rodada, type TipoRodada } from '../../lib/supabase'
import { TIPO_RODADA, data } from '../../lib/format'

interface Etapa { id?: number; ordem: number; codigo: string; nome: string; inicio: string; fim: string; status?: string }
type RodadaCompleta = Rodada & { etapas: Etapa[] }

const ETAPAS: Record<TipoRodada, Omit<Etapa, 'inicio' | 'fim'>[]> = {
  avaliativo: [
    { ordem: 1, codigo: 'autoavaliacao', nome: 'Autoavaliação e pré-work' },
    { ordem: 2, codigo: 'avaliacao', nome: 'Avaliação do gestor' },
    { ordem: 3, codigo: 'revisao', nome: 'Revisão do gestor acima' },
    { ordem: 4, codigo: 'resultados', nome: 'Resultados e devolutiva' },
  ],
  contratacao: [
    { ordem: 1, codigo: 'preenchimento', nome: 'Preenchimento do gestor' },
    { ordem: 2, codigo: 'aceite', nome: 'Aceite do colaborador' },
  ],
  feedback: [
    { ordem: 1, codigo: 'registro', nome: 'Registro do gestor' },
    { ordem: 2, codigo: 'resposta', nome: 'Resposta do colaborador' },
  ],
}
const DESCRICAO: Record<TipoRodada, string> = {
  contratacao: 'Gestor registra o acordo do ano e o colaborador dá o aceite.',
  avaliativo: 'Pré-work, autoavaliação, avaliação do gestor, avaliação do líder e pares, conforme o perfil.',
  feedback: 'Gestor registra os acordos e o colaborador responde ao feedback recebido.',
}
const STATUS_RODADA: Record<string, [string, string]> = { rascunho: ['Rascunho', 'neutro'], aberta: ['Aberta', 'ok'], encerrada: ['Encerrada', 'roxo'], historica: ['Histórico', 'neutro'] }

export default function Rodadas() {
  const [lista, setLista] = useState<RodadaCompleta[]>([])
  const [tipo, setTipo] = useState<TipoRodada>('avaliativo')
  const [nome, setNome] = useState('')
  const [ano, setAno] = useState(new Date().getFullYear())
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [contagem, setContagem] = useState<{ total: number; porPerfil: Record<string, number>; semGestor: number } | null>(null)

  async function carregar() {
    const { data } = await supabase.from('rodadas').select('*, etapas:rodada_etapas(*)').order('criado_em', { ascending: false })
    setLista((data as RodadaCompleta[]) ?? [])
  }
  useEffect(() => {
    carregar()
    supabase.from('pessoas').select('gestor_id, perfil:perfis(nome)').eq('ativo', true).not('perfil_id', 'is', null).then(({ data }) => {
      const p = (data as unknown as { gestor_id: string | null; perfil: { nome: string } }[]) ?? []
      const porPerfil: Record<string, number> = {}
      p.forEach((x) => { porPerfil[x.perfil.nome] = (porPerfil[x.perfil.nome] ?? 0) + 1 })
      setContagem({ total: p.length, porPerfil, semGestor: p.filter((x) => !x.gestor_id).length })
    })
  }, [])

  function escolherTipo(t: TipoRodada) {
    setTipo(t)
    setNome(`${TIPO_RODADA[t]} ${ano}`)
  }
  useEffect(() => { setNome(`${TIPO_RODADA[tipo]} ${ano}`) }, [ano])

  async function salvar(abrir: boolean) {
    setMsg(null)
    if (salvando) return
    if (lista.some((r) => r.nome.trim().toLowerCase() === nome.trim().toLowerCase())) {
      return setMsg({ t: `Já existe uma rodada chamada "${nome}". Use outro nome (ex.: "${nome} – simulação").`, c: 'erro' })
    }
    setSalvando(true)
    try { await salvarRodada(abrir) } finally { setSalvando(false) }
  }

  async function salvarRodada(abrir: boolean) {
    // As etapas organizam a ordem da rodada; a EMAIS não trabalha com datas, então usamos a data de hoje como registro.
    const hoje = new Date().toISOString().slice(0, 10)
    const etapas: Etapa[] = ETAPAS[tipo].map((e) => ({ ...e, inicio: hoje, fim: hoje }))
    const { data: r, error } = await supabase.from('rodadas').insert({
      nome, tipo, ano,
      escala_nota_id: tipo === 'avaliativo' ? (await supabase.from('escalas').select('id').eq('codigo', 'competencia').single()).data?.id : null,
    }).select('id').single()
    if (error || !r) return setMsg({ t: error?.message ?? 'Erro ao criar a rodada', c: 'erro' })
    await supabase.from('rodada_etapas').insert(etapas.map((e) => ({ rodada_id: r.id, ordem: e.ordem, codigo: e.codigo, nome: e.nome, inicio: e.inicio, fim: e.fim })))
    const { data: forms } = await supabase.from('formularios').select('id, perfil_id').eq('tipo_rodada', tipo).eq('ativo', true)
    await supabase.from('rodada_formularios').insert(((forms as { id: number; perfil_id: number | null }[]) ?? []).map((f) => ({ rodada_id: r.id, perfil_id: f.perfil_id, formulario_id: f.id })))
    if (abrir) await abrirRodada(r.id)
    else setMsg({ t: 'Rascunho salvo. Abra a rodada quando estiver pronta.', c: 'ok' })
    carregar()
  }

  async function abrirRodada(id: string) {
    try {
      const r = await rpc<{ participantes: number; avaliacoes: number }>('abrir_rodada', { p_rodada: id })
      setMsg({ t: `Rodada aberta: ${r.participantes} participantes e ${r.avaliacoes} formulários gerados. Os avisos saem pelo n8n.`, c: 'ok' })
      carregar()
    } catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }

  async function avancarEtapa(r: RodadaCompleta) {
    const ord = [...r.etapas].sort((a, b) => a.ordem - b.ordem)
    const atual = ord.findIndex((e) => e.status === 'aberta')
    if (atual >= 0) await supabase.from('rodada_etapas').update({ status: 'fechada' }).eq('id', ord[atual].id!)
    if (ord[atual + 1]) await supabase.from('rodada_etapas').update({ status: 'aberta' }).eq('id', ord[atual + 1].id!)
    else {
      await supabase.from('rodadas').update({ status: 'encerrada' }).eq('id', r.id)
      // Ciclo Avaliativo: ao encerrar, as notas e faixas já ficam calculadas para liberar em Resultados
      if (r.tipo === 'avaliativo') {
        try { await rpc('calcular_resultados', { p_rodada: r.id }); setMsg({ t: `Rodada encerrada e resultados calculados. Libere as devolutivas em Resultados.`, c: 'ok' }) }
        catch (e) { setMsg({ t: 'Rodada encerrada, mas o cálculo falhou: ' + (e as Error).message, c: 'erro' }) }
      } else setMsg({ t: 'Rodada encerrada.', c: 'ok' })
    }
    carregar()
  }

  return (
    <>
      <div className="cabecalho"><div><div className="migalha">Visão RH</div><h1>Rodadas</h1></div></div>
      {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}

      <section className="card">
        <h2>Nova rodada</h2>
        <div role="radiogroup" className="grade" style={{ ['--min' as string]: '220px' }}>
          {(Object.keys(TIPO_RODADA) as TipoRodada[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tipo === t} onClick={() => escolherTipo(t)}
              style={{ minHeight: 90, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', textAlign: 'left', borderWidth: tipo === t ? 2 : 1, borderColor: tipo === t ? 'var(--verde-escuro)' : undefined, background: tipo === t ? 'var(--ok-bg)' : '#fff' }}>
              <span style={{ color: 'var(--texto)' }}>{TIPO_RODADA[t]}</span>
              <span className="muted" style={{ fontWeight: 400 }}>{DESCRICAO[t]}</span>
            </button>
          ))}
        </div>
        <div className="grade" style={{ ['--min' as string]: '220px' }}>
          <label className="campo">Nome da rodada<input value={nome} onChange={(e) => setNome(e.target.value)} /></label>
          <label className="campo">Ano de referência<input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} /></label>
        </div>
        {contagem && (
          <div className="aviso neutro">
            Ao abrir, o sistema tira a foto de hoje: <strong>{contagem.total} pessoas</strong> com cargo, área, gestor e perfil congelados ({Object.entries(contagem.porPerfil).map(([k, v]) => `${k}: ${v}`).join(' · ')}).
            {contagem.semGestor > 0 && <> <strong>{contagem.semGestor} sem gestor</strong> não terão avaliação do gestor.</>}
          </div>
        )}
        <div className="linha">
          <button className="primario" disabled={salvando} onClick={() => salvar(true)}>{salvando ? 'Abrindo…' : 'Abrir rodada e avisar'}</button>
          <button disabled={salvando} onClick={() => salvar(false)}>Salvar rascunho</button>
        </div>
      </section>

      <section className="card">
        <h2>Rodadas</h2>
        <div className="tabela-box"><table>
          <thead><tr><th>Rodada</th><th>Tipo</th><th>Situação</th><th>Etapa atual</th><th>Aberta em</th><th></th></tr></thead>
          <tbody>{lista.map((r) => {
            const atual = r.etapas.find((e) => e.status === 'aberta')
            return (
              <tr key={r.id}>
                <td><strong>{r.nome}</strong></td><td>{TIPO_RODADA[r.tipo]}</td>
                <td><span className={`pill ${STATUS_RODADA[r.status][1]}`}>{STATUS_RODADA[r.status][0]}</span></td>
                <td>{atual ? atual.nome : '—'}</td><td>{data(r.foto_em)}</td>
                <td className="linha" style={{ justifyContent: 'flex-end' }}>
                  {r.status === 'rascunho' && <button className="primario pequeno" onClick={() => abrirRodada(r.id)}>Abrir</button>}
                  {r.status === 'aberta' && <>
                    <Link className="botao pequeno" to={`/rh/acompanhamento?rodada=${r.id}`}>Pendências</Link>
                    <button className="pequeno" onClick={() => avancarEtapa(r)}>{r.etapas.findIndex((e) => e.status === 'aberta') === r.etapas.length - 1 ? 'Encerrar rodada' : 'Fechar etapa'}</button>
                  </>}
                  {r.tipo === 'avaliativo' && r.status !== 'rascunho' && <Link className="botao pequeno" to={`/rh/resultados?rodada=${r.id}`}>Resultados</Link>}
                </td>
              </tr>
            )
          })}</tbody>
        </table></div>
      </section>
    </>
  )
}
