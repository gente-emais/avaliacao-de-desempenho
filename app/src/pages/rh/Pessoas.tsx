import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase, rpc } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'

interface Linha { linha: number; situacao: string; mensagem: string | null; nome: string; cpf: string }
interface Previa { importacao_id: string; gravado: boolean; lidas: number; rejeitadas: number; resumo: Record<string, number>; linhas: Linha[] }
interface PessoaLista {
  id: string; nome: string; cpf_mascarado: string; cargo: string | null; area: string | null; papel: string
  acesso_assistido: boolean; email_ficticio: boolean; user_id: string | null; perfil: { nome: string } | null; gestor: { nome: string } | null
}

const COLUNAS: [string, string][] = [
  ['cpf', 'CPF'], ['nome', 'Nome'], ['email', 'E-mail'], ['cargo', 'Cargo'], ['area', 'Área'],
  ['perfil', 'Perfil de avaliação'], ['cpf_gestor', 'CPF do gestor'], ['cpf_gestor_secundario', 'CPF do gestor secundário'],
  ['cpf_bp', 'CPF do BP'], ['acesso_assistido', 'Acesso assistido (S/N)'],
]
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
const SINONIMOS: Record<string, string> = Object.fromEntries([
  ...COLUNAS.map(([k, r]) => [normal(r), k]),
  ['email', 'email'], ['perfil', 'perfil'], ['cpfgestor', 'cpf_gestor'], ['gestor', 'cpf_gestor'],
  ['gestorsecundario', 'cpf_gestor_secundario'], ['bp', 'cpf_bp'], ['acessoassistido', 'acesso_assistido'], ['assistido', 'acesso_assistido'], ['papel', 'papel'],
])
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
  const [busca, setBusca] = useState('')
  const input = useRef<HTMLInputElement>(null)

  async function carregarBase() {
    const { data } = await supabase.from('pessoas')
      .select('id, nome, cpf_mascarado, cargo, area, papel, acesso_assistido, email_ficticio, user_id, perfil:perfis(nome), gestor:pessoas!pessoas_gestor_id_fkey(nome)')
      .eq('ativo', true).order('nome')
    setBase((data as unknown as PessoaLista[]) ?? [])
  }
  useEffect(() => { carregarBase() }, [])

  function baixarModelo() {
    const ws = XLSX.utils.aoa_to_sheet([COLUNAS.map(([, r]) => r), ['12345678909', 'Nome Sobrenome', 'nome@emais.com.br', 'Analista', 'Engenharia', 'Tático', '98765432100', '', '', 'N']])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pessoas')
    XLSX.writeFile(wb, 'modelo_pessoas_emais.xlsx')
  }

  async function lerArquivo(f: File) {
    setMsg(null); setPrevia(null)
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' })
    const bruto = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false })
    const mapeadas = bruto.map((l) => {
      const o: Record<string, string> = {}
      Object.entries(l).forEach(([k, v]) => { const chave = SINONIMOS[normal(k)]; if (chave) o[chave] = String(v ?? '').trim() })
      return o
    }).filter((o) => Object.values(o).some(Boolean))
    if (!mapeadas.length || !('cpf' in mapeadas[0])) { setMsg({ t: 'Não encontrei a coluna CPF. Use a planilha modelo.', c: 'erro' }); return }
    setArquivo(f.name); setLinhas(mapeadas)
    try { setPrevia(await rpc<Previa>('importar_pessoas', { p_linhas: mapeadas, p_arquivo: f.name, p_confirmar: false, p_inativar_ausentes: false })) }
    catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }

  async function gravar() {
    try {
      const r = await rpc<Previa>('importar_pessoas', { p_linhas: linhas, p_arquivo: arquivo, p_confirmar: true, p_inativar_ausentes: inativar })
      setMsg({ t: `Base atualizada: ${r.lidas - r.rejeitadas} linhas gravadas, ${r.rejeitadas} com erro ficaram de fora.`, c: 'ok' })
      setPrevia(null); setLinhas([]); carregarBase()
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
    const { data, error } = await supabase.functions.invoke('enviar-acesso', { body: { pessoa_ids: ids, redirectTo: `${window.location.origin}/definir-senha` } })
    if (error) {
      let t = 'Não foi possível enviar.'
      try { const c = await (error as { context?: Response }).context?.json(); if (c?.erro) t = c.erro } catch { /* padrão */ }
      return setMsg({ t, c: 'erro' })
    }
    setMsg({ t: `${(data as { enviados: number }).enviados} link(s) de acesso enviados por e-mail.`, c: 'ok' })
  }

  async function mudarPapel(id: string, papel: string) {
    const { error } = await supabase.from('pessoas').update({ papel }).eq('id', id)
    if (error) setMsg({ t: error.message, c: 'erro' }); else carregarBase()
  }

  const filtrada = useMemo(() => {
    const b = normal(busca)
    return b ? base.filter((p) => normal(`${p.nome} ${p.cargo} ${p.area} ${p.gestor?.nome}`).includes(b)) : base
  }, [base, busca])
  const r = previa?.resumo ?? {}
  const validas = previa ? previa.lidas - previa.rejeitadas : 0

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Visão RH</div><h1>Base de colaboradores</h1></div>
        <div className="linha">
          <button onClick={baixarModelo}>Baixar planilha modelo</button>
          {ehAdmin && <button onClick={criarLogins}>Criar logins pendentes</button>}
          {ehAdmin && <button onClick={() => enviarAcesso(base.filter((p) => !p.acesso_assistido && !p.email_ficticio).map((p) => p.id))}>Enviar link de acesso a todos</button>}
        </div>
      </div>
      {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}

      {ehAdmin && (
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

      <section className="card">
        <div className="linha entre">
          <h2>Base atual · {base.length} ativos</h2>
          <input type="search" placeholder="Buscar nome, cargo, área ou gestor" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ width: 300, maxWidth: '100%' }} aria-label="Buscar" />
        </div>
        <div className="tabela-box"><table>
          <thead><tr><th>Nome</th><th>CPF</th><th>Cargo</th><th>Área</th><th>Gestor</th><th>Perfil</th><th>Acesso</th>{ehAdmin && <th>Papel</th>}</tr></thead>
          <tbody>{filtrada.map((p) => (
            <tr key={p.id}>
              <td><strong>{p.nome}</strong></td><td className="muted">{p.cpf_mascarado}</td><td>{p.cargo}</td><td>{p.area}</td><td>{p.gestor?.nome ?? '—'}</td>
              <td>{p.perfil ? <span className="pill roxo">{p.perfil.nome}</span> : <span className="pill erro">Sem perfil</span>}</td>
              <td className="muted">{p.acesso_assistido ? 'Assistido pelo gestor' : p.email_ficticio ? 'Sem e-mail válido' : p.user_id ? <>Login criado {ehAdmin && <button className="pequeno" onClick={() => enviarAcesso([p.id])}>Enviar link</button>}</> : 'Sem login ainda'}</td>
              {ehAdmin && <td><select value={p.papel} onChange={(e) => mudarPapel(p.id, e.target.value)} aria-label={`Papel de ${p.nome}`}>
                <option value="participante">Participante</option><option value="bp_rh">BP do RH</option><option value="admin_rh">RH administrador</option>
              </select></td>}
            </tr>
          ))}</tbody>
        </table></div>
      </section>
    </>
  )
}

function Numero({ n, t, c }: { n: number; t: string; c: string }) {
  return <div style={{ borderRadius: 12, padding: 14, background: `var(--${c}-bg)`, color: `var(--${c})` }}><div style={{ fontSize: 26, fontWeight: 700 }}>{n}</div><div style={{ fontSize: 13 }}>{t}</div></div>
}
