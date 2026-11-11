import { useEffect, useState, type FormEvent } from 'react'
import AbasMeuEspaco from '../../components/AbasMeuEspaco'
import { supabase, PESSOA_COLS, type Pessoa } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { data } from '../../lib/format'

interface Combinado { id: string; acao: string; prazo: string; status: 'aberto' | 'concluido' | 'cancelado'; responsavel_id: string; responsavel: { nome: string } }
interface Encontro {
  id: string; gestor_id: string; liderado_id: string; data: string; pauta: string | null; anotacoes_compartilhadas: string | null
  proximo_encontro: string | null; gestor: { nome: string }; liderado: { nome: string }; combinados: Combinado[]
}

export default function OneAOne() {
  const { eu, temEquipe } = useAuth()
  const [time, setTime] = useState<Pessoa[]>([])
  const [encontros, setEncontros] = useState<Encontro[]>([])
  const [sel, setSel] = useState<Encontro | null>(null)
  const [privada, setPrivada] = useState('')
  const [novo, setNovo] = useState(false)

  async function carregar() {
    if (!eu) return
    const { data: e } = await supabase.from('encontros')
      .select('*, gestor:pessoas!encontros_gestor_id_fkey(nome), liderado:pessoas!encontros_liderado_id_fkey(nome), combinados:encontro_combinados(id, acao, prazo, status, responsavel_id, responsavel:pessoas(nome))')
      .order('data', { ascending: false })
    const lista = (e as unknown as Encontro[]) ?? []
    setEncontros(lista)
    setSel((s) => lista.find((x) => x.id === s?.id) ?? lista[0] ?? null)
  }
  useEffect(() => {
    carregar()
    if (eu && temEquipe) supabase.from('pessoas').select(PESSOA_COLS).eq('gestor_id', eu.id).eq('ativo', true).order('nome').then(({ data }) => setTime((data as Pessoa[]) ?? []))
  }, [eu?.id, temEquipe])
  useEffect(() => {
    if (!sel || sel.gestor_id !== eu?.id) { setPrivada(''); return }
    supabase.from('encontro_notas_privadas').select('texto').eq('encontro_id', sel.id).maybeSingle().then(({ data }) => setPrivada(data?.texto ?? ''))
  }, [sel?.id])

  const souGestor = sel?.gestor_id === eu?.id

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!eu) return
    const f = new FormData(e.currentTarget)
    const { data: enc } = await supabase.from('encontros').insert({
      gestor_id: eu.id, liderado_id: f.get('liderado'), data: f.get('data'), pauta: f.get('pauta') || null,
    }).select('id').single()
    setNovo(false); await carregar()
    if (enc) setSel((s) => encontros.find((x) => x.id === enc.id) ?? s)
  }
  async function salvarCampo(campo: 'pauta' | 'anotacoes_compartilhadas' | 'proximo_encontro', valor: string) {
    if (!sel) return
    await supabase.from('encontros').update({ [campo]: valor || null }).eq('id', sel.id); carregar()
  }
  async function salvarPrivada() {
    if (!sel || !eu) return
    await supabase.from('encontro_notas_privadas').upsert({ encontro_id: sel.id, autor_id: eu.id, texto: privada })
  }
  async function novoCombinado(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!sel) return
    const f = new FormData(e.currentTarget)
    await supabase.from('encontro_combinados').insert({ encontro_id: sel.id, acao: f.get('acao'), responsavel_id: f.get('resp'), prazo: f.get('prazo') })
    e.currentTarget.reset(); carregar()
  }
  async function concluir(c: Combinado) {
    await supabase.from('encontro_combinados').update({ status: c.status === 'concluido' ? 'aberto' : 'concluido' }).eq('id', c.id); carregar()
  }

  const hoje = new Date().toISOString().slice(0, 10)
  const situacao = (c: Combinado) => c.status === 'concluido' ? ['Concluído', 'ok'] : c.prazo < hoje ? ['Vencido', 'erro'] : ['No prazo', 'pend']

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Meu espaço</div><h1>One a One</h1></div>
        {temEquipe && <button className="primario" onClick={() => setNovo(!novo)}>+ Novo encontro</button>}
      </div>
      <AbasMeuEspaco />

      {novo && (
        <form className="card" onSubmit={criar}>
          <div className="grade" style={{ ['--min' as string]: '200px' }}>
            <label className="campo">Liderado<select name="liderado" required>{time.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
            <label className="campo">Data<input type="date" name="data" defaultValue={hoje} required /></label>
          </div>
          <label className="campo">Pauta<textarea name="pauta" rows={3} placeholder="Um tópico por linha" /></label>
          <div className="linha"><button className="primario">Criar</button><button type="button" onClick={() => setNovo(false)}>Cancelar</button></div>
        </form>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: '1 1 260px', padding: 12, gap: 4 }}>
          <span className="nav-titulo" style={{ color: 'var(--muted)' }}>Encontros</span>
          {encontros.length === 0 && <p className="muted" style={{ padding: 8 }}>Nenhum encontro registrado.</p>}
          {encontros.map((e) => (
            <button key={e.id} onClick={() => setSel(e)} style={{ justifyContent: 'space-between', border: 0, background: sel?.id === e.id ? 'var(--ok-bg)' : 'transparent', color: sel?.id === e.id ? 'var(--ok)' : 'var(--texto)' }}>
              <span>{e.gestor_id === eu?.id ? e.liderado.nome : `Com ${e.gestor.nome}`}</span><span className="muted">{data(e.data)}</span>
            </button>
          ))}
        </section>

        {sel && (
          <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <section className="card">
              <div className="linha entre">
                <div><h2>{souGestor ? `Encontro com ${sel.liderado.nome}` : `Encontro com ${sel.gestor.nome}`}</h2><span className="muted">{data(sel.data)}</span></div>
                {souGestor
                  ? <label className="campo" style={{ fontWeight: 500 }}>Próximo encontro<input type="date" defaultValue={sel.proximo_encontro ?? ''} onBlur={(e) => salvarCampo('proximo_encontro', e.target.value)} /></label>
                  : sel.proximo_encontro && <span className="pill neutro">Próximo: {data(sel.proximo_encontro)}</span>}
              </div>
              <label className="campo">Pauta
                <textarea rows={3} defaultValue={sel.pauta ?? ''} disabled={!souGestor} onBlur={(e) => salvarCampo('pauta', e.target.value)} key={sel.id + 'p'} />
              </label>
              <div className="grade">
                <label className="campo">Anotações compartilhadas<small>{souGestor ? 'O liderado vê' : 'Registradas pelo gestor'}</small>
                  <textarea rows={4} defaultValue={sel.anotacoes_compartilhadas ?? ''} disabled={!souGestor} onBlur={(e) => salvarCampo('anotacoes_compartilhadas', e.target.value)} key={sel.id + 'a'} />
                </label>
                {souGestor && (
                  <label className="campo">Anotações privadas<small>Só você vê. Nem o RH tem acesso.</small>
                    <textarea rows={4} value={privada} onChange={(e) => setPrivada(e.target.value)} onBlur={salvarPrivada} style={{ background: '#f8f6fd' }} />
                  </label>
                )}
              </div>
            </section>
            <section className="card">
              <h2>Combinados</h2>
              <div className="tabela-box">
                <table style={{ minWidth: 560 }}>
                  <thead><tr><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Situação</th><th></th></tr></thead>
                  <tbody>
                    {sel.combinados.map((c) => {
                      const [txt, cls] = situacao(c)
                      return (
                        <tr key={c.id}>
                          <td><strong>{c.acao}</strong></td><td>{c.responsavel?.nome}</td><td>{data(c.prazo)}</td>
                          <td><span className={`pill ${cls}`}>{txt}</span></td>
                          <td>{(souGestor || c.responsavel_id === eu?.id) && <button className="pequeno" onClick={() => concluir(c)}>{c.status === 'concluido' ? 'Reabrir' : 'Concluir'}</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {souGestor && (
                <form className="linha" onSubmit={novoCombinado}>
                  <input name="acao" placeholder="Ação" required style={{ flex: 2, minWidth: 200 }} aria-label="Ação" />
                  <select name="resp" aria-label="Responsável">
                    <option value={sel.liderado_id}>{sel.liderado.nome}</option><option value={eu?.id}>Eu</option>
                  </select>
                  <input type="date" name="prazo" required aria-label="Prazo" />
                  <button className="pequeno">Adicionar</button>
                </form>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  )
}
