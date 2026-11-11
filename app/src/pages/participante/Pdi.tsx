import { useEffect, useState, type FormEvent } from 'react'
import AbasMeuEspaco from '../../components/AbasMeuEspaco'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, PESSOA_COLS, type Pessoa } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { data } from '../../lib/format'

interface Tarefa { id: string; nome: string; concluida: boolean; ordem: number }
interface Objetivo {
  id: string; pessoa_id: string; ano: number; tipo: 'carreira' | 'desenvolvimento'; nome: string; descricao: string | null
  inicio: string; fim: string; carga_horaria: number | null; status: 'nao_iniciado' | 'em_andamento' | 'concluido'
  competencia: { nome: string } | null; tarefas: Tarefa[]; comentarios: { id: string; texto: string; criado_em: string; autor: { nome: string } }[]
}
const STATUS_PDI = { nao_iniciado: ['Não iniciado', 'neutro'], em_andamento: ['Em andamento', 'pend'], concluido: ['Concluído', 'ok'] } as const
const ANO = new Date().getFullYear()

export default function Pdi() {
  const { eu, temEquipe } = useAuth()
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [alvo, setAlvo] = useState<string>('')
  const [todos, setTodos] = useState<Objetivo[]>([])
  const [comps, setComps] = useState<{ id: number; nome: string }[]>([])
  const [novo, setNovo] = useState(false)
  const [erro, setErro] = useState('')
  const [params] = useSearchParams()
  const anoSel = params.get('ano') ? Number(params.get('ano')) : null

  useEffect(() => {
    if (!eu) return
    setAlvo(eu.id)
    supabase.from('competencias').select('id, nome').order('ordem').then(({ data }) => setComps(data ?? []))
    if (temEquipe) supabase.from('pessoas').select(PESSOA_COLS).eq('gestor_id', eu.id).eq('ativo', true).order('nome').then(({ data }) => setPessoas((data as Pessoa[]) ?? []))
  }, [eu?.id, temEquipe])

  async function carregar() {
    if (!alvo) return
    const { data } = await supabase.from('pdi_objetivos')
      .select('*, competencia:competencias(nome), tarefas:pdi_tarefas(id, nome, concluida, ordem), comentarios:pdi_comentarios(id, texto, criado_em, autor:pessoas(nome))')
      .eq('pessoa_id', alvo).order('inicio')
    setTodos((data as unknown as Objetivo[]) ?? [])
  }
  useEffect(() => { carregar() }, [alvo])
  const objs = anoSel ? todos.filter((o) => o.ano === anoSel) : todos
  const anosPdi = [...new Set(todos.map((o) => o.ano))].sort((a, b) => b - a)

  async function alternar(t: Tarefa) {
    await supabase.from('pdi_tarefas').update({ concluida: !t.concluida, concluida_em: t.concluida ? null : new Date().toISOString() }).eq('id', t.id)
    carregar()
  }
  async function novaTarefa(o: Objetivo, nome: string) {
    if (!nome.trim()) return
    await supabase.from('pdi_tarefas').insert({ objetivo_id: o.id, nome, ordem: o.tarefas.length + 1 })
    carregar()
  }
  async function status(o: Objetivo, s: Objetivo['status']) {
    await supabase.from('pdi_objetivos').update({ status: s }).eq('id', o.id); carregar()
  }
  async function comentar(o: Objetivo, texto: string) {
    if (!texto.trim() || !eu) return
    await supabase.from('pdi_comentarios').insert({ objetivo_id: o.id, autor_id: eu.id, texto }); carregar()
  }
  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!eu) return
    const f = new FormData(e.currentTarget)
    const { error } = await supabase.from('pdi_objetivos').insert({
      pessoa_id: alvo, ano: ANO, criado_por: eu.id,
      tipo: f.get('tipo'), nome: f.get('nome'), descricao: f.get('descricao') || null,
      inicio: f.get('inicio'), fim: f.get('fim'), carga_horaria: f.get('carga') ? Number(f.get('carga')) : null,
      competencia_id: f.get('competencia') ? Number(f.get('competencia')) : null,
    })
    if (error) return setErro('Confira as datas: a data final precisa ser depois da inicial.')
    setNovo(false); setErro(''); carregar()
  }

  const horas = objs.reduce((s, o) => s + Number(o.carga_horaria ?? 0), 0)
  const horasFeitas = objs.filter((o) => o.status === 'concluido').reduce((s, o) => s + Number(o.carga_horaria ?? 0), 0)
  const tarefas = objs.flatMap((o) => o.tarefas)

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Meu espaço</div><h1>PDI · Objetivos</h1></div>
        <div className="linha">
          {temEquipe && (
            <select value={alvo} onChange={(e) => setAlvo(e.target.value)} aria-label="De quem é o PDI">
              <option value={eu?.id}>Meu PDI</option>
              {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.acesso_assistido ? ' (você registra)' : ''}</option>)}
            </select>
          )}
          <button className="primario" onClick={() => setNovo(!novo)}>+ Novo objetivo</button>
        </div>
      </div>
      <AbasMeuEspaco />
      {anosPdi.length > 0 && (
        <nav className="anos" aria-label="Ano do PDI">
          <span className="muted">Ano:</span>
          <Link className={`ano${!anoSel ? ' atual' : ''}`} to="/pdi">Todos</Link>
          {anosPdi.map((a) => <Link key={a} className={`ano${anoSel === a ? ' atual' : ''}`} to={`/pdi?ano=${a}`}>{a}</Link>)}
        </nav>
      )}

      <div className="grade" style={{ ['--min' as string]: '180px' }}>
        <div className="card"><span className="muted">Objetivos</span><span className="kpi">{objs.length}</span></div>
        <div className="card"><span className="muted">Carga horária planejada</span><span className="kpi">{horas}h</span><span className="muted">{horasFeitas}h concluídas</span></div>
        <div className="card"><span className="muted">Tarefas concluídas</span><span className="kpi">{tarefas.filter((t) => t.concluida).length} de {tarefas.length}</span></div>
      </div>

      {novo && (
        <form className="card" onSubmit={criar}>
          <h2>Novo objetivo</h2>
          <div className="grade" style={{ ['--min' as string]: '200px' }}>
            <label className="campo">Nome<input name="nome" required /></label>
            <label className="campo">Tipo<select name="tipo"><option value="desenvolvimento">Desenvolvimento</option><option value="carreira">Carreira</option></select></label>
            <label className="campo">Início<input type="date" name="inicio" required /></label>
            <label className="campo">Fim<input type="date" name="fim" required /></label>
            <label className="campo">Carga horária (h)<input type="number" min="0" step="0.5" name="carga" /></label>
            <label className="campo">Competência ligada<select name="competencia"><option value="">—</option>{comps.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
          </div>
          <label className="campo">Descrição<textarea name="descricao" rows={2} /></label>
          {erro && <div className="aviso erro">{erro}</div>}
          <div className="linha"><button className="primario">Salvar</button><button type="button" onClick={() => setNovo(false)}>Cancelar</button></div>
        </form>
      )}

      {objs.length === 0 && !novo && <div className="card"><p>Nenhum objetivo ainda. Cursos, congressos e imersões entram aqui, com a carga horária.</p></div>}

      {objs.map((o) => {
        const feitas = o.tarefas.filter((t) => t.concluida).length
        return (
          <section className="card" key={o.id}>
            <div className="linha entre" style={{ alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="linha">
                  <span className={`pill ${o.tipo === 'carreira' ? 'roxo' : 'info'}`}>{o.tipo === 'carreira' ? 'Carreira' : 'Desenvolvimento'}</span>
                  <span className={`pill ${STATUS_PDI[o.status][1]}`}>{STATUS_PDI[o.status][0]}</span>
                </div>
                <h2>{o.nome}</h2>
                <span className="muted">{data(o.inicio)} a {data(o.fim)}{o.carga_horaria ? ` · ${o.carga_horaria}h` : ''}{o.competencia ? ` · Competência: ${o.competencia.nome}` : ''}</span>
                {o.descricao && <p>{o.descricao}</p>}
              </div>
              <select value={o.status} onChange={(e) => status(o, e.target.value as Objetivo['status'])} aria-label="Status do objetivo">
                <option value="nao_iniciado">Não iniciado</option><option value="em_andamento">Em andamento</option><option value="concluido">Concluído</option>
              </select>
            </div>
            <span className="muted">{feitas} de {o.tarefas.length} tarefas</span>
            {o.tarefas.sort((a, b) => a.ordem - b.ordem).map((t) => (
              <button key={t.id} onClick={() => alternar(t)} aria-pressed={t.concluida} style={{ justifyContent: 'flex-start', background: t.concluida ? 'var(--ok-bg)' : '#fff', color: t.concluida ? 'var(--ok)' : 'var(--texto)', textDecoration: t.concluida ? 'line-through' : 'none', fontWeight: 500 }}>
                {t.concluida ? '✓' : '○'} {t.nome}
              </button>
            ))}
            <EntradaRapida rotulo="Nova tarefa" onEnviar={(v) => novaTarefa(o, v)} />
            {o.comentarios.map((c) => <p key={c.id} className="muted"><strong>{c.autor?.nome}</strong> · {data(c.criado_em)}: {c.texto}</p>)}
            <EntradaRapida rotulo="Comentar" onEnviar={(v) => comentar(o, v)} />
          </section>
        )
      })}
    </>
  )
}

function EntradaRapida({ rotulo, onEnviar }: { rotulo: string; onEnviar: (v: string) => void }) {
  const [v, setV] = useState('')
  return (
    <form className="linha" onSubmit={(e) => { e.preventDefault(); onEnviar(v); setV('') }}>
      <input aria-label={rotulo} placeholder={rotulo} value={v} onChange={(e) => setV(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
      <button className="pequeno">Adicionar</button>
    </form>
  )
}
