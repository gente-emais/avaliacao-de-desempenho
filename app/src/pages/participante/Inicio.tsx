import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import AbasMeuEspaco from '../../components/AbasMeuEspaco'
import MinhasRodadas from './MinhasRodadas'
import { supabase, rpc, type Grupo, type StatusAvaliacao, type TipoRodada } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { STATUS, data, dataHora, tituloTarefa, umAceite } from '../../lib/format'

interface Tarefa {
  id: string
  grupo: Grupo
  status: StatusAvaliacao
  avaliado_id: string
  avaliador_id: string
  rodada: { id: string; nome: string; ano: number; tipo: TipoRodada; status: string }
  avaliado: { nome: string; acesso_assistido: boolean }
  avaliador: { nome: string; gestor_id: string | null }
  aceite: { aceito_em: string } | { aceito_em: string }[] | null
}
interface Ano { id: string; ano: number; aberta: boolean }
interface ObjPdi { id: string; nome: string; fim: string; ano: number; status: string; tarefas: { concluida: boolean }[] }
interface Comb { id: string; acao: string; prazo: string }

const SELECT = `id, grupo, status, avaliado_id, avaliador_id,
  rodada:rodadas!inner(id, nome, ano, tipo, status),
  avaliado:pessoas!avaliacoes_avaliado_id_fkey(nome, acesso_assistido),
  avaliador:pessoas!avaliacoes_avaliador_id_fkey(nome, gestor_id),
  aceite:aceites(aceito_em)`

const PROCESSOS: { tipo: TipoRodada; nome: string }[] = [
  { tipo: 'contratacao', nome: 'Contratação de Desempenho' },
  { tipo: 'avaliativo', nome: 'Ciclo Avaliativo' },
  { tipo: 'feedback', nome: 'Ciclo de Feedback' },
]
const hoje = new Date().toISOString().slice(0, 10)
const ddmm = (d: string) => data(d).slice(0, 5)

