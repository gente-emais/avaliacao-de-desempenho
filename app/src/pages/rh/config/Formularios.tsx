import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

interface Pergunta {
  id: number; bloco_id: number; ordem: number; texto: string; tipo: 'escala' | 'aberta' | 'sim_nao' | 'escolha'
  escala_id: number | null; opcoes: string[] | null; obrigatoria: boolean; pede_evidencia: boolean; ativa: boolean
}
interface ItemForm { id: number; ordem: number; grupo: string; entra_na_nota: boolean; bloco: { id: number; nome: string; tipo: string; perguntas: Pergunta[] } }
interface Form { id: number; codigo: string; nome: string; tipo_rodada: string }

const GRUPOS: Record<string, string> = {
  auto: 'Colaborador responde (pré-work e autoavaliação)',
  gestor: 'Gestor responde',
  lider: 'Colaborador avalia o gestor',
  par: 'Pares avaliam',
}
const TIPOS: Record<string, string> = { escala: 'Escala', aberta: 'Texto', sim_nao: 'Sim/Não', escolha: 'Escolha' }

export default function Formularios() {
  const [forms, setForms] = useState<Form[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [itens, setItens] = useState<ItemForm[]>([])
  const [usos, setUsos] = useState<Record<number, number>>({})
  const [escalaComp, setEscalaComp] = useState<number | null>(null)
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)
  const [verInativas, setVerInativas] = useState(false)

  useEffect(() => {
    supabase.from('formularios').select('id, codigo, nome, tipo_rodada').eq('ativo', true).order('tipo_rodada').order('id')
      .then(({ data }) => { const f = (data as Form[]) ?? []; setForms(f); if (f[0]) setSel(f.find((x) => x.tipo_rodada === 'avaliativo')?.id ?? f[0].id) })
    supabase.from('formulario_blocos').select('bloco_id, formulario_id').then(({ data }) => {
      const m: Record<number, Set<number>> = {}
      ;((data as { bloco_id: number; formulario_id: number }[]) ?? []).forEach((x) => { (m[x.bloco_id] ||= new Set()).add(x.formulario_id) })
      setUsos(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.size])))
    })
    supabase.from('escalas').select('id').eq('codigo', 'competencia').single().then(({ data }) => setEscalaComp(data?.id ?? null))
  }, [])

  async function carregar() {
    if (!sel) return
    const { data } = await supabase.from('formulario_blocos')
      .select('id, ordem, grupo, entra_na_nota, bloco:blocos(id, nome, tipo, perguntas(id, bloco_id, ordem, texto, tipo, escala_id, opcoes, obrigatoria, pede_evidencia, ativa))')
      .eq('formulario_id', sel).order('ordem')
    setItens(((data as unknown as ItemForm[]) ?? []).map((i) => ({ ...i, bloco: { ...i.bloco, perguntas: i.bloco.perguntas.sort((a, b) => a.ordem - b.ordem) } })))
  }
  useEffect(() => { carregar() }, [sel])

  async function atualizar(p: Pergunta, campos: Partial<Pergunta>) {
    const { error } = await supabase.from('perguntas').update(campos).eq('id', p.id)
    if (error) setMsg({ t: error.message, c: 'erro' }); else { setMsg({ t: 'Salvo.', c: 'ok' }); carregar() }
  }
  async function mover(lista: Pergunta[], i: number, dir: -1 | 1) {
    const a = lista[i], b = lista[i + dir]
    if (!b) return
    await supabase.from('perguntas').update({ ordem: -1 }).eq('id', a.id)
    await supabase.from('perguntas').update({ ordem: a.ordem }).eq('id', b.id)
    await supabase.from('perguntas').update({ ordem: b.ordem }).eq('id', a.id)
    carregar()
  }
  async function nova(it: ItemForm, texto: string, tipo: Pergunta['tipo']) {
    if (texto.trim().length < 5) return setMsg({ t: 'Escreva o texto da pergunta.', c: 'erro' })
    const ordem = Math.max(0, ...it.bloco.perguntas.map((p) => p.ordem)) + 1
    const escala = tipo === 'escala' ? it.bloco.perguntas.find((p) => p.escala_id)?.escala_id ?? escalaComp : null
    const { error } = await supabase.from('perguntas').insert({
      bloco_id: it.bloco.id, ordem, texto: texto.trim(), tipo, escala_id: escala,
      opcoes: tipo === 'sim_nao' ? ['Sim', 'Não'] : null, obrigatoria: true, pede_evidencia: tipo === 'escala' && it.bloco.tipo === 'competencia',
    })
    if (error) setMsg({ t: error.message, c: 'erro' }); else { setMsg({ t: 'Pergunta incluída.', c: 'ok' }); carregar() }
  }
  async function nota(it: ItemForm, v: boolean) {
    await supabase.from('formulario_blocos').update({ entra_na_nota: v }).eq('id', it.id); carregar()
  }

  const grupos = [...new Set(itens.map((i) => i.grupo))]
  const atual = forms.find((f) => f.id === sel)

  return (
    <>
      <section className="card">
        <div className="linha entre">
          <label className="campo" style={{ flex: '1 1 320px' }}>Formulário
            <select value={sel ?? ''} onChange={(e) => setSel(Number(e.target.value))}>
              {forms.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </label>
          <label className="linha" style={{ fontSize: 14 }}>
            <input type="checkbox" checked={verInativas} onChange={(e) => setVerInativas(e.target.checked)} style={{ minHeight: 0, width: 18, height: 18 }} />
            Mostrar perguntas removidas
          </label>
        </div>
        <div className="aviso neutro">
          As mudanças valem na hora, inclusive para rodadas abertas. Perguntas já respondidas não são apagadas: ao remover, elas só deixam de aparecer.
          Blocos marcados como <strong>compartilhado</strong> são usados por mais de um formulário; editar muda todos.
        </div>
        {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}
      </section>

      {grupos.map((g) => (
        <section className="card" key={g}>
          <h2>{GRUPOS[g] ?? g}</h2>
          {itens.filter((i) => i.grupo === g).map((it) => {
            const lista = it.bloco.perguntas.filter((p) => verInativas || p.ativa)
            return (
              <div key={it.id} style={{ border: '1px solid var(--borda)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="linha entre">
                  <div className="linha">
                    <strong>{it.bloco.nome}</strong>
                    {(usos[it.bloco.id] ?? 0) > 1 && <span className="pill roxo">compartilhado · {usos[it.bloco.id]} formulários</span>}
                  </div>
                  {atual?.tipo_rodada === 'avaliativo' && g === 'gestor' && it.bloco.tipo === 'competencia' && (
                    <label className="linha" style={{ fontSize: 13 }}>
                      <input type="checkbox" checked={it.entra_na_nota} onChange={(e) => nota(it, e.target.checked)} style={{ minHeight: 0, width: 18, height: 18 }} />
                      Entra na nota
                    </label>
                  )}
                </div>
                {lista.map((p, i) => (
                  <div key={p.id} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10, opacity: p.ativa ? 1 : 0.5, borderTop: '1px solid #e8eef6', paddingTop: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <button className="pequeno" aria-label="Subir" disabled={i === 0} onClick={() => mover(lista, i, -1)}>↑</button>
                      <button className="pequeno" aria-label="Descer" disabled={i === lista.length - 1} onClick={() => mover(lista, i, 1)}>↓</button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <textarea aria-label="Texto da pergunta" rows={2} defaultValue={p.texto} key={p.id + p.texto}
                        onBlur={(e) => e.target.value.trim() !== p.texto && atualizar(p, { texto: e.target.value.trim() })} />
                      <div className="linha" style={{ fontSize: 13 }}>
                        <span className="pill neutro">{TIPOS[p.tipo]}</span>
                        <label className="linha"><input type="checkbox" checked={p.obrigatoria} onChange={(e) => atualizar(p, { obrigatoria: e.target.checked })} style={{ minHeight: 0, width: 16, height: 16 }} />Obrigatória</label>
                        <label className="linha"><input type="checkbox" checked={p.pede_evidencia} onChange={(e) => atualizar(p, { pede_evidencia: e.target.checked })} style={{ minHeight: 0, width: 16, height: 16 }} />Pede evidência</label>
                        {p.ativa
                          ? <button className="pequeno perigo" onClick={() => atualizar(p, { ativa: false })}>Remover</button>
                          : <button className="pequeno" onClick={() => atualizar(p, { ativa: true })}>Reativar</button>}
                      </div>
                    </div>
                  </div>
                ))}
                <NovaPergunta escalaPadrao={it.bloco.tipo === 'competencia'} onCriar={(t, tipo) => nova(it, t, tipo)} />
              </div>
            )
          })}
        </section>
      ))}
    </>
  )
}

function NovaPergunta({ escalaPadrao, onCriar }: { escalaPadrao: boolean; onCriar: (t: string, tipo: Pergunta['tipo']) => void }) {
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<Pergunta['tipo']>(escalaPadrao ? 'escala' : 'aberta')
  return (
    <form className="linha" onSubmit={(e) => { e.preventDefault(); onCriar(texto, tipo); setTexto('') }} style={{ borderTop: '1px dashed var(--borda-forte)', paddingTop: 10 }}>
      <input aria-label="Nova pergunta" placeholder="Nova pergunta" value={texto} onChange={(e) => setTexto(e.target.value)} style={{ flex: '1 1 320px' }} />
      <select aria-label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as Pergunta['tipo'])}>
        <option value="escala">Escala (A desenvolver a Consolidado)</option>
        <option value="aberta">Texto</option>
        <option value="sim_nao">Sim/Não</option>
      </select>
      <button className="pequeno">+ Incluir</button>
    </form>
  )
}
