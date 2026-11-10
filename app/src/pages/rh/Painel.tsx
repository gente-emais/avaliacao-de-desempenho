import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Rodada } from '../../lib/supabase'
import { TIPO_RODADA, data } from '../../lib/format'

interface Etapa { ordem: number; nome: string; inicio: string; fim: string; status: string }
interface Resumo { rodada: Rodada & { etapas: Etapa[] }; total: number; concluidas: number; pendentes: number; aguardando: number; participantes: number }

export default function Painel() {
  const [resumos, setResumos] = useState<Resumo[]>([])
  const [pessoas, setPessoas] = useState({ ativos: 0, assistidos: 0, semPerfil: 0 })

  useEffect(() => {
    ;(async () => {
      const { data: rs } = await supabase.from('rodadas').select('*, etapas:rodada_etapas(ordem, nome, inicio, fim, status)').eq('status', 'aberta').order('criado_em')
      const lista = (rs as (Rodada & { etapas: Etapa[] })[]) ?? []
      const out: Resumo[] = []
      for (const r of lista) {
        const [{ data: av }, { count }] = await Promise.all([
          supabase.from('avaliacoes').select('status').eq('rodada_id', r.id),
          supabase.from('rodada_participantes').select('id', { count: 'exact', head: true }).eq('rodada_id', r.id),
        ])
        const s = (av as { status: string }[]) ?? []
        out.push({
          rodada: r, total: s.length, participantes: count ?? 0,
          concluidas: s.filter((x) => x.status === 'concluida').length,
          aguardando: s.filter((x) => x.status === 'enviada').length,
          pendentes: s.filter((x) => x.status === 'pendente' || x.status === 'em_andamento').length,
        })
      }
      setResumos(out)
      const { data: ps } = await supabase.from('pessoas').select('acesso_assistido, perfil_id').eq('ativo', true)
      const p = (ps as { acesso_assistido: boolean; perfil_id: number | null }[]) ?? []
      setPessoas({ ativos: p.length, assistidos: p.filter((x) => x.acesso_assistido).length, semPerfil: p.filter((x) => !x.perfil_id).length })
    })()
  }, [])

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Visão RH</div><h1>Painel</h1></div>
        <div className="linha">
          <Link className="botao" to="/rh/pessoas">Subir planilha</Link>
          <Link className="botao primario" to="/rh/rodadas">Abrir nova rodada</Link>
        </div>
      </div>

      <div className="grade" style={{ ['--min' as string]: '200px' }}>
        <div className="card"><span className="muted">Pessoas ativas</span><span className="kpi">{pessoas.ativos}</span><span className="muted">{pessoas.assistidos} com preenchimento assistido</span></div>
        <div className="card"><span className="muted">Sem perfil de avaliação</span><span className="kpi">{pessoas.semPerfil}</span><span className="muted">ficam fora das rodadas</span></div>
        <div className="card"><span className="muted">Rodadas abertas</span><span className="kpi">{resumos.length}</span></div>
      </div>

      {resumos.length === 0 && <div className="card"><p>Nenhuma rodada aberta. <Link to="/rh/rodadas">Abrir uma rodada</Link>.</p></div>}
      {resumos.map(({ rodada: r, ...n }) => (
        <section className="card" key={r.id}>
          <div className="linha entre">
            <div>
              <h2>{r.nome}</h2>
              <span className="muted">{TIPO_RODADA[r.tipo]} · foto das pessoas em {data(r.foto_em)} · {n.participantes} participantes</span>
            </div>
            <Link className="botao primario" to={`/rh/acompanhamento?rodada=${r.id}`}>Ver pendências</Link>
          </div>
          <div className="grade" style={{ ['--min' as string]: '160px' }}>
            <div><span className="muted">Concluídas</span><div className="kpi">{n.concluidas}</div></div>
            <div><span className="muted">Pendentes</span><div className="kpi">{n.pendentes}</div></div>
            <div><span className="muted">Aguardando revisão</span><div className="kpi">{n.aguardando}</div></div>
            <div><span className="muted">Andamento</span><div className="kpi">{n.total ? Math.round((n.concluidas / n.total) * 100) : 0}%</div></div>
          </div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
            {r.etapas.sort((a, b) => a.ordem - b.ordem).map((e) => (
              <li key={e.ordem} style={{ border: '1px solid var(--borda)', borderRadius: 12, padding: 12, background: e.status === 'aberta' ? 'var(--ok-bg)' : '#fafcff' }}>
                <strong>{e.ordem}. {e.nome}</strong>
                <span className={`pill ${e.status === 'aberta' ? 'ok' : e.status === 'fechada' ? 'neutro' : 'pend'}`}>{e.status === 'aberta' ? 'Em andamento' : e.status === 'fechada' ? 'Fechada' : 'Aguardando'}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  )
}
