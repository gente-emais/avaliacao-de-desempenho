import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, rpc, type Grupo, type StatusAvaliacao, type TipoRodada } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { GRUPO, STATUS, dataHora, umAceite } from '../../lib/format'

interface Pergunta {
  id: number; ordem: number; texto: string; tipo: 'escala' | 'aberta' | 'sim_nao' | 'escolha'
  escala_id: number | null; opcoes: string[] | null; obrigatoria: boolean; pede_evidencia: boolean
  evidencia_rotulo: string | null; pergunta_mae_id: number | null; condicao_valor: string | null
  min_caracteres: number; min_palavras: number; ativa: boolean
}
interface Bloco { ordem: number; entra_na_nota: boolean; bloco: { id: number; nome: string; tipo: string; perguntas: Pergunta[] } }
interface Resposta { pergunta_id: number; valor: number | null; opcao: string | null; texto: string | null; evidencia: string | null }
interface Avaliacao {
  id: string; grupo: Grupo; status: StatusAvaliacao; formulario_id: number; avaliado_id: string; avaliador_id: string
  enviada_em: string | null; concluida_em: string | null
  rodada: { id: string; nome: string; tipo: TipoRodada; status: string }
  avaliado: { nome: string; cargo: string | null; acesso_assistido: boolean }
  avaliador: { nome: string; gestor_id: string | null }
  aceite: { aceito_em: string; em_nome_de: boolean } | { aceito_em: string; em_nome_de: boolean }[] | null
}
interface Opcao { escala_id: number; valor: number; rotulo: string }
type Mapa = Record<number, Resposta>

const vazia = (pid: number): Resposta => ({ pergunta_id: pid, valor: null, opcao: null, texto: null, evidencia: null })
const palavras = (t: string | null) => (t ?? '').trim().split(/\s+/).filter((w) => /\p{L}{2,}/u.test(w)).length

