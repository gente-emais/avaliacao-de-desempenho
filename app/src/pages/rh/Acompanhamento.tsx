import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, nomesPorId, type Rodada, type Grupo, type StatusAvaliacao } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { STATUS, baixarCsv, umAceite } from '../../lib/format'
import AvaliacoesPessoa from '../../components/AvaliacoesPessoa'
import SeletorRodada from '../../components/SeletorRodada'

// Status das avaliações (Visão RH): uma linha por participante da rodada; clique abre quem avalia quem.
interface Part { pessoa_id: string; nome: string; area: string | null; cargo: string | null; perfil_id: number | null; gestor_id: string | null; gestor_secundario_id: string | null; acesso_assistido: boolean }
interface Av { id: string; grupo: Grupo; status: StatusAvaliacao; avaliado_id: string; avaliador_id: string; aceite: { aceito_em: string } | { aceito_em: string }[] | null }

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Acompanhamento() {
  const { ehAdmin } = useAuth()
  const [params, setParams] = useSearchParams()
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [avs, setAvs] = useState<Av[]>([])
  const [nomes, setNomes] = useState<Record<string, string>>({})
  const [emails, setEmails] = useState<Record<string, string>>({})
  const [perfis, setPerfis] = useState<Record<number, string>>({})
  const [busca, setBusca] = useState('')
  const [gestor, setGestor] = useState('')
  const [area, setArea] = useState('')
  const [perfil, setPerfil] = useState('')
  const [msg, setMsg] = useState('')
  const rodadaId = params.get('rodada') ?? ''
  const pessoaSel = params.get('pessoa')
  const situacao = params.get('situacao') ?? 'p'
  const mudar = (k: string, v: string | null) => setParams((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n })

  useEffect(() => {
    supabase.from('perfis').select('id, nome').then(({ data }) => setPerfis(Object.fromEntries(((data as { id: number; nome: string }[]) ?? []).map((x) => [x.id, x.nome]))))
    // Só o que está em andamento: rodadas abertas do ano atual ou anteriores (nada encerrado nem de anos futuros)
    supabase.from('rodadas').select('*').eq('status', 'aberta').lte('ano', new Date().getFullYear()).order('criado_em', { ascending: false }).then(async ({ data }) => {
      const l = (data as Rodada[]) ?? []
      setRodadas(l)
      if ((!rodadaId || !l.some((r) => r.id === rodadaId)) && l[0]) {
        // vindo de "Ver avaliações" da base: abre a rodada aberta mais recente em que a pessoa participa
        let alvo = l[0].id
        if (pessoaSel) {
          const { data: rp } = await supabase.from('rodada_participantes').select('rodada_id').eq('pessoa_id', pessoaSel).in('rodada_id', l.map((r) => r.id))
          const ids = new Set(((rp as { rodada_id: string }[]) ?? []).map((x) => x.rodada_id))
          alvo = l.find((r) => r.status === 'aberta' && ids.has(r.id))?.id ?? l.find((r) => ids.has(r.id))?.id ?? alvo
        }
        mudar('rodada', alvo)
      }
    })
  }, [])

  async function carregar() {
    if (!rodadaId) return
    const [{ data: p }, { data: a }] = await Promise.all([
      supabase.from('rodada_participantes').select('pessoa_id, nome, area, cargo, perfil_id, gestor_id, gestor_secundario_id, acesso_assistido').eq('rodada_id', rodadaId).order('nome'),
      supabase.from('avaliacoes').select('id, grupo, status, avaliado_id, avaliador_id, aceite:aceites(aceito_em)').eq('rodada_id', rodadaId).neq('status', 'cancelada'),
    ])
    const lp = (p as Part[]) ?? []
    const la = (a as unknown as Av[]) ?? []
    setParts(lp); setAvs(la)
    const ids = [...lp.flatMap((x) => [x.gestor_id, x.gestor_secundario_id]), ...la.map((x) => x.avaliador_id)].filter(Boolean) as string[]
    setNomes(await nomesPorId(ids))
    const { data: em } = await supabase.from('pessoas').select('id, email').in('id', lp.map((x) => x.pessoa_id))
    setEmails(Object.fromEntries(((em as { id: string; email: string | null }[]) ?? []).map((x) => [x.id, x.email ?? ''])))
  }
  useEffect(() => { carregar() }, [rodadaId])

  const rodada = rodadas.find((r) => r.id === rodadaId)
  const contratacao = rodada?.tipo === 'contratacao'
  const pendente = (a: Av) => a.status === 'pendente' || a.status === 'em_andamento' || a.status === 'enviada' || (contratacao && a.status === 'concluida' && !umAceite(a.aceite))
  const linhas = useMemo(() => parts.map((p) => {
    const sobre = avs.filter((a) => a.avaliado_id === p.pessoa_id)
    return { ...p, total: sobre.length, pend: sobre.filter(pendente).length, sobre }
  }), [parts, avs, contratacao])

  const gestores = useMemo(() => [...new Set(parts.map((p) => p.gestor_id).filter(Boolean))].map((g) => ({ id: g as string, nome: nomes[g as string] ?? '—' })).sort((a, b) => a.nome.localeCompare(b.nome)), [parts, nomes])
  const areas = useMemo(() => [...new Set(parts.map((p) => p.area).filter(Boolean))].sort() as string[], [parts])
  const filtradas = linhas.filter((l) =>
    (situacao === 't' || (situacao === 'p' ? l.pend > 0 : l.pend === 0)) &&
    (!gestor || l.gestor_id === gestor) && (!area || l.area === area) && (!perfil || String(l.perfil_id) === perfil) &&
    (!busca || normal(`${l.nome} ${emails[l.pessoa_id] ?? ''} ${l.cargo ?? ''}`).includes(normal(busca))))

  async function lembrar(alvos: typeof linhas) {
    const hoje = new Date().toISOString().slice(0, 10)
    const quem = [...new Set(alvos.flatMap((l) => l.sobre.filter((a) => a.status === 'pendente' || a.status === 'em_andamento').map((a) => a.avaliador_id)))]
    if (!quem.length) return setMsg('Ninguém com formulário pendente nos filtros atuais.')
    const { error } = await supabase.from('notificacoes').upsert(quem.map((id) => ({
      tipo: 'lembrete_manual', destinatario_id: id, rodada_id: rodadaId, chave: `lembrete_manual:${rodadaId}:${id}:${hoje}`, payload: {},
    })), { onConflict: 'chave', ignoreDuplicates: true })
    setMsg(error ? error.message : `${quem.length} lembrete(s) na fila de envio.`)
  }

  function exportar() {
    baixarCsv(`status_${rodada?.nome ?? 'rodada'}.csv`, [
      ['Participante', 'E-mail', 'Área', 'Perfil', 'Gestor', 'Gestor secundário', 'Avaliações', 'Pendências', 'Grupo', 'Quem preenche', 'Situação'],
      ...linhas.flatMap((l) => (l.sobre.length ? l.sobre : [null]).map((a) => [
        l.nome, emails[l.pessoa_id], l.area, l.perfil_id ? perfis[l.perfil_id] : '', nomes[l.gestor_id ?? ''] ?? '', nomes[l.gestor_secundario_id ?? ''] ?? '',
        l.total, l.pend, a?.grupo ?? '', a ? nomes[a.avaliador_id] ?? '' : '', a ? STATUS[a.status].rotulo : '',
      ])),
    ])
  }

  const comPend = linhas.filter((l) => l.pend > 0).length
  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Visão RH</div><h1>Status das avaliações</h1>
          {rodada && <span className="muted">{parts.length} participantes · {comPend} com pendência</span>}</div>
        <div className="linha">
          <button onClick={exportar}>Exportar</button>
          {ehAdmin && <button className="primario" onClick={() => lembrar(filtradas)}>Enviar lembrete aos pendentes</button>}
        </div>
      </div>
      {msg && <div className="aviso info">{msg}</div>}
      <section className="card" style={{ padding: '16px 20px' }}>
        <SeletorRodada rodadas={rodadas} valor={rodadaId} onChange={(id) => setParams({ rodada: id, situacao })} />
      </section>

      <section className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', padding: '16px 20px' }}>
        <label className="campo" style={{ flex: '2 1 240px', fontWeight: 400 }}>Buscar<input type="search" placeholder="Nome, e-mail ou cargo" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <label className="campo" style={{ flex: '1 1 160px', fontWeight: 400 }}>Gestor<select value={gestor} onChange={(e) => setGestor(e.target.value)}><option value="">Todos</option>{gestores.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}</select></label>
        <label className="campo" style={{ flex: '1 1 140px', fontWeight: 400 }}>Área<select value={area} onChange={(e) => setArea(e.target.value)}><option value="">Todas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="campo" style={{ flex: '1 1 140px', fontWeight: 400 }}>Perfil<select value={perfil} onChange={(e) => setPerfil(e.target.value)}><option value="">Todos</option>{Object.entries(perfis).map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>
        <label className="campo" style={{ flex: '1 1 160px', fontWeight: 400 }}>Situação<select value={situacao} onChange={(e) => mudar('situacao', e.target.value)}>
          <option value="p">Com pendência</option><option value="ok">Sem pendência</option><option value="t">Todos</option></select></label>
      </section>

      <section className="card" style={{ padding: 8 }}>
        <div className="tabela-box"><table style={{ minWidth: 860 }}>
          <thead><tr><th>Participante</th><th>Gestor</th><th>Gestor secundário</th><th>Perfil</th><th className="c">Avaliações</th><th>Pendências</th></tr></thead>
          <tbody>{filtradas.map((l) => (
            <tr key={l.pessoa_id} className="clicavel" onClick={() => mudar('pessoa', l.pessoa_id)}>
              <td><button className="link-nome" onClick={(e) => { e.stopPropagation(); mudar('pessoa', l.pessoa_id) }}>{l.nome}</button><div className="muted">{emails[l.pessoa_id] || (l.acesso_assistido ? 'preenchimento assistido' : '—')}</div></td>
              <td>{nomes[l.gestor_id ?? ''] ?? '—'}</td>
              <td>{nomes[l.gestor_secundario_id ?? ''] ?? '—'}</td>
              <td>{l.perfil_id ? perfis[l.perfil_id] : '—'}</td>
              <td className="c">{l.total}</td>
              <td><strong style={{ color: l.pend ? 'var(--pend)' : 'var(--ok)' }}>{l.pend} {l.pend === 1 ? 'pendência' : 'pendências'}</strong></td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="muted" style={{ padding: '8px 12px' }}>Mostrando {filtradas.length} de {linhas.length}. Clique no participante para ver quem avalia quem.</p>
      </section>

      {pessoaSel && rodadaId && (
        <AvaliacoesPessoa rodadaId={rodadaId} pessoaId={pessoaSel} podeAgir={ehAdmin} onFechar={() => mudar('pessoa', null)} onMudou={carregar} />
      )}
    </>
  )
}
