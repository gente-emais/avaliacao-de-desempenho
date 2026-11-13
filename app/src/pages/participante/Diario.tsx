import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, nomesPorId } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { data as dataBr } from '../../lib/format'

// Diário de bordo: o colaborador registra entregas e contribuições só para ele (o gestor não vê).
// O gestor pode fazer registros no diário do liderado (reconhecimentos, pontos de melhoria): o liderado vê esses registros.
export interface Registro {
  id: string; pessoa_id: string; autor_id: string; data: string; titulo: string; descricao: string | null; tipo: string
  competencia_id: number | null; link: string | null; compartilhado: boolean
  comentarios: { id: string; texto: string; criado_em: string; autor: { nome: string } | null }[]
  usos: { avaliacao_id: string }[]
}
export const TIPOS: Record<string, [string, string]> = {
  entrega: ['Entrega', 'm-ok'], melhoria: ['Melhoria', 'm-lid'], reconhecimento: ['Reconhecimento', 'm-ges'], aprendizado: ['Aprendizado', 'm-alerta'],
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const SELECT_DIARIO = 'id, pessoa_id, autor_id, data, titulo, descricao, tipo, competencia_id, link, compartilhado, comentarios:diario_comentarios(id, texto, criado_em, autor:pessoas(nome)), usos:diario_usos(avaliacao_id)'

export default function Diario() {
  const { eu } = useAuth()
  const [params] = useSearchParams()
  const pessoaParam = params.get('pessoa')
  const alvo = pessoaParam ?? eu?.id ?? null
  const proprio = !pessoaParam || pessoaParam === eu?.id
  const [regs, setRegs] = useState<Registro[]>([])
  const [comps, setComps] = useState<{ id: number; nome: string }[]>([])
  const [nomeAlvo, setNomeAlvo] = useState('')
  const [autores, setAutores] = useState<Record<string, string>>({})
  const [fTipo, setFTipo] = useState('')
  const [fComp, setFComp] = useState('')
  const [tipo, setTipo] = useState(pessoaParam && pessoaParam !== eu?.id ? 'reconhecimento' : 'entrega')
  const [comp, setComp] = useState<number | null>(null)
  const [editando, setEditando] = useState<Registro | null>(null)
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)

  async function carregar() {
    if (!alvo) return
    const { data, error } = await supabase.from('diario_registros').select(SELECT_DIARIO).eq('pessoa_id', alvo).order('data', { ascending: false }).order('criado_em', { ascending: false })
    if (error) setMsg({ t: error.message, c: 'erro' })
    const l = (data as unknown as Registro[]) ?? []
    setRegs(l)
    setAutores(await nomesPorId(l.filter((r) => r.autor_id !== r.pessoa_id).map((r) => r.autor_id)))
  }
  useEffect(() => {
    carregar()
    supabase.from('competencias').select('id, nome').order('ordem').then(({ data }) => setComps((data as { id: number; nome: string }[]) ?? []))
    if (pessoaParam) supabase.from('pessoas').select('nome').eq('id', pessoaParam).maybeSingle().then(({ data }) => setNomeAlvo((data as { nome: string } | null)?.nome ?? ''))
  }, [alvo])

  const ano = new Date().getFullYear()
  const doAno = regs.filter((r) => r.data.startsWith(String(ano)))
  const lista = useMemo(() => regs.filter((r) => (!fTipo || r.tipo === fTipo) && (!fComp || String(r.competencia_id) === fComp)), [regs, fTipo, fComp])
  const porMes = useMemo(() => {
    const m: [string, Registro[]][] = []
    lista.forEach((r) => { const k = `${MESES[Number(r.data.slice(5, 7)) - 1]} ${r.data.slice(0, 4)}`; const g = m.find((x) => x[0] === k); if (g) g[1].push(r); else m.push([k, [r]]) })
    return m
  }, [lista])
  const nomeComp = (id: number | null) => comps.find((c) => c.id === id)?.nome

  function editar(r: Registro) { setEditando(r); setTipo(r.tipo); setComp(r.competencia_id); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function limpar(f?: HTMLFormElement) { setEditando(null); setTipo(proprio ? 'entrega' : 'reconhecimento'); setComp(null); f?.reset() }

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const f = new FormData(form)
    const dados = {
      titulo: String(f.get('titulo') ?? '').trim(), descricao: String(f.get('descricao') ?? '').trim() || null,
      data: String(f.get('data') || new Date().toISOString().slice(0, 10)), link: String(f.get('link') ?? '').trim() || null,
      tipo, competencia_id: comp, compartilhado: !proprio,
    }
    if (dados.titulo.length < 3) return setMsg({ t: 'Escreva o que aconteceu.', c: 'erro' })
    const { error } = editando
      ? await supabase.from('diario_registros').update({ ...dados, atualizado_em: new Date().toISOString() }).eq('id', editando.id)
      : await supabase.from('diario_registros').insert({ ...dados, pessoa_id: alvo, autor_id: eu!.id })
    if (error) return setMsg({ t: error.message, c: 'erro' })
    setMsg({ t: editando ? 'Registro atualizado.' : proprio ? 'Registro salvo no seu diário de bordo.' : `Registro salvo no diário de ${nomeAlvo.split(' ')[0]}. Ela(e) já consegue ver.`, c: 'ok' })
    limpar(form); carregar()
  }
  async function apagar(r: Registro) {
    if (r.usos.length) return setMsg({ t: 'Esse registro já foi usado como evidência numa avaliação e não pode ser apagado.', c: 'erro' })
    if (!window.confirm(`Apagar "${r.titulo}"?`)) return
    const { error } = await supabase.from('diario_registros').delete().eq('id', r.id)
    if (error) setMsg({ t: error.message, c: 'erro' }); else carregar()
  }
  async function comentar(r: Registro, texto: string) {
    if (texto.trim().length < 2) return
    const { error } = await supabase.from('diario_comentarios').insert({ registro_id: r.id, autor_id: eu!.id, texto: texto.trim() })
    if (error) setMsg({ t: error.message, c: 'erro' }); else carregar()
  }

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Meu espaço</div><h1>{proprio ? 'Diário de bordo' : `Diário de bordo de ${nomeAlvo}`}</h1></div>
      </div>
      <p className="muted" style={{ maxWidth: 900 }}>
        {proprio
          ? 'Registre suas entregas e contribuições ao longo do ano e use como fatos e dados na sua autoavaliação. Seus registros são só seus: seu gestor não vê. Os registros que o seu gestor fizer para você também aparecem aqui.'
          : `Aqui ficam as anotações que você faz sobre ${nomeAlvo.split(' ')[0] || 'a pessoa'} ao longo do ano, como reconhecimentos e pontos de melhoria. A pessoa vê o que você registra. Os registros que ela faz no próprio diário são privados.`}
      </p>
      {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}

      <div className="grade" style={{ ['--min' as string]: '160px' }}>
        <div className="kpi-filtro"><span className="muted">Registros em {ano}</span><b>{doAno.length}</b></div>
        <div className="kpi-filtro"><span className="muted">Feitos por você</span><b>{doAno.filter((r) => r.autor_id === eu?.id).length}</b></div>
        <div className="kpi-filtro"><span className="muted">{proprio ? 'Feitos pelo seu gestor' : 'Comentados pela pessoa'}</span><b>{proprio ? doAno.filter((r) => r.autor_id !== r.pessoa_id).length : doAno.filter((r) => r.comentarios.length).length}</b></div>
        <div className="kpi-filtro"><span className="muted">Usados como evidência</span><b>{doAno.filter((r) => r.usos.length).length}</b></div>
      </div>

      <div className="diario">
        {(
          <form className="card" onSubmit={salvar} key={editando?.id ?? 'novo'}>
            <h2>{editando ? 'Editar registro' : proprio ? 'Novo registro' : `Novo registro para ${nomeAlvo.split(' ')[0] || 'a pessoa'}`}</h2>
            <span className="muted">{proprio ? `No seu diário · ${eu?.nome ?? ''}` : `Registrado por você (${eu?.nome ?? ''}) no diário de ${nomeAlvo}`}</span>
            <label className="campo">O que aconteceu<input name="titulo" defaultValue={editando?.titulo} placeholder={proprio ? 'Ex.: Reduzi o retrabalho no controle de medições' : 'Ex.: Conduziu muito bem a entrega do loteamento X'} required /></label>
            <label className="campo">Conte com fatos e dados<textarea name="descricao" rows={4} defaultValue={editando?.descricao ?? ''} placeholder={proprio ? 'O que você fez, o resultado e como dá para comprovar' : 'O que você observou, o impacto e o que espera daqui para frente'} /></label>
            <div className="campo">Tipo
              <div className="linha">{Object.entries(TIPOS).map(([k, [t]]) => <button key={k} type="button" className={`chip${tipo === k ? ' on' : ''}`} aria-pressed={tipo === k} onClick={() => setTipo(k)}>{t}</button>)}</div>
            </div>
            <div className="campo">Competência relacionada
              <div className="linha">{comps.map((c) => <button key={c.id} type="button" className={`chip${comp === c.id ? ' on' : ''}`} aria-pressed={comp === c.id} onClick={() => setComp(comp === c.id ? null : c.id)}>{c.nome}</button>)}</div>
            </div>
            <div className="grade" style={{ ['--min' as string]: '160px' }}>
              <label className="campo">Data<input name="data" type="date" defaultValue={editando?.data ?? new Date().toISOString().slice(0, 10)} /></label>
              <label className="campo">Link (opcional)<input name="link" type="url" defaultValue={editando?.link ?? ''} placeholder="https://…" /></label>
            </div>
            <span className="muted">{proprio ? 'Só você vê este registro.' : `Este registro fica visível para ${nomeAlvo.split(' ')[0] || 'a pessoa'}.`}</span>
            <div className="linha">
              <button className="primario">{editando ? 'Salvar alterações' : 'Salvar registro'}</button>
              {editando && <button type="button" onClick={() => limpar()}>Cancelar</button>}
            </div>
          </form>
        )}

        <section style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div className="linha entre">
            <div className="linha">
              <button className={`chip${!fTipo ? ' on' : ''}`} onClick={() => setFTipo('')}>Todos</button>
              {Object.entries(TIPOS).map(([k, [t]]) => <button key={k} className={`chip${fTipo === k ? ' on' : ''}`} onClick={() => setFTipo(fTipo === k ? '' : k)}>{t}</button>)}
            </div>
            <select value={fComp} onChange={(e) => setFComp(e.target.value)} aria-label="Competência"><option value="">Todas as competências</option>{comps.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </div>
          {porMes.length === 0 && <div className="card"><p className="muted">{proprio ? 'Nenhum registro ainda. Comece pela sua entrega mais recente.' : 'Você ainda não fez anotações para essa pessoa.'}</p></div>}
          {porMes.map(([mes, rs]) => (
            <div key={mes} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="mes-titulo">{mes}</div>
              {rs.map((r) => <CartaoRegistro key={r.id} r={r} comp={nomeComp(r.competencia_id)} meu={r.autor_id === eu?.id} autor={r.autor_id !== r.pessoa_id ? (autores[r.autor_id] ?? 'Gestor') : null} quem={r.autor_id !== r.pessoa_id ? (autores[r.autor_id] ?? 'Gestor') : proprio ? null : nomeAlvo} proprio={proprio} onEditar={() => editar(r)} onApagar={() => apagar(r)} onComentar={(t) => comentar(r, t)} />)}
            </div>
          ))}
        </section>
      </div>
    </>
  )
}

