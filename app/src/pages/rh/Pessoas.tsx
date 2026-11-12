import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useNavigate } from 'react-router-dom'
import { supabase, rpc, PESSOA_COLS, type Pessoa } from '../../lib/supabase'
import FormColaborador from '../../components/FormColaborador'
import { data as dataBr } from '../../lib/format'
import { useAuth } from '../../lib/auth'

interface Linha { linha: number; situacao: string; mensagem: string | null; nome: string; cpf: string }
interface Previa { importacao_id: string; gravado: boolean; lidas: number; rejeitadas: number; resumo: Record<string, number>; linhas: Linha[] }
type PessoaLista = Pessoa & { user_id: string | null }

const COLUNAS: [string, string][] = [
  ['cpf', 'CPF'], ['nome', 'Nome'], ['email', 'E-mail'], ['cargo', 'Cargo'], ['data_admissao', 'Data de admissão'], ['area', 'Área'],
  ['perfil', 'Perfil de avaliação'], ['cpf_gestor', 'CPF do gestor'], ['gestor_nome', 'Nome do gestor'],
  ['cpf_gestor_secundario', 'CPF do gestor secundário'], ['gestor2_nome', 'Nome do gestor secundário'],
  ['cpf_bp', 'CPF do BP'], ['acesso_assistido', 'Acesso assistido (S/N)'],
]
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
const SINONIMOS: Record<string, string> = Object.fromEntries([
  ...COLUNAS.map(([k, r]) => [normal(r), k]),
  ['email', 'email'], ['perfil', 'perfil'], ['cpfgestor', 'cpf_gestor'], ['gestor', 'cpf_gestor'],
  ['gestorsecundario', 'cpf_gestor_secundario'], ['cpfgestornivel', 'cpf_gestor_secundario'], ['cpfdogestornivel', 'cpf_gestor_secundario'],
  ['nomedogestor', 'gestor_nome'], ['nomegestor', 'gestor_nome'], ['gestordireto', 'gestor_nome'], ['nomedogestordireto', 'gestor_nome'],
  ['nomedogestorsecundario', 'gestor2_nome'], ['nomegestorsecundario', 'gestor2_nome'], ['gestornivel', 'gestor2_nome'], ['nomedogestornivel', 'gestor2_nome'], ['bp', 'cpf_bp'], ['acessoassistido', 'acesso_assistido'], ['assistido', 'acesso_assistido'], ['papel', 'papel'], ['dataadmissao', 'data_admissao'], ['admissao', 'data_admissao'], ['dtadmissao', 'data_admissao'],
])
// Data de admissão: célula de data do Excel vira AAAA-MM-DD; texto DD/MM/AAAA segue como está (o banco entende)
function dataIso(cru: unknown, texto: string) {
  if (cru instanceof Date && !isNaN(cru.getTime())) {
    return `${cru.getFullYear()}-${String(cru.getMonth() + 1).padStart(2, '0')}-${String(cru.getDate()).padStart(2, '0')}`
  }
  return texto.trim()
}
const SITUACAO: Record<string, [string, string]> = {
  novo: ['Novo', 'info'], alterado: ['Alterado', 'info'], aviso: ['Aviso', 'pend'], erro: ['Erro', 'erro'], inativar: ['Não veio na planilha', 'pend'],
}