export default function Formulario() {
  const { id } = useParams()
  const nav = useNavigate()
  const { eu } = useAuth()
  const [av, setAv] = useState<Avaliacao | null>(null)
  const [blocos, setBlocos] = useState<Bloco[]>([])
  const [opcoes, setOpcoes] = useState<Opcao[]>([])
  const [resp, setResp] = useState<Mapa>({})
  const [auto, setAuto] = useState<Mapa>({})
  const [registroGestor, setRegistroGestor] = useState<{ texto: string; data: string | null } | null>(null)
  const [faltando, setFaltando] = useState<{ pergunta_id: number; bloco: string; pergunta: string; motivo: string }[]>([])
  const [salvoEm, setSalvoEm] = useState<string>('')
  const [erro, setErro] = useState('')
  const [notaRevisao, setNotaRevisao] = useState<number | null>(null)
  const [ajuste, setAjuste] = useState('')
  const [faixasRev, setFaixasRev] = useState<{ nome: string; minimo: number; maximo: number }[]>([])
  const [comentario, setComentario] = useState('')
  const timers = useRef<Record<number, number>>({})

  useEffect(() => {
    async function carregar() {
      const { data: a, error } = await supabase.from('avaliacoes').select(`id, grupo, status, formulario_id, avaliado_id, avaliador_id, enviada_em, concluida_em,
        rodada:rodadas(id, nome, tipo, status),
        avaliado:pessoas!avaliacoes_avaliado_id_fkey(nome, cargo, acesso_assistido),
        avaliador:pessoas!avaliacoes_avaliador_id_fkey(nome, gestor_id),
        aceite:aceites(aceito_em, em_nome_de)`).eq('id', id).maybeSingle()
      if (error || !a) { setErro('Avaliação não encontrada ou sem permissão.'); return }
      const aval = a as unknown as Avaliacao
      setAv(aval)
      const [b, o, r] = await Promise.all([
        supabase.from('formulario_blocos').select('ordem, entra_na_nota, bloco:blocos(id, nome, tipo, perguntas(*))')
          .eq('formulario_id', aval.formulario_id).eq('grupo', aval.grupo).order('ordem'),
        supabase.from('escala_opcoes').select('escala_id, valor, rotulo').order('ordem'),
        supabase.from('respostas').select('pergunta_id, valor, opcao, texto, evidencia').eq('avaliacao_id', aval.id),
      ])
      const bl = ((b.data as unknown as Bloco[]) ?? []).map((x) => ({
        ...x, bloco: { ...x.bloco, perguntas: x.bloco.perguntas.filter((p) => p.ativa).sort((p, q) => p.ordem - q.ordem) },
      }))
      setBlocos(bl)
      setOpcoes((o.data as Opcao[]) ?? [])
      setResp(Object.fromEntries(((r.data as Resposta[]) ?? []).map((x) => [x.pergunta_id, x])))

      // Gestor vê a autoavaliação ao lado (Ciclo Avaliativo)
      if (aval.grupo === 'gestor' && aval.rodada.tipo === 'avaliativo') {
        const { data: aa } = await supabase.from('avaliacoes').select('id').eq('rodada_id', aval.rodada.id)
          .eq('avaliado_id', aval.avaliado_id).eq('grupo', 'auto').maybeSingle()
        if (aa) {
          const { data: ra } = await supabase.from('respostas').select('pergunta_id, valor, opcao, texto, evidencia').eq('avaliacao_id', aa.id)
          setAuto(Object.fromEntries(((ra as Resposta[]) ?? []).map((x) => [x.pergunta_id, x])))
        }
      }
      // Colaborador vê o que o gestor registrou antes de responder o feedback
      if (aval.grupo === 'auto' && aval.rodada.tipo === 'feedback') {
        const { data: ag } = await supabase.from('avaliacoes').select('id, enviada_em, respostas(texto)')
          .eq('rodada_id', aval.rodada.id).eq('avaliado_id', aval.avaliado_id).eq('grupo', 'gestor').maybeSingle()
        const texto = (ag as { respostas: { texto: string }[] } | null)?.respostas?.[0]?.texto
        if (ag && texto) setRegistroGestor({ texto, data: (ag as { enviada_em: string | null }).enviada_em })
      }
      // Revisão do gestor acima
      if (aval.status === 'enviada' && aval.avaliador.gestor_id === eu?.id) {
        setNotaRevisao(await rpc<number>('nota_da_avaliacao', { p_avaliacao: aval.id, p_so_nota: true }))
        const { data: fx } = await supabase.from('faixas_classificacao').select('nome, minimo, maximo').eq('rodada_id', aval.rodada.id).order('ordem')
        setFaixasRev(((fx as { nome: string; minimo: number; maximo: number }[]) ?? []).map((f) => ({ ...f, minimo: Number(f.minimo), maximo: Number(f.maximo) })))
      }
    }
    carregar()
  }, [id, eu?.id])

  const editavel = !!av && av.avaliador_id === eu?.id && ['pendente', 'em_andamento'].includes(av.status) && av.rodada.status === 'aberta'
  const revisando = !!av && av.status === 'enviada' && av.avaliador.gestor_id === eu?.id
  const rotulos = useMemo(() => {
    const m: Record<number, Opcao[]> = {}
    opcoes.forEach((o) => { (m[o.escala_id] ||= []).push(o) })
    return m
  }, [opcoes])

  const visivel = (p: Pergunta) => !p.pergunta_mae_id || resp[p.pergunta_mae_id]?.opcao === p.condicao_valor
  const total = blocos.flatMap((b) => b.bloco.perguntas).filter((p) => p.obrigatoria && visivel(p))
  const respondidas = total.filter((p) => {
    const r = resp[p.id]
    return p.tipo === 'escala' ? r?.valor != null : p.tipo === 'aberta' ? (r?.texto ?? '').trim().length > 0 : !!r?.opcao
  })

  function alterar(pid: number, campo: keyof Resposta, valor: string | number | null) {
    if (!editavel || !av) return
    const nova = { ...(resp[pid] ?? vazia(pid)), [campo]: valor }
    setResp((r) => ({ ...r, [pid]: nova }))
    window.clearTimeout(timers.current[pid])
    timers.current[pid] = window.setTimeout(async () => {
      const { error } = await supabase.from('respostas').upsert(
        { avaliacao_id: av.id, pergunta_id: pid, valor: nova.valor, opcao: nova.opcao, texto: nova.texto, evidencia: nova.evidencia },
        { onConflict: 'avaliacao_id,pergunta_id' })
      if (error) setErro('Não foi possível salvar. Verifique sua conexão.')
      else setSalvoEm(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }))
    }, campo === 'texto' || campo === 'evidencia' ? 700 : 0)
  }

  async function enviar() {
    if (!av) return
    setErro(''); setFaltando([])
    await new Promise((r) => setTimeout(r, 800)) // garante que o último salvamento terminou
    try {
      const r = await rpc<{ ok: boolean; status?: string; faltando?: typeof faltando }>('enviar_avaliacao', { p_avaliacao: av.id })
      if (!r.ok) { setFaltando(r.faltando ?? []); window.scrollTo({ top: 0, behavior: 'smooth' }); return }
      nav('/', { replace: true })
    } catch (e) { setErro((e as Error).message) }
  }

  async function revisar() {
    if (!av) return
    // ajuste por faixa: grava o início da faixa escolhida (sem mostrar números)
    const valor = ajuste ? faixasRev.find((f) => f.nome === ajuste)?.minimo ?? null : null
    try {
      await rpc('revisar_avaliacao', { p_avaliacao: av.id, p_nota_ajustada: valor, p_comentario: comentario || null })
      nav('/', { replace: true })
    } catch (e) { setErro((e as Error).message) }
  }

  async function aceitar() {
    if (!av) return
    try { await rpc('dar_aceite', { p_avaliacao: av.id }); location.reload() } catch (e) { setErro((e as Error).message) }
  }

  if (erro && !av) return <div className="aviso erro">{erro}</div>
  if (!av) return <p>Carregando…</p>

  const titulo = av.rodada.tipo === 'contratacao' ? `Contratação de Desempenho · ${av.avaliado.nome}`
    : av.rodada.tipo === 'feedback' ? (av.grupo === 'gestor' ? `Feedback de ${av.avaliado.nome}` : 'Feedback recebido')
    : av.grupo === 'auto' ? 'Autoavaliação e pré-work'
    : av.grupo === 'lider' ? `Avaliação do seu gestor · ${av.avaliado.nome}`
    : `${GRUPO[av.grupo]} · ${av.avaliado.nome}`
  const pct = total.length ? Math.round((respondidas.length / total.length) * 100) : 0
  const podeAceitar = av.rodada.tipo === 'contratacao' && av.status === 'concluida' && !umAceite(av.aceite) &&
    (av.avaliado_id === eu?.id || (av.avaliador_id === eu?.id && av.avaliado.acesso_assistido))

  const faixaCalc = notaRevisao == null ? null : faixasRev.find((f) => Math.round(notaRevisao * 100) / 100 >= f.minimo && Math.round(notaRevisao * 100) / 100 <= f.maximo)?.nome ?? null
  return (
    <>
      <div className="cabecalho">
        <div>
          <Link to="/" className="migalha">← O que fazer agora</Link>
          <h1>{titulo}</h1>
          <p className="muted">{av.rodada.nome}{av.avaliado.cargo ? ` · ${av.avaliado.cargo}` : ''}{av.avaliado.acesso_assistido && av.grupo === 'gestor' ? ' · preenchimento assistido pelo gestor' : ''}</p>
        </div>
        {editavel ? (
          <div style={{ minWidth: 220 }}>
            <div className="muted" style={{ fontWeight: 600 }}>{respondidas.length} de {total.length} obrigatórias</div>
            <div className="barra"><div style={{ width: `${pct}%` }} /></div>
          </div>
        ) : <span className={`pill ${STATUS[av.status].classe}`}>{STATUS[av.status].rotulo}</span>}
      </div>

      {erro && <div className="aviso erro">{erro}</div>}
      {faltando.length > 0 && (
        <div className="aviso erro">
          <strong>Faltam {faltando.length} itens para enviar:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {faltando.slice(0, 8).map((f) => <li key={f.pergunta_id + f.motivo}><a href={`#p${f.pergunta_id}`}>{f.bloco}: {f.motivo}</a></li>)}
          </ul>
        </div>
      )}
      {registroGestor && (
        <section className="card">
          <h2>O que seu gestor registrou</h2>
          <p style={{ whiteSpace: 'pre-line', lineHeight: 1.6 }}>{registroGestor.texto}</p>
          <span className="muted">Registrado em {dataHora(registroGestor.data)}</span>
        </section>
      )}
      {umAceite(av.aceite) && <div className="aviso ok">Aceite registrado em {dataHora(umAceite(av.aceite)!.aceito_em)}{umAceite(av.aceite)!.em_nome_de ? ' pelo gestor, em nome do colaborador' : ''}.</div>}
      {podeAceitar && (
        <div className="aviso info linha entre">
          <span>Leia a contratação abaixo e confirme.</span>
          <button className="primario" onClick={aceitar}>Li e estou ciente</button>
        </div>
      )}

      {blocos.map((b) => (
        <section className="card" key={b.bloco.id + '-' + b.ordem}>
          <div className="linha entre">
            <h2>{b.bloco.nome.replace(/ - .*$/, '')}</h2>
            {b.entra_na_nota && <span className="pill info">Entra na nota</span>}
          </div>
          {b.bloco.perguntas.filter(visivel).map((p) => {
            const r = resp[p.id] ?? vazia(p.id)
            const ref = auto[p.id]
            const ops = p.escala_id ? rotulos[p.escala_id] ?? [] : []
            return (
              <fieldset key={p.id} id={`p${p.id}`} className="pergunta" style={{ border: 0, margin: 0, padding: undefined }}>
                <legend className="pergunta-texto">{p.texto}{!p.obrigatoria && <span className="muted"> (opcional)</span>}</legend>
                {p.tipo === 'escala' && (
                  <div className="escala" role="radiogroup" style={{ ['--n' as string]: ops.length }}>
                    {ops.map((o) => (
                      <button key={o.valor} type="button" role="radio" aria-checked={r.valor === Number(o.valor)} disabled={!editavel}
                        className={r.valor === Number(o.valor) ? 'sel' : ''} onClick={() => alterar(p.id, 'valor', Number(o.valor))}>
                        {o.rotulo}
                      </button>
                    ))}
                  </div>
                )}
                {(p.tipo === 'sim_nao' || p.tipo === 'escolha') && (
                  <div className="opcoes" role="radiogroup">
                    {(p.opcoes ?? []).map((o) => (
                      <button key={o} type="button" role="radio" aria-checked={r.opcao === o} disabled={!editavel}
                        className={r.opcao === o ? 'sel' : ''} onClick={() => alterar(p.id, 'opcao', o)}>{o}</button>
                    ))}
                  </div>
                )}
                {p.tipo === 'aberta' && (
                  <CampoTexto valor={r.texto} min={p.min_caracteres} minP={p.min_palavras} obrigatorio={p.obrigatoria} editavel={editavel}
                    onChange={(v) => alterar(p.id, 'texto', v)} rotulo={p.texto} />
                )}
                {p.pede_evidencia && (
                  <label className="campo" style={{ fontWeight: 500 }}>{p.evidencia_rotulo}
                    <CampoTexto valor={r.evidencia} min={p.min_caracteres} minP={p.min_palavras} obrigatorio={p.obrigatoria} editavel={editavel}
                      onChange={(v) => alterar(p.id, 'evidencia', v)} rotulo={p.evidencia_rotulo ?? 'Evidências'} />
                  </label>
                )}
                {ref && p.tipo === 'escala' && ref.valor != null && (
                  <span className="auto-ref">Autoavaliação: {ops.find((o) => Number(o.valor) === Number(ref.valor))?.rotulo}{ref.evidencia ? ` — "${ref.evidencia}"` : ''}</span>
                )}
                {ref && p.tipo === 'aberta' && ref.texto && <span className="auto-ref">Autoavaliação: "{ref.texto}"</span>}
              </fieldset>
            )
          })}
        </section>
      ))}

      {editavel && (
        <div className="card linha entre" style={{ flexDirection: 'row' }}>
          <span className="muted">{salvoEm ? `Salvo automaticamente às ${salvoEm}` : 'As respostas são salvas automaticamente.'}</span>
          <div className="linha">
            <Link className="botao" to="/">Continuar depois</Link>
            <button className="primario" onClick={enviar}>Enviar</button>
          </div>
        </div>
      )}

      {revisando && (
        <section className="card">
          <h2>Revisão da nota</h2>
          <p>Classificação pela avaliação de {av.avaliador.nome}: <strong>{faixaCalc ?? '—'}</strong></p>
          <div className="grade" style={{ ['--min' as string]: '220px' }}>
            <label className="campo">Ajustar a classificação (opcional)<small>Deixe como está para manter. A original fica registrada.</small>
              <select value={ajuste} onChange={(e) => setAjuste(e.target.value)}>
                <option value="">Manter {faixaCalc ?? ''}</option>
                {faixasRev.filter((f) => f.nome !== faixaCalc).map((f) => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
              </select>
            </label>
            <label className="campo">Comentário da revisão
              <textarea rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
            </label>
          </div>
          <div><button className="primario" onClick={revisar}>{ajuste ? 'Salvar ajuste e concluir' : 'Confirmar classificação'}</button></div>
        </section>
      )}
    </>
  )
}

function CampoTexto(props: { valor: string | null; min: number; minP: number; obrigatorio: boolean; editavel: boolean; rotulo: string; onChange: (v: string) => void }) {
  const t = props.valor ?? ''
  const ok = t.trim().length >= props.min && palavras(t) >= props.minP
  return (
    <>
      <textarea aria-label={props.rotulo} rows={3} value={t} disabled={!props.editavel} onChange={(e) => props.onChange(e.target.value)} />
      {props.editavel && props.obrigatorio && (
        <span className="muted" style={{ color: ok ? 'var(--ok)' : undefined }}>
          {ok ? 'Resposta completa' : `Escreva uma resposta desenvolvida: ${t.trim().length}/${props.min} caracteres, ${palavras(t)}/${props.minP} palavras`}
        </span>
      )}
    </>
  )
}