export default function Inicio() {
  const { eu, temEquipe } = useAuth()
  const [params, setParams] = useSearchParams()
  const aba = params.get('aba')
  const anoAtualCal = new Date().getFullYear()
  const anoF = Number(params.get('ano') ?? anoAtualCal)
  const pessoaF = params.get('pessoa') ?? 'todos'
  const sitF = params.get('sit') ?? 'p'
  const filtro = (k: string, v: string) => setParams((p) => { const n = new URLSearchParams(p); n.set(k, v); return n })
  const [todasMinhas, setTodasMinhas] = useState<Tarefa[]>([])
  const [todasRevisoes, setTodasRevisoes] = useState<Tarefa[]>([])
  const [todosAceites, setTodosAceites] = useState<Tarefa[]>([])
  const [liderados, setLiderados] = useState<{ id: string; nome: string }[]>([])
  const [objsTodos, setObjsTodos] = useState<ObjPdi[]>([])
  const [minhaContratacao, setMinhaContratacao] = useState<Tarefa | null>(null)
  const [anos, setAnos] = useState<Record<string, Ano[]>>({})
  const [pdi, setPdi] = useState<{ anos: number[]; abertos: ObjPdi[] }>({ anos: [], abertos: [] })
  const [one, setOne] = useState<{ anos: number[]; proximo: { data: string; com: string } | null; combinados: Comb[] }>({ anos: [], proximo: null, combinados: [] })
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState('')

  async function carregar() {
    if (!eu) return
    setCarregando(true)
    const [t, r, c, todas, res, objs, encs, combs] = await Promise.all([
      supabase.from('avaliacoes').select(SELECT).eq('avaliador_id', eu.id).neq('status', 'cancelada').neq('rodada.status', 'rascunho'),
      supabase.from('avaliacoes').select(SELECT).eq('grupo', 'gestor').eq('status', 'enviada').neq('avaliador_id', eu.id),
      supabase.from('avaliacoes').select(SELECT).eq('grupo', 'gestor').eq('status', 'concluida').eq('rodada.tipo', 'contratacao'),
      supabase.from('avaliacoes').select('rodada:rodadas!inner(id, ano, tipo, status)').neq('rodada.status', 'rascunho').neq('status', 'cancelada')
        .or(`avaliador_id.eq.${eu.id},avaliado_id.eq.${eu.id}`),
      supabase.from('resultados').select('rodada:rodadas!inner(id, ano, tipo, status)').eq('pessoa_id', eu.id),
      supabase.from('pdi_objetivos').select('id, nome, fim, ano, status, tarefas:pdi_tarefas(concluida)').eq('pessoa_id', eu.id).order('fim'),
      supabase.from('encontros').select('data, proximo_encontro, gestor_id, gestor:pessoas!encontros_gestor_id_fkey(nome), liderado:pessoas!encontros_liderado_id_fkey(nome)')
        .or(`gestor_id.eq.${eu.id},liderado_id.eq.${eu.id}`).order('data', { ascending: false }),
      supabase.from('encontro_combinados').select('id, acao, prazo').eq('responsavel_id', eu.id).eq('status', 'aberto').order('prazo'),
    ])
    const contr = ((c.data as unknown as Tarefa[]) ?? [])
    setTodasMinhas((t.data as unknown as Tarefa[]) ?? [])
    setTodasRevisoes(((r.data as unknown as Tarefa[]) ?? []).filter((x) => x.avaliador?.gestor_id === eu.id))
    // contratações que eu (ou, no assistido, eu como gestor) preciso dar aceite
    setTodosAceites(contr.filter((x) => !umAceite(x.aceite) && (x.avaliado_id === eu.id || (x.avaliador_id === eu.id && x.avaliado?.acesso_assistido))))
    if (temEquipe) supabase.from('pessoas').select('id, nome').eq('gestor_id', eu.id).eq('ativo', true).order('nome').then(({ data }) => setLiderados((data as { id: string; nome: string }[]) ?? []))
    setMinhaContratacao(contr.filter((x) => x.avaliado_id === eu.id && x.rodada.status === 'aberta')[0] ?? null)

    // anos (rodadas) por processo: onde tenho algo, mais as rodadas com resultado meu (inclui as históricas)
    const porTipo: Record<string, Map<string, Ano>> = {}
    for (const x of [...((todas.data as unknown as { rodada: Ano & { tipo: string; status: string } }[]) ?? []), ...((res.data as unknown as { rodada: Ano & { tipo: string; status: string } }[]) ?? [])]) {
      const ro = x.rodada
      ;(porTipo[ro.tipo] ||= new Map()).set(ro.id, { id: ro.id, ano: ro.ano, aberta: ro.status === 'aberta' })
    }
    setAnos(Object.fromEntries(Object.entries(porTipo).map(([k, m]) => [k, [...m.values()].sort((a, b) => b.ano - a.ano)])))

    const o = (objs.data as unknown as ObjPdi[]) ?? []
    const anoPdi = new Date().getFullYear()
    setObjsTodos(o)
    setPdi({ anos: [...new Set(o.map((x) => x.ano))].sort((a, b) => b - a), abertos: o.filter((x) => x.ano === anoPdi && x.status !== 'concluido') })

    type Enc = { data: string; proximo_encontro: string | null; gestor_id: string; gestor: { nome: string }; liderado: { nome: string } }
    const e = (encs.data as unknown as Enc[]) ?? []
    const prox = e.filter((x) => x.proximo_encontro && x.proximo_encontro >= hoje).sort((a, b) => a.proximo_encontro!.localeCompare(b.proximo_encontro!))[0]
    setOne({
      anos: [...new Set(e.map((x) => Number(x.data.slice(0, 4))))].sort((a, b) => b - a),
      proximo: prox ? { data: prox.proximo_encontro!, com: prox.gestor_id === eu.id ? prox.liderado.nome : prox.gestor.nome } : null,
      combinados: (combs.data as Comb[]) ?? [],
    })
    setCarregando(false)
  }
  useEffect(() => { carregar() }, [eu?.id])

  async function aceitar(id: string) {
    try { await rpc('dar_aceite', { p_avaliacao: id }); setTodosAceites((l) => l.filter((x) => x.id !== id)); setMsg('Aceite registrado. Obrigado!'); carregar() } catch (e) { setMsg((e as Error).message) }
  }

  // Filtros do topo: ano da rodada, pessoa (gestor) e situação
  const passaPessoa = (t: Tarefa) => pessoaF === 'todos' || (pessoaF === 'eu' ? t.avaliado_id === eu?.id || t.grupo === 'lider' : t.avaliado_id === pessoaF)
  const ehPendente = (t: Tarefa) => (t.status === 'pendente' || t.status === 'em_andamento') && t.rodada.status === 'aberta'
  const tarefas = todasMinhas.filter((t) => t.rodada.ano === anoF && passaPessoa(t) && (sitF === 't' || ehPendente(t)))
  const revisoes = todasRevisoes.filter((t) => t.rodada.ano === anoF && passaPessoa(t))
  const aceites = todosAceites.filter((t) => t.rodada.ano === anoF && passaPessoa(t))
  const pdiAno = objsTodos.filter((x) => x.ano === anoF && (sitF === 't' || x.status !== 'concluido'))
  const anosOpcoes = [...new Set([anoAtualCal, ...Object.values(anos).flat().map((a) => a.ano), ...pdi.anos, ...one.anos])].sort((a, b) => b - a)
  const totalPend = PROCESSOS.reduce((s, p) => s + tarefas.filter((t) => t.rodada.tipo === p.tipo && ehPendente(t)).length, 0) + revisoes.length + aceites.length
  const rodadasAbertas = new Set(tarefas.filter(ehPendente).map((t) => t.rodada.id)).size
  // ordem fixa da jornada: Contratação → Ciclo Avaliativo → Ciclo de Feedback
  const blocos = PROCESSOS

  function Bloco({ tipo, nome }: { tipo: TipoRodada; nome: string }) {
    const n = tarefas.filter((t) => t.rodada.tipo === tipo && ehPendente(t)).length + (tipo === 'avaliativo' ? revisoes.length : 0) + (tipo === 'contratacao' ? aceites.length : 0)
    const minhas = tarefas.filter((t) => t.rodada.tipo === tipo)
      .sort((a, b) => Number(b.avaliado_id === eu?.id) - Number(a.avaliado_id === eu?.id) || (a.avaliado?.nome ?? '').localeCompare(b.avaliado?.nome ?? ''))
    const lista = anos[tipo] ?? []
    return (
      <section className="processo">
        <div className="processo-topo">
          <h2>{nome}{n > 0 ? <span className="contador pend">{n} {n === 1 ? 'pendência' : 'pendências'}</span> : lista.length > 0 && <span className="contador ok">em dia</span>}</h2>
          {lista.length > 0 && <Link className="muted" to={`/?aba=${tipo}&ano=${anoF}`}>Ver rodadas de {anoF} →</Link>}
        </div>
        {n > 0 || minhas.length > 0 ? (
          <div className="tiles">
            {minhas.map((t) => (
              <Link key={t.id} to={`/avaliacao/${t.id}`} className="tile">
                <strong>{tituloTarefa(t.rodada.tipo, t.grupo, t.avaliado?.nome ?? '', t.avaliado_id === eu?.id)}</strong>
                <span>{STATUS[t.status].rotulo}</span>
              </Link>
            ))}
            {tipo === 'avaliativo' && revisoes.map((t) => (
              <Link key={t.id} to={`/avaliacao/${t.id}`} className="tile">
                <strong>Revisar nota de {t.avaliado?.nome}</strong>
                <span>Avaliado por {t.avaliador?.nome}</span>
              </Link>
            ))}
            {tipo === 'contratacao' && aceites.map((a) => (
              <div key={a.id} className="tile">
                <strong>{a.avaliado_id === eu?.id ? 'Dar aceite na sua contratação' : `Aceite de ${a.avaliado?.nome} (você marca por ele)`}</strong>
                <span>{a.rodada.nome}</span>
                <div className="linha" style={{ marginTop: 6 }}>
                  <Link className="botao pequeno" to={`/avaliacao/${a.id}`}>Ler</Link>
                  <button className="primario pequeno" onClick={() => aceitar(a.id)}>Li e estou ciente</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="em-dia">
            {tipo === 'contratacao' && minhaContratacao && umAceite(minhaContratacao.aceite)
              ? `✓ Sua contratação ${minhaContratacao.rodada.ano} está com aceite dado (${data(umAceite(minhaContratacao.aceite)!.aceito_em)}). Nada a fazer agora.`
              : lista.some((a) => a.aberta) ? '✓ Nada pendente na rodada aberta.' : lista.length ? 'Nenhuma rodada aberta agora.' : 'Você ainda não participou de rodadas deste processo.'}
          </p>
        )}
      </section>
    )
  }

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Meu espaço</div><h1>Olá, {eu?.nome.split(' ')[0]}</h1>
          {!aba && !carregando && <span className="muted">{totalPend ? `${totalPend} ${totalPend === 1 ? 'pendência' : 'pendências'} em ${rodadasAbertas} ${rodadasAbertas === 1 ? 'rodada aberta' : 'rodadas abertas'}` : 'Nada pendente agora'}</span>}</div>
        <div className="linha">
          <select value={anoF} onChange={(e) => filtro('ano', e.target.value)} aria-label="Ano">{anosOpcoes.map((a) => <option key={a} value={a}>Ano: {a}</option>)}</select>
          {temEquipe && (
            <select value={pessoaF} onChange={(e) => filtro('pessoa', e.target.value)} aria-label="Pessoa">
              <option value="todos">Pessoa: eu e minha equipe</option><option value="eu">Pessoa: só eu</option>
              {liderados.map((l) => <option key={l.id} value={l.id}>Pessoa: {l.nome}</option>)}
            </select>
          )}
          <select value={sitF} onChange={(e) => filtro('sit', e.target.value)} aria-label="Situação"><option value="p">Situação: com pendência</option><option value="t">Situação: tudo</option></select>
        </div>
      </div>
      <AbasMeuEspaco />
      {aba === 'contratacao' || aba === 'avaliativo' || aba === 'feedback' ? <MinhasRodadas tipo={aba} /> : carregando ? <div className="card"><p>Carregando…</p></div> : <>
        {msg && <div className="aviso info">{msg}</div>}
        {blocos.map((p) => <Bloco key={p.tipo} tipo={p.tipo} nome={p.nome} />)}

        <div className="grade" style={{ ['--min' as string]: '340px' }}>
          <section className="processo">
            <div className="processo-topo">
              <h2>PDI{pdiAno.filter((o) => o.status !== 'concluido').length > 0 ? <span className="contador pend">{pdiAno.filter((o) => o.status !== 'concluido').length} em aberto</span> : pdi.anos.length > 0 && <span className="contador ok">em dia</span>}</h2>
              <Link className="muted" to={`/pdi?ano=${anoF}`}>Abrir PDI de {anoF} →</Link>
            </div>
            {pdiAno.slice(0, 3).map((o) => {
              const abertas = o.tarefas.filter((x) => !x.concluida).length
              return (
                <Link key={o.id} to={`/pdi?ano=${o.ano}`} className="mini">
                  <span>{o.nome}{abertas > 0 && <span className="muted"> · {abertas} {abertas === 1 ? 'tarefa' : 'tarefas'}</span>}</span>
                  {o.status === 'concluido' ? <span className="pill ok">concluído</span> : <span className={`pill ${o.fim < hoje ? 'erro' : 'pend'}`}>{o.fim < hoje ? 'venceu' : 'termina'} {ddmm(o.fim)}</span>}
                </Link>
              )
            })}
            {pdiAno.length > 3 && <Link to="/pdi" className="muted">+ {pdiAno.length - 3} no PDI</Link>}
            {pdiAno.length === 0 && <p className="em-dia">{pdi.anos.length ? `✓ Nenhum objetivo em aberto em ${anoF}.` : <>Você ainda não tem PDI. <Link to="/pdi">Criar meu PDI</Link></>}</p>}
          </section>

          <section className="processo">
            <div className="processo-topo">
              <h2>One a One{one.combinados.length > 0 ? <span className="contador info">{one.combinados.length} {one.combinados.length === 1 ? 'combinado aberto' : 'combinados abertos'}</span> : one.anos.length > 0 && <span className="contador ok">em dia</span>}</h2>
              <Link className="muted" to={`/one-a-one?ano=${anoF}`}>Abrir encontros de {anoF} →</Link>
            </div>
            {one.proximo && <Link to="/one-a-one" className="mini"><span>Próximo encontro com {one.proximo.com}</span><strong>{ddmm(one.proximo.data)}</strong></Link>}
            {one.combinados.slice(0, 3).map((c) => (
              <Link key={c.id} to="/one-a-one" className="mini"><span>{c.acao}</span><span className={`pill ${c.prazo < hoje ? 'erro' : 'pend'}`}>{c.prazo < hoje ? 'venceu' : 'até'} {ddmm(c.prazo)}</span></Link>
            ))}
            {!one.proximo && one.combinados.length === 0 && <p className="em-dia">{one.anos.length ? '✓ Nenhum combinado em aberto.' : 'Nenhum encontro registrado ainda.'}</p>}
          </section>
        </div>
        <p className="muted">Atualizado em {dataHora(new Date().toISOString())}</p>
      </>}
    </>
  )
}