function CartaoRegistro({ r, comp, meu, autor, quem, proprio, onEditar, onApagar, onComentar }: {
  r: Registro; comp?: string; meu: boolean; autor: string | null; quem: string | null; proprio: boolean; onEditar: () => void; onApagar: () => void; onComentar: (t: string) => void
}) {
  const [texto, setTexto] = useState('')
  return (
    <article className={`registro${autor ? ' do-gestor' : ''}`}>
      <div className="linha entre">
        <div className="linha"><span className={`marcador ${TIPOS[r.tipo]?.[1]}`}>{TIPOS[r.tipo]?.[0]}</span>{comp && <span className="marcador m-comp">{comp}</span>}{quem && <span className={`marcador ${autor ? 'm-rh' : 'm-comp'}`}>Registrado por {quem}</span>}</div>
        <span className="muted">{dataBr(r.data)}</span>
      </div>
      <h3>{r.titulo}</h3>
      {r.descricao && <p style={{ whiteSpace: 'pre-line', fontSize: 14 }}>{r.descricao}</p>}
      {r.link && <a href={r.link} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Abrir link</a>}
      {r.comentarios.sort((a, b) => a.criado_em.localeCompare(b.criado_em)).map((c) => (
        <div key={c.id} className="comentario-gestor"><b>{c.autor?.nome ?? 'Gestor'}</b><span>{c.texto}</span></div>
      ))}
      <div className="linha entre">
        <span className="muted">{autor ? (proprio ? 'Registro do seu gestor' : 'Seu registro, visível para a pessoa') : 'Só você vê'}{r.usos.length ? ' · usado como evidência' : ''}</span>
        {meu && <div className="linha"><button className="pequeno" onClick={onEditar}>Editar</button>{!r.usos.length && <button className="pequeno" onClick={onApagar}>Apagar</button>}</div>}
      </div>
      {!meu && (
        <form className="linha" onSubmit={(e) => { e.preventDefault(); onComentar(texto); setTexto('') }}>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Comentar este registro" aria-label="Comentário" style={{ flex: '1 1 240px' }} />
          <button className="pequeno">Comentar</button>
        </form>
      )}
    </article>
  )
}
