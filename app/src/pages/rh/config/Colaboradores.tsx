import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, rpc, PESSOA_COLS, type Pessoa } from '../../../lib/supabase'

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Colaboradores() {
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [perfis, setPerfis] = useState<{ id: number; nome: string }[]>([])
  const [busca, setBusca] = useState('')
  const [params] = useSearchParams()
  const [soSemPerfil, setSoSemPerfil] = useState(params.get('filtro') === 'sem_perfil')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [sel, setSel] = useState<Pessoa | null>(null)
  const [novo, setNovo] = useState(false)
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)

  async function carregar() {
    const { data } = await supabase.from('pessoas').select(PESSOA_COLS).order('nome')
    setPessoas((data as Pessoa[]) ?? [])
  }
  useEffect(() => {
    carregar()
    supabase.from('perfis').select('id, nome').order('ordem').then(({ data }) => setPerfis(data ?? []))
  }, [])

  const nomeDe = (id: string | null) => pessoas.find((p) => p.id === id)?.nome ?? '—'
  const perfilDe = (id: number | null) => perfis.find((p) => p.id === id)?.nome
  const lista = useMemo(() => pessoas.filter((p) => (mostrarInativos || p.ativo) && (!soSemPerfil || !p.perfil_id) &&
    (!busca || normal(`${p.nome} ${p.cargo} ${p.area}`).includes(normal(busca)))), [pessoas, busca, mostrarInativos, soSemPerfil])

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const v = (k: string) => (f.get(k) as string) || null
    const dados = {
      nome: v('nome'), email: v('email'), cargo: v('cargo'), area: v('area'),
      perfil_id: v('perfil') ? Number(v('perfil')) : null,
      gestor_id: v('gestor'), gestor_secundario_id: v('gestor2'), bp_id: v('bp'),
      papel: v('papel') ?? 'participante', acesso_assistido: f.get('assistido') === 'on', ativo: f.get('ativo') === 'on',
    }
    if (novo) {
      const cpf = String(f.get('cpf') ?? '').replace(/\D/g, '')
      const { error } = await supabase.from('pessoas').insert({ ...dados, cpf })
      if (error) return setMsg({ t: error.message.includes('cpf') ? 'CPF inválido ou já cadastrado.' : error.message, c: 'erro' })
      setMsg({ t: `${dados.nome} cadastrado(a).`, c: 'ok' })
    } else if (sel) {
      if (dados.gestor_id === sel.id) return setMsg({ t: 'A pessoa não pode ser gestora de si mesma.', c: 'erro' })
      const mudouAvaliacao = dados.perfil_id !== sel.perfil_id || dados.gestor_id !== sel.gestor_id || dados.acesso_assistido !== sel.acesso_assistido
      const { error } = await supabase.from('pessoas').update(dados).eq('id', sel.id)
      if (error) return setMsg({ t: error.message, c: 'erro' })
      let extra = ''
      if (mudouAvaliacao) {
        try {
          const r = await rpc<{ rodadas: number; canceladas: number; criadas: number }>('atualizar_participante', { p_pessoa: sel.id })
          extra = r.rodadas
            ? ` Rodadas abertas atualizadas: ${r.criadas} formulário(s) novo(s), ${r.canceladas} cancelado(s). Respostas já concluídas foram mantidas.`
            : ' Não há rodada aberta com essa pessoa; a mudança vale a partir da próxima.'
        } catch (err) { extra = ' Não foi possível atualizar as rodadas abertas: ' + (err as Error).message }
      }
      setMsg({ t: `Cadastro de ${dados.nome} atualizado.${extra}`, c: 'ok' })
    }
    setSel(null); setNovo(false); carregar()
  }

  const editando = novo || sel
  const p = sel
  const gestores = pessoas.filter((x) => x.ativo && x.id !== p?.id)

  return (
    <>
      {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}
      {editando && (
        <form className="card" onSubmit={salvar} key={p?.id ?? 'novo'}>
          <div className="linha entre">
            <h2>{novo ? 'Novo colaborador' : `Editar ${p?.nome}`}</h2>
            {p && <span className="muted">CPF {p.cpf_mascarado}</span>}
          </div>
          <p className="muted">Mudou de cargo, nível ou gestor? Ao salvar, as rodadas abertas são ajustadas: o formulário passa a ser o do novo perfil e o novo gestor recebe a avaliação. O que já foi concluído é mantido.</p>
          <div className="grade" style={{ ['--min' as string]: '220px' }}>
            {novo && <label className="campo">CPF<input name="cpf" inputMode="numeric" required /></label>}
            <label className="campo">Nome<input name="nome" defaultValue={p?.nome} required /></label>
            <label className="campo">E-mail<input name="email" type="email" defaultValue={p?.email ?? ''} /></label>
            <label className="campo">Cargo<input name="cargo" defaultValue={p?.cargo ?? ''} /></label>
            <label className="campo">Área<input name="area" defaultValue={p?.area ?? ''} /></label>
            <label className="campo">Perfil de avaliação (nível)
              <select name="perfil" defaultValue={p?.perfil_id ?? ''}>
                <option value="">Sem perfil (fora das rodadas)</option>
                {perfis.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
            <label className="campo">Gestor
              <select name="gestor" defaultValue={p?.gestor_id ?? ''}>
                <option value="">Sem gestor</option>
                {gestores.map((x) => <option key={x.id} value={x.id}>{x.nome}{x.cargo ? ` · ${x.cargo}` : ''}</option>)}
              </select>
            </label>
            <label className="campo">Gestor secundário
              <select name="gestor2" defaultValue={p?.gestor_secundario_id ?? ''}>
                <option value="">Nenhum</option>
                {gestores.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
            <label className="campo">BP do RH
              <select name="bp" defaultValue={p?.bp_id ?? ''}>
                <option value="">Nenhum</option>
                {pessoas.filter((x) => x.papel !== 'participante').map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
            </label>
            <label className="campo">Papel no sistema
              <select name="papel" defaultValue={p?.papel ?? 'participante'}>
                <option value="participante">Participante</option><option value="bp_rh">BP do RH</option><option value="admin_rh">RH administrador</option>
              </select>
            </label>
          </div>
          <div className="linha" style={{ fontSize: 14 }}>
            <label className="linha"><input type="checkbox" name="assistido" defaultChecked={p?.acesso_assistido} style={{ minHeight: 0, width: 18, height: 18 }} />Sem login (gestor preenche por ele)</label>
            <label className="linha"><input type="checkbox" name="ativo" defaultChecked={p ? p.ativo : true} style={{ minHeight: 0, width: 18, height: 18 }} />Ativo</label>
          </div>
          <div className="linha">
            <button className="primario">Salvar</button>
            <button type="button" onClick={() => { setSel(null); setNovo(false) }}>Cancelar</button>
          </div>
        </form>
      )}

      <section className="card">
        <div className="linha entre">
          <h2>Colaboradores · {lista.length}</h2>
          <div className="linha">
            <input type="search" placeholder="Buscar nome, cargo ou área" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" style={{ width: 260 }} />
            <label className="linha" style={{ fontSize: 13 }}><input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} style={{ minHeight: 0, width: 16, height: 16 }} />Inativos</label>
            <label className="linha" style={{ fontSize: 13 }}><input type="checkbox" checked={soSemPerfil} onChange={(e) => setSoSemPerfil(e.target.checked)} style={{ minHeight: 0, width: 16, height: 16 }} />Só sem perfil</label>
            <button className="primario" onClick={() => { setNovo(true); setSel(null); window.scrollTo({ top: 0 }) }}>+ Novo</button>
          </div>
        </div>
        <div className="tabela-box"><table>
          <thead><tr><th>Nome</th><th>Cargo</th><th>Área</th><th>Perfil</th><th>Gestor</th><th></th></tr></thead>
          <tbody>{lista.map((x) => (
            <tr key={x.id} style={{ opacity: x.ativo ? 1 : 0.55 }}>
              <td><strong>{x.nome}</strong>{!x.ativo && <span className="pill neutro" style={{ marginLeft: 6 }}>inativo</span>}</td>
              <td>{x.cargo}</td><td>{x.area}</td>
              <td>{perfilDe(x.perfil_id) ? <span className="pill roxo">{perfilDe(x.perfil_id)}</span> : <span className="pill erro">Sem perfil</span>}</td>
              <td>{nomeDe(x.gestor_id)}</td>
              <td><button className="pequeno" onClick={() => { setSel(x); setNovo(false); window.scrollTo({ top: 0 }) }}>Editar</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  )
}
