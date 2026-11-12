import { type FormEvent } from 'react'
import { supabase, rpc, type Pessoa } from '../lib/supabase'

// Cadastro de um colaborador (novo ou edição). Mudou perfil, gestor ou acesso assistido:
// as rodadas abertas são ajustadas (atualizar_participante).
export default function FormColaborador({ pessoa, pessoas, perfis, onFechar, onSalvo, onErro }: {
  pessoa: Pessoa | null
  pessoas: Pessoa[]
  perfis: { id: number; nome: string }[]
  onFechar: () => void
  onSalvo: (msg: string) => void
  onErro: (msg: string) => void
}) {
  const novo = !pessoa
  const p = pessoa
  const gestores = pessoas.filter((x) => x.ativo && x.id !== p?.id)

  async function salvar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    const v = (k: string) => (f.get(k) as string) || null
    const dados = {
      nome: v('nome'), email: v('email'), cargo: v('cargo'), area: v('area'),
      perfil_id: v('perfil') ? Number(v('perfil')) : null,
      gestor_id: v('gestor'), gestor_secundario_id: v('gestor2'), bp_id: v('bp'),
      papel: v('papel') ?? 'participante', acesso_assistido: f.get('assistido') === 'on', ativo: f.get('ativo') === 'on',
      data_admissao: v('admissao'),
    }
    if (novo) {
      const cpf = String(f.get('cpf') ?? '').replace(/\D/g, '')
      const { error } = await supabase.from('pessoas').insert({ ...dados, cpf })
      if (error) return onErro(error.message.includes('cpf') ? 'CPF inválido ou já cadastrado.' : error.message)
      return onSalvo(`${dados.nome} cadastrado(a).`)
    }
    if (dados.gestor_id === p!.id) return onErro('A pessoa não pode ser gestora de si mesma.')
    const mudou = dados.perfil_id !== p!.perfil_id || dados.gestor_id !== p!.gestor_id || dados.acesso_assistido !== p!.acesso_assistido
    const { error } = await supabase.from('pessoas').update(dados).eq('id', p!.id)
    if (error) return onErro(error.message)
    let extra = ''
    if (mudou) {
      try {
        const r = await rpc<{ rodadas: number; canceladas: number; criadas: number }>('atualizar_participante', { p_pessoa: p!.id })
        extra = r.rodadas
          ? ` Rodadas abertas atualizadas: ${r.criadas} formulário(s) novo(s), ${r.canceladas} cancelado(s). Respostas já concluídas foram mantidas.`
          : ' Não há rodada aberta com essa pessoa; a mudança vale a partir da próxima.'
      } catch (err) { extra = ' Não foi possível atualizar as rodadas abertas: ' + (err as Error).message }
    }
    onSalvo(`Cadastro de ${dados.nome} atualizado.${extra}`)
  }

  return (
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
        <label className="campo">Data de admissão<input name="admissao" type="date" defaultValue={p?.data_admissao ?? ''} /></label>
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
        <button type="button" onClick={onFechar}>Cancelar</button>
      </div>
    </form>
  )
}
