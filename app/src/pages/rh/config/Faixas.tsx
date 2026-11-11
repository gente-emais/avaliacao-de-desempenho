import { useEffect, useState } from 'react'
import { supabase, rpc, type Rodada } from '../../../lib/supabase'

interface Faixa { id?: number; nome: string; minimo: string; maximo: string; ordem: number }
const num = (s: string) => Number(String(s).replace(',', '.'))
const fmt = (n: number | string) => Number(n).toFixed(2).replace('.', ',')

export default function Faixas() {
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [escopo, setEscopo] = useState<string>('padrao')
  const [faixas, setFaixas] = useState<Faixa[]>([])
  const [removidas, setRemovidas] = useState<number[]>([])
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)

  useEffect(() => {
    supabase.from('rodadas').select('*').eq('tipo', 'avaliativo').eq('somente_leitura', false).order('ano', { ascending: false })
      .then(({ data }) => setRodadas((data as Rodada[]) ?? []))
  }, [])

  async function carregar() {
    setMsg(null); setRemovidas([])
    const q = supabase.from('faixas_classificacao').select('id, nome, minimo, maximo, ordem').order('ordem')
    const { data } = escopo === 'padrao' ? await q.is('rodada_id', null) : await q.eq('rodada_id', escopo)
    setFaixas(((data as { id: number; nome: string; minimo: number; maximo: number; ordem: number }[]) ?? [])
      .map((f) => ({ ...f, minimo: fmt(f.minimo), maximo: fmt(f.maximo) })))
  }
  useEffect(() => { carregar() }, [escopo])

  const alterar = (i: number, campo: keyof Faixa, v: string) => setFaixas((fs) => fs.map((f, j) => (j === i ? { ...f, [campo]: v } : f)))

  function validar(): string | null {
    const ord = [...faixas].sort((a, b) => num(a.minimo) - num(b.minimo))
    for (const f of ord) {
      if (!f.nome.trim()) return 'Toda faixa precisa de um nome.'
      if (isNaN(num(f.minimo)) || isNaN(num(f.maximo))) return `Limites inválidos em "${f.nome}".`
      if (num(f.minimo) > num(f.maximo)) return `Em "${f.nome}" o mínimo é maior que o máximo.`
    }
    for (let i = 1; i < ord.length; i++) if (num(ord[i].minimo) <= num(ord[i - 1].maximo)) return `"${ord[i - 1].nome}" e "${ord[i].nome}" se sobrepõem.`
    return null
  }

  async function salvar() {
    const erro = validar()
    if (erro) return setMsg({ t: erro, c: 'erro' })
    const rodada_id = escopo === 'padrao' ? null : escopo
    const ord = [...faixas].sort((a, b) => num(a.minimo) - num(b.minimo))
    for (const id of removidas) {
      const { error } = await supabase.from('faixas_classificacao').delete().eq('id', id)
      if (error) return setMsg({ t: 'Uma faixa removida já está em uso em resultados; renomeie em vez de remover.', c: 'erro' })
    }
    for (const [i, f] of ord.entries()) {
      const linha = { rodada_id, nome: f.nome.trim(), minimo: num(f.minimo), maximo: num(f.maximo), ordem: i + 1 }
      const { error } = f.id ? await supabase.from('faixas_classificacao').update(linha).eq('id', f.id) : await supabase.from('faixas_classificacao').insert(linha)
      if (error) return setMsg({ t: error.message, c: 'erro' })
    }
    if (rodada_id) {
      await rpc('calcular_resultados', { p_rodada: rodada_id }).catch(() => null)
      setMsg({ t: 'Faixas salvas e notas desta rodada reclassificadas.', c: 'ok' })
    } else setMsg({ t: 'Faixas padrão salvas. Valem para as próximas rodadas abertas.', c: 'ok' })
    carregar()
  }

  return (
    <section className="card">
      <div className="linha entre">
        <div>
          <h2>Faixas de classificação</h2>
          <p className="muted">A nota final (média das respostas do gestor, de 1 a 4) cai em uma faixa. O colaborador vê só o nome da faixa.</p>
        </div>
        <label className="campo" style={{ fontWeight: 400 }}>Aplicar em
          <select value={escopo} onChange={(e) => setEscopo(e.target.value)}>
            <option value="padrao">Padrão (próximas rodadas)</option>
            {rodadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </label>
      </div>
      {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}
      <div className="tabela-box">
        <table style={{ minWidth: 560 }}>
          <thead><tr><th>Faixa</th><th>Nota de</th><th>Até</th><th></th></tr></thead>
          <tbody>
            {faixas.map((f, i) => (
              <tr key={f.id ?? `n${i}`}>
                <td><input aria-label="Nome da faixa" value={f.nome} onChange={(e) => alterar(i, 'nome', e.target.value)} style={{ width: '100%' }} /></td>
                <td><input aria-label="Nota mínima" inputMode="decimal" value={f.minimo} onChange={(e) => alterar(i, 'minimo', e.target.value)} style={{ width: 100 }} /></td>
                <td><input aria-label="Nota máxima" inputMode="decimal" value={f.maximo} onChange={(e) => alterar(i, 'maximo', e.target.value)} style={{ width: 100 }} /></td>
                <td><button className="pequeno perigo" onClick={() => { if (f.id) setRemovidas((r) => [...r, f.id!]); setFaixas((fs) => fs.filter((_, j) => j !== i)) }}>Remover</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="linha">
        <button onClick={() => setFaixas((fs) => [...fs, { nome: '', minimo: '', maximo: '', ordem: fs.length + 1 }])}>+ Faixa</button>
        <button className="primario" onClick={salvar}>Salvar faixas</button>
      </div>
    </section>
  )
}