export default function Pessoas() {
  const { ehAdmin } = useAuth()
  const [arquivo, setArquivo] = useState<string>('')
  const [linhas, setLinhas] = useState<Record<string, string>[]>([])
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [inativar, setInativar] = useState(false)
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)
  const [base, setBase] = useState<PessoaLista[]>([])
  const [perfis, setPerfis] = useState<{ id: number; nome: string }[]>([])
  const [busca, setBusca] = useState('')
  const [fArea, setFArea] = useState('')
  const [fPerfil, setFPerfil] = useState('')
  const [fGestor, setFGestor] = useState('')
  const [fSit, setFSit] = useState<'ativos' | 'inativos' | 'todos'>('ativos')
  const [fKpi, setFKpi] = useState<'' | 'semLogin' | 'semGestor' | 'semPerfil'>('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [editar, setEditar] = useState<PessoaLista | 'novo' | null>(null)
  const [mostrarImport, setMostrarImport] = useState(false)
  const [historico, setHistorico] = useState<{ nome: string; linhas: { ano: number; rodada: string; faixa: string | null; nota: number | null }[] } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  async function carregarBase() {
    const { data, error } = await supabase.from('pessoas').select(`${PESSOA_COLS}, user_id`).order('nome')
    if (error) setMsg({ t: 'Não foi possível carregar a base: ' + error.message, c: 'erro' })
    setBase((data as unknown as PessoaLista[]) ?? [])
  }
  useEffect(() => {
    carregarBase()
    supabase.from('perfis').select('id, nome').order('ordem').then(({ data }) => setPerfis((data as { id: number; nome: string }[]) ?? []))
  }, [])

  function baixarModelo() {
    const ws = XLSX.utils.aoa_to_sheet([COLUNAS.map(([, r]) => r), ['12345678909', 'Nome Sobrenome', 'nome@emais.com.br', 'Analista', '01/03/2024', 'Engenharia', 'Tático', '', 'Fulano de Tal', '', '', '', 'N']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pessoas')
    XLSX.writeFile(wb, 'modelo_pessoas_emais.xlsx')
  }

  async function lerArquivo(f: File) {
    setMsg(null); setPrevia(null)
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true })
    const aba = wb.Sheets[wb.SheetNames[0]]
    const bruto = XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: '', raw: false })
    const crus = XLSX.utils.sheet_to_json<Record<string, unknown>>(aba, { defval: '', raw: true })
    const mapeadas = bruto.map((l, i) => {
      const o: Record<string, string> = {}
      Object.entries(l).forEach(([k, v]) => {
        const chave = SINONIMOS[normal(k)]
        if (!chave) return
        o[chave] = chave === 'data_admissao' ? dataIso(crus[i]?.[k], String(v ?? '')) : String(v ?? '').trim()
      })
      // Se veio nome (letras) na coluna de CPF do gestor, trata como nome
      if (/[a-zA-Z]/.test(o.cpf_gestor ?? '')) { o.gestor_nome = o.gestor_nome || o.cpf_gestor; o.cpf_gestor = '' }
      if (/[a-zA-Z]/.test(o.cpf_gestor_secundario ?? '')) { o.gestor2_nome = o.gestor2_nome || o.cpf_gestor_secundario; o.cpf_gestor_secundario = '' }
      // E o contrário: só números na coluna de nome vira CPF
      if (o.gestor_nome && !/[a-zA-Z]/.test(o.gestor_nome) && !o.cpf_gestor) { o.cpf_gestor = o.gestor_nome; o.gestor_nome = '' }
      if (o.gestor2_nome && !/[a-zA-Z]/.test(o.gestor2_nome) && !o.cpf_gestor_secundario) { o.cpf_gestor_secundario = o.gestor2_nome; o.gestor2_nome = '' }
      return o
    }).filter((o) => Object.values(o).some(Boolean))
    if (!mapeadas.length || !('cpf' in mapeadas[0])) { setMsg({ t: 'Não encontrei a coluna CPF. Use a planilha modelo.', c: 'erro' }); return }
    setArquivo(f.name); setLinhas(mapeadas)
    try { setPrevia(await rpc<Previa>('importar_pessoas', { p_linhas: mapeadas, p_arquivo: f.name, p_confirmar: false, p_inativar_ausentes: false })) }
    catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }

  async function gravar() {
    const qtdInativar = previa?.resumo?.inativar ?? 0
    if (inativar && qtdInativar > 0 && !window.confirm(`Confirma inativar ${qtdInativar} pessoas que não vieram na planilha? Elas saem das próximas rodadas.`)) return
    try {
      const r = await rpc<Previa>('importar_pessoas', { p_linhas: linhas, p_arquivo: arquivo, p_confirmar: true, p_inativar_ausentes: inativar })
      setMsg({ t: `Base atualizada: ${r.lidas - r.rejeitadas} ${r.lidas - r.rejeitadas === 1 ? 'pessoa gravada' : 'pessoas gravadas'}${r.rejeitadas ? `, ${r.rejeitadas} com erro ficaram de fora` : ''}${inativar && qtdInativar ? `, ${qtdInativar} inativadas` : ''}.`, c: 'ok' })
      setPrevia(null); setLinhas([]); setArquivo(''); setInativar(false); if (input.current) input.current.value = ''; carregarBase()
    } catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }

  async function criarLogins() {
    setMsg({ t: 'Criando logins…', c: 'info' })
    const { data, error } = await supabase.functions.invoke('provisionar-acessos', { body: {} })
    if (error) return setMsg({ t: 'Não foi possível criar os logins agora.', c: 'erro' })
    const r = data as { criados: number; falhas: number }
    setMsg({ t: `${r.criados} logins criados${r.falhas ? `, ${r.falhas} com falha` : ''}. Agora envie o link de primeiro acesso.`, c: 'ok' })
    carregarBase()
  }

  async function enviarAcesso(ids: string[]) {
    const { data, error } = await supabase.functions.invoke('enviar-acesso', { body: { pessoa_ids: ids, redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}definir-senha` } })
    if (error) {
      let t = 'Não foi possível enviar.'
      try { const c = await (error as { context?: Response }).context?.json(); if (c?.erro) t = c.erro } catch { /* padrão */ }
      return setMsg({ t, c: 'erro' })
    }
    setMsg({ t: `${(data as { enviados: number }).enviados} link(s) de acesso enviados por e-mail.`, c: 'ok' })
  }

  const porId = useMemo(() => new Map(base.map((p) => [p.id, p])), [base])
  const lideradosDe = useMemo(() => { const m: Record<string, number> = {}; base.forEach((p) => { if (p.ativo && p.gestor_id) m[p.gestor_id] = (m[p.gestor_id] ?? 0) + 1 }); return m }, [base])
  const perfilNome = (id: number | null) => perfis.find((x) => x.id === id)?.nome
  const ativos = base.filter((p) => p.ativo)
  const semLogin = (p: PessoaLista) => !p.user_id && !p.acesso_assistido
  const kpis = { ativos: ativos.length, semLogin: ativos.filter(semLogin).length, semGestor: ativos.filter((p) => !p.gestor_id).length, semPerfil: ativos.filter((p) => !p.perfil_id).length }
  const areas = [...new Set(base.map((p) => p.area).filter(Boolean))].sort() as string[]
  const gestoresLista = Object.keys(lideradosDe).map((id) => porId.get(id)).filter(Boolean).sort((a, b) => a!.nome.localeCompare(b!.nome)) as PessoaLista[]
  const filtrada = useMemo(() => {
    const b = normal(busca)
    return base.filter((p) => (fSit === 'todos' || (fSit === 'ativos') === p.ativo)
      && (!fArea || p.area === fArea) && (!fPerfil || String(p.perfil_id) === fPerfil) && (!fGestor || p.gestor_id === fGestor)
      && (fKpi !== 'semLogin' || semLogin(p)) && (fKpi !== 'semGestor' || !p.gestor_id) && (fKpi !== 'semPerfil' || !p.perfil_id)
      && (!b || normal(`${p.nome} ${p.email ?? ''} ${p.cargo ?? ''} ${p.cpf_mascarado}`).includes(b)))
  }, [base, busca, fArea, fPerfil, fGestor, fSit, fKpi])
  const todosMarcados = filtrada.length > 0 && filtrada.every((p) => sel.has(p.id))
  const marcar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  async function emMassa(campo: 'gestor_id' | 'perfil_id' | 'ativo', valor: string | number | boolean | null) {
    const ids = [...sel]
    if (!ids.length) return
    if (campo === 'ativo' && !window.confirm(`Inativar ${ids.length} pessoa(s)? Elas saem das próximas rodadas.`)) return
    if (campo === 'gestor_id' && ids.includes(String(valor))) return setMsg({ t: 'Uma pessoa não pode ser gestora de si mesma.', c: 'erro' })
    const { error } = await supabase.from('pessoas').update({ [campo]: valor }).in('id', ids)
    if (error) return setMsg({ t: error.message, c: 'erro' })
    let rodadas = 0
    if (campo !== 'ativo') for (const id of ids) { try { const r = await rpc<{ rodadas: number }>('atualizar_participante', { p_pessoa: id }); rodadas += r.rodadas } catch { /* segue */ } }
    setMsg({ t: `${ids.length} pessoa(s) atualizadas.${rodadas ? ' Rodadas abertas ajustadas.' : ''}`, c: 'ok' })
    setSel(new Set()); carregarBase()
  }
  async function inativarUm(p: PessoaLista) {
    if (!window.confirm(`Inativar ${p.nome}? A pessoa sai das próximas rodadas.`)) return
    const { error } = await supabase.from('pessoas').update({ ativo: false }).eq('id', p.id)
    setMsg(error ? { t: error.message, c: 'erro' } : { t: `${p.nome} inativado(a).`, c: 'ok' }); carregarBase()
  }
  async function verHistorico(p: PessoaLista) {
    const { data } = await supabase.from('resultados').select('faixa_nome, nota_final, rodada:rodadas(nome, ano)').eq('pessoa_id', p.id)
    const l = ((data as unknown as { faixa_nome: string | null; nota_final: number | null; rodada: { nome: string; ano: number } }[]) ?? [])
      .map((x) => ({ ano: x.rodada.ano, rodada: x.rodada.nome, faixa: x.faixa_nome, nota: x.nota_final })).sort((a, b) => b.ano - a.ano)
    setHistorico({ nome: p.nome, linhas: l })
  }
  function exportarBase() {
    const csv = [['Nome', 'E-mail', 'CPF', 'Cargo', 'Área', 'Perfil', 'Gestor', 'Gestor secundário', 'Papel', 'Ativo', 'Login'],
      ...filtrada.map((p) => [p.nome, p.email ?? '', p.cpf_mascarado, p.cargo ?? '', p.area ?? '', perfilNome(p.perfil_id) ?? '', porId.get(p.gestor_id ?? '')?.nome ?? '', porId.get(p.gestor_secundario_id ?? '')?.nome ?? '', p.papel, p.ativo ? 'Sim' : 'Não', p.user_id ? 'Sim' : 'Não'])]
    const blob = new Blob(['\ufeff' + csv.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'base_colaboradores.csv'; a.click()
  }

  const r = previa?.resumo ?? {}
  const validas = previa ? previa.lidas - previa.rejeitadas : 0


  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Visão RH</div><h1>Base de colaboradores</h1></div>
        {ehAdmin && (
          <div className="linha">
            <button onClick={() => setMostrarImport((v) => !v)} aria-expanded={mostrarImport}>{mostrarImport ? 'Fechar envio de planilha' : 'Subir planilha'}</button>
            <button onClick={baixarModelo}>Baixar modelo</button>
            <button onClick={criarLogins}>Criar logins pendentes</button>
            <button className="primario" onClick={() => { setEditar('novo'); window.scrollTo({ top: 0 }) }}>+ Adicionar colaborador</button>
          </div>
        )}
      </div>
      {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}

      {editar && (
        <FormColaborador pessoa={editar === 'novo' ? null : editar} pessoas={base} perfis={perfis}
          onFechar={() => setEditar(null)} onErro={(t) => setMsg({ t, c: 'erro' })}
          onSalvo={(t) => { setMsg({ t, c: 'ok' }); setEditar(null); carregarBase() }} />
      )}

      {ehAdmin && (mostrarImport || previa) && (
        <div className="grade" style={{ ['--min' as string]: '340px' }}>
          <section className="card">
            <h2>1. Envie a planilha</h2>
            <label className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) lerArquivo(f) }}>
              <strong>Solte o arquivo .xlsx ou .csv aqui</strong>
              <span className="muted">ou clique para escolher</span>
              <input ref={input} type="file" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files?.[0] && lerArquivo(e.target.files[0])} />
            </label>
            {arquivo && <div className="aviso ok">{arquivo} · {linhas.length} linhas lidas</div>}
            <div className="muted">Colunas: {COLUNAS.map(([, c]) => c).join(' · ')}</div>
            <div className="muted">Gestor e gestor secundário: informe o CPF <b>ou</b> o nome completo. Se vierem os dois, vale o CPF.</div>
          </section>
          <section className="card">
            <h2>2. Confira antes de gravar</h2>
            {!previa ? <p className="muted">Nada é gravado antes da sua confirmação. O sistema compara com a base atual pelo CPF.</p> : (
              <>
                <div className="grade" style={{ ['--min' as string]: '120px' }}>
                  <Numero n={r.sem_alteracao ?? 0} t="sem alteração" c="ok" />
                  <Numero n={(r.novo ?? 0) + (r.alterado ?? 0)} t="novos ou alterados" c="info" />
                  <Numero n={(r.aviso ?? 0) + (r.inativar ?? 0)} t="avisos" c="pend" />
                  <Numero n={r.erro ?? 0} t="erros (não entram)" c="erro" />
                </div>
                {(r.inativar ?? 0) > 0 && (
                  <label className="linha" style={{ fontSize: 14 }}>
                    <input type="checkbox" checked={inativar} onChange={(e) => setInativar(e.target.checked)} style={{ minHeight: 0, width: 20, height: 20 }} />
                    Inativar as {r.inativar} pessoas que não vieram na planilha
                  </label>
                )}
                <div className="linha">
                  <button className="primario" onClick={gravar} disabled={validas === 0}>Gravar {validas} linhas válidas</button>
                  <button onClick={() => { setPrevia(null); setLinhas([]); setArquivo('') }}>Cancelar</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {previa && previa.linhas.length > 0 && (
        <section className="card">
          <h2>O que vai mudar</h2>
          <div className="tabela-box"><table>
            <thead><tr><th>Situação</th><th>Linha</th><th>Colaborador</th><th>CPF</th><th>O que o sistema encontrou</th></tr></thead>
            <tbody>{previa.linhas.map((l, i) => (
              <tr key={i}><td><span className={`pill ${SITUACAO[l.situacao]?.[1]}`}>{SITUACAO[l.situacao]?.[0] ?? l.situacao}</span></td>
                <td>{l.linha || '—'}</td><td><strong>{l.nome}</strong></td><td className="muted">{l.cpf}</td><td>{l.mensagem ?? (l.situacao === 'novo' ? 'Pessoa nova' : 'Dados atualizados')}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}

      <div className="grade" style={{ ['--min' as string]: '180px' }}>
        {([['', 'Ativos', kpis.ativos], ['semLogin', 'Sem login', kpis.semLogin], ['semGestor', 'Sem gestor', kpis.semGestor], ['semPerfil', 'Sem perfil de avaliação', kpis.semPerfil]] as const).map(([k, t, n]) => (
          <button key={t} className="kpi-filtro" aria-pressed={fKpi === k && (k !== '' || fSit === 'ativos')} onClick={() => { setFKpi(k); setFSit('ativos') }}>
            <span className="muted">{t}</span><b>{n}</b>
          </button>
        ))}
      </div>

      <section className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', padding: '16px 20px' }}>
        <label className="campo" style={{ flex: '3 1 260px', fontWeight: 400 }}>Buscar<input type="search" placeholder="Nome, e-mail, CPF ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <label className="campo" style={{ flex: '1 1 140px', fontWeight: 400 }}>Área<select value={fArea} onChange={(e) => setFArea(e.target.value)}><option value="">Todas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="campo" style={{ flex: '1 1 140px', fontWeight: 400 }}>Perfil<select value={fPerfil} onChange={(e) => setFPerfil(e.target.value)}><option value="">Todos</option>{perfis.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select></label>
        <label className="campo" style={{ flex: '1 1 160px', fontWeight: 400 }}>Gestor<select value={fGestor} onChange={(e) => setFGestor(e.target.value)}><option value="">Todos</option>{gestoresLista.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></label>
        <label className="campo" style={{ flex: '1 1 120px', fontWeight: 400 }}>Situação<select value={fSit} onChange={(e) => setFSit(e.target.value as typeof fSit)}><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="todos">Todos</option></select></label>
        <button onClick={exportarBase}>Exportar</button>
      </section>

      {ehAdmin && sel.size > 0 && (
        <div className="barra-massa">
          <strong>{sel.size} selecionado(s)</strong>
          <select aria-label="Trocar gestor" defaultValue="" onChange={(e) => { if (e.target.value) emMassa('gestor_id', e.target.value); e.target.value = '' }}>
            <option value="" disabled>Trocar gestor…</option>
            {ativos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </select>
          <select aria-label="Trocar perfil" defaultValue="" onChange={(e) => { if (e.target.value) emMassa('perfil_id', Number(e.target.value)); e.target.value = '' }}>
            <option value="" disabled>Trocar perfil…</option>
            {perfis.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
          <button onClick={() => enviarAcesso([...sel])}>Enviar link de acesso</button>
          <button onClick={() => emMassa('ativo', false)}>Inativar</button>
          <button onClick={() => setSel(new Set())}>Limpar seleção</button>
        </div>
      )}

      <section className="card" style={{ padding: 8 }}>
        <div className="tabela-box" style={{ overflow: 'visible' }}><table className="tabela-base">
          <thead><tr>
            {ehAdmin && <th style={{ width: 36 }}><input type="checkbox" aria-label="Marcar todos" checked={todosMarcados} onChange={() => setSel(todosMarcados ? new Set() : new Set(filtrada.map((p) => p.id)))} style={{ minHeight: 0, width: 18, height: 18 }} /></th>}
            <th>Colaborador</th><th>Gestores</th><th>Cargo e área</th><th>Perfil (nível)</th><th>Marcadores</th>{ehAdmin && <th></th>}
          </tr></thead>
          <tbody>{filtrada.map((p) => (
            <tr key={p.id} style={{ opacity: p.ativo ? 1 : 0.6 }}>
              {ehAdmin && <td><input type="checkbox" aria-label={`Marcar ${p.nome}`} checked={sel.has(p.id)} onChange={() => marcar(p.id)} style={{ minHeight: 0, width: 18, height: 18 }} /></td>}
              <td>{ehAdmin ? <button className="link-nome" onClick={() => { setEditar(p); window.scrollTo({ top: 0 }) }}>{p.nome}</button> : <strong>{p.nome}</strong>}
                <div className="muted">{p.acesso_assistido ? 'sem e-mail · preenchimento assistido' : p.email ?? 'sem e-mail'}</div>
                <div className="muted">Admissão: {p.data_admissao ? p.data_admissao.split('-').reverse().join('/') : '—'}</div></td>
              <td>{p.gestor_id ? <div>{porId.get(p.gestor_id)?.nome ?? '—'}</div> : <span className="marcador m-alerta">Sem gestor</span>}
                {p.gestor_secundario_id && <div className="muted">2º: {porId.get(p.gestor_secundario_id)?.nome ?? '—'}</div>}</td>
              <td>{p.cargo ?? '—'}<div className="muted">{p.area ?? ''}</div></td>
              <td>{perfilNome(p.perfil_id) ?? <span className="marcador m-alerta">Sem perfil</span>}</td>
              <td className="marcadores">
                {p.gestor_id && <span className="marcador m-lid">Liderado</span>}
                {lideradosDe[p.id] > 0 && <span className="marcador m-ges">Gestor · {lideradosDe[p.id]}</span>}
                {p.papel !== 'participante' && <span className="marcador m-rh">{p.papel === 'admin_rh' ? 'RH' : 'BP do RH'}</span>}
                {p.ativo && semLogin(p) && <span className="marcador m-alerta">Sem login</span>}
                {!p.ativo && <span className="pill neutro">Inativo</span>}
              </td>
              {ehAdmin && (
                <td style={{ textAlign: 'right', width: 1 }}>
                  <details className="acoes-menu">
                    <summary>Ações ▾</summary>
                    <div>
                      <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; setEditar(p); window.scrollTo({ top: 0 }) }}>Editar cadastro</button>
                      <button onClick={() => navigate(`/rh/acompanhamento?pessoa=${p.id}`)}>Ver avaliações da rodada</button>
                      <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; verHistorico(p) }}>Ver histórico de resultados</button>
                      {!p.acesso_assistido && <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; enviarAcesso([p.id]) }}>Enviar link de acesso</button>}
                      {p.ativo && <button onClick={(e) => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; inativarUm(p) }}>Inativar</button>}
                    </div>
                  </details>
                </td>
              )}
            </tr>
          ))}</tbody>
        </table></div>
        <p className="muted" style={{ padding: '8px 12px' }}>{filtrada.length} {filtrada.length === 1 ? 'colaborador' : 'colaboradores'}{ehAdmin ? ' · clique no nome para editar o cadastro' : ''}</p>
      </section>

      {historico && (
        <div className="gaveta-fundo" onClick={() => setHistorico(null)}>
          <aside className="gaveta" role="dialog" aria-modal="true" aria-label={`Histórico de ${historico.nome}`} onClick={(e) => e.stopPropagation()}>
            <div className="linha entre"><h2>Histórico de {historico.nome}</h2><button className="pequeno" onClick={() => setHistorico(null)}>Fechar</button></div>
            {historico.linhas.length === 0 ? <p className="muted">Sem resultados registrados.</p> : (
              <div className="tabela-box"><table>
                <thead><tr><th>Ano</th><th>Rodada</th><th>Faixa</th><th>Nota</th></tr></thead>
                <tbody>{historico.linhas.map((l, i) => <tr key={i}><td>{l.ano}</td><td>{l.rodada}</td><td>{l.faixa ?? '—'}</td><td>{l.nota == null ? '—' : Number(l.nota).toFixed(2).replace('.', ',')}</td></tr>)}</tbody>
              </table></div>
            )}
            <p className="muted">Consultado em {dataBr(new Date().toISOString())}</p>
          </aside>
        </div>
      )}
    </>
  )
}

function Numero({ n, t, c }: { n: number; t: string; c: string }) {
  return <div style={{ borderRadius: 12, padding: 14, background: `var(--${c}-bg)`, color: `var(--${c})` }}><div style={{ fontSize: 26, fontWeight: 700 }}>{n}</div><div style={{ fontSize: 13 }}>{t}</div></div>
}
