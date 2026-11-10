import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase, rpc, type Rodada, type StatusAvaliacao } from '../../lib/supabase'
import { STATUS, baixarCsv } from '../../lib/format'

interface Linha {
  pessoa_id: string; nome: string; cargo: string | null; area: string | null; perfil: string | null; gestor: string | null
  acesso_assistido: boolean; gestor_status: StatusAvaliacao | null; auto_status: StatusAvaliacao | null
  lider_status: StatusAvaliacao | null; pares_pendentes: number; pendencias: number
}

function Status({ s }: { s: StatusAvaliacao | null }) {
  if (!s) return <span className="pill neutro">Não se aplica</span>
  return <span className={`pill ${STATUS[s].classe}`}>{STATUS[s].rotulo}</span>
}

export default function Acompanhamento() {
  const [params, setParams] = useSearchParams()
  const [rodadas, setRodadas] = useState<Rodada[]>([])
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [busca, setBusca] = useState('')
  const [gestor, setGestor] = useState('')
  const [area, setArea] = useState('')
  const [soPendentes, setSoPendentes] = useState(true)
  const [msg, setMsg] = useState('')
  const rodadaId = params.get('rodada') ?? ''

  useEffect(() => {
    supabase.from('rodadas').select('*').in('status', ['aberta', 'encerrada']).order('criado_em', { ascending: false }).then(({ data }) => {
      const l = (data as Rodada[]) ?? []
      setRodadas(l)
      if (!rodadaId && l[0]) setParams({ rodada: l[0].id })
    })
  }, [])
  useEffect(() => {
    if (rodadaId) rpc<Linha[]>('acompanhamento_rodada', { p_rodada: rodadaId }).then(setLinhas).catch((e) => setMsg(e.message))
  }, [rodadaId])

  const gestores = useMemo(() => [...new Set(linhas.map((l) => l.gestor).filter(Boolean))].sort() as string[], [linhas])
  const areas = useMemo(() => [...new Set(linhas.map((l) => l.area).filter(Boolean))].sort() as string[], [linhas])
  const filtradas = linhas.filter((l) =>
    (!soPendentes || l.pendencias > 0) && (!gestor || l.gestor === gestor) && (!area || l.area === area) &&
    (!busca || `${l.nome} ${l.cargo}`.toLowerCase().includes(busca.toLowerCase())))
  const conta = (s: StatusAvaliacao) => linhas.filter((l) => l.gestor_status === s).length
  const rodada = rodadas.find((r) => r.id === rodadaId)

  async function lembrar(alvos: Linha[]) {
    const hoje = new Date().toISOString().slice(0, 10)
    const { data: eu } = await supabase.rpc('eu')
    const linhasNotif = alvos.map((l) => ({
      tipo: 'lembrete_manual', destinatario_id: l.pessoa_id, rodada_id: rodadaId,
      chave: `lembrete_manual:${rodadaId}:${l.pessoa_id}:${hoje}`,
      payload: { pendencias: l.pendencias, assistido: l.acesso_assistido, pedido_por: eu },
    }))
    const { error } = await supabase.from('notificacoes').upsert(linhasNotif, { onConflict: 'chave', ignoreDuplicates: true })
    setMsg(error ? error.message : `${alvos.length} lembrete(s) na fila de envio. Para o Operacional Obras, o aviso vai ao gestor.`)
  }

  function exportar() {
    baixarCsv(`acompanhamento_${rodada?.nome ?? 'rodada'}.csv`, [
      ['Nome', 'Cargo', 'Área', 'Perfil', 'Gestor', 'Avaliação do gestor', 'Autoavaliação', 'Avalia o gestor', 'Pares pendentes', 'Pendências'],
      ...linhas.map((l) => [l.nome, l.cargo, l.area, l.perfil, l.gestor,
        l.gestor_status ? STATUS[l.gestor_status].rotulo : '', l.auto_status ? STATUS[l.auto_status].rotulo : '',
        l.lider_status ? STATUS[l.lider_status].rotulo : '', l.pares_pendentes, l.pendencias]),
    ])
  }

  const pendentes = linhas.filter((l) => l.pendencias > 0)

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Visão RH</div><h1>Acompanhamento</h1></div>
        <div className="linha">
          <select value={rodadaId} onChange={(e) => setParams({ rodada: e.target.value })} aria-label="Rodada">
            {rodadas.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
          <button className="primario" disabled={!pendentes.length} onClick={() => lembrar(pendentes)}>Lembrar todos os pendentes ({pendentes.length})</button>
          <button onClick={exportar}>Exportar planilha</button>
        </div>
      </div>
      {msg && <div className="aviso info">{msg}</div>}

      <div className="linha">
        <span className="pill ok" style={{ fontSize: 14, padding: '8px 14px' }}>Concluídas {conta('concluida')}</span>
        <span className="pill info" style={{ fontSize: 14, padding: '8px 14px' }}>Em andamento {conta('em_andamento')}</span>
        <span className="pill pend" style={{ fontSize: 14, padding: '8px 14px' }}>Não iniciadas {conta('pendente')}</span>
        <span className="pill roxo" style={{ fontSize: 14, padding: '8px 14px' }}>Aguardando revisão {conta('enviada')}</span>
      </div>

      <section className="card" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', padding: '16px 20px' }}>
        <label className="campo" style={{ flex: '2 1 220px', fontWeight: 400 }}>Buscar pessoa<input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <label className="campo" style={{ flex: '1 1 160px', fontWeight: 400 }}>Gestor<select value={gestor} onChange={(e) => setGestor(e.target.value)}><option value="">Todos</option>{gestores.map((g) => <option key={g}>{g}</option>)}</select></label>
        <label className="campo" style={{ flex: '1 1 160px', fontWeight: 400 }}>Área<select value={area} onChange={(e) => setArea(e.target.value)}><option value="">Todas</option>{areas.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label className="campo" style={{ flex: '1 1 160px', fontWeight: 400 }}>Situação<select value={soPendentes ? 'p' : 't'} onChange={(e) => setSoPendentes(e.target.value === 'p')}><option value="p">Só com pendência</option><option value="t">Todas</option></select></label>
      </section>

      <section className="card" style={{ padding: 8 }}>
        <div className="tabela-box"><table style={{ minWidth: 980 }}>
          <thead><tr><th>Participante</th><th>Gestor</th><th>Gestor avalia</th><th>Autoavaliação</th><th>Avalia o gestor</th><th>Pares</th><th></th></tr></thead>
          <tbody>{filtradas.map((l) => (
            <tr key={l.pessoa_id}>
              <td><strong>{l.nome}</strong><div className="muted">{l.cargo} · {l.perfil}{l.acesso_assistido ? ' · assistido' : ''}</div></td>
              <td>{l.gestor ?? '—'}</td>
              <td><Status s={l.gestor_status} /></td><td><Status s={l.auto_status} /></td><td><Status s={l.lider_status} /></td>
              <td>{l.pares_pendentes ? <span className="pill pend">{l.pares_pendentes} pendentes</span> : '—'}</td>
              <td style={{ textAlign: 'right' }}>{l.pendencias > 0 && <button className="pequeno" onClick={() => lembrar([l])}>{l.acesso_assistido ? 'Lembrar gestor' : 'Lembrar'}</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
        <p className="muted" style={{ padding: '8px 12px' }}>Mostrando {filtradas.length} de {linhas.length}.</p>
      </section>
    </>
  )
}
