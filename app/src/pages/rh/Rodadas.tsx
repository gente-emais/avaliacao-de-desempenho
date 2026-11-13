import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, rpc, type Rodada, type TipoRodada } from '../../lib/supabase'
import { TIPO_RODADA, data } from '../../lib/format'

interface Etapa { id?: number; ordem: number; codigo: string; nome: string; inicio: string; fim: string; status?: string }
type RodadaCompleta = Rodada & { etapas: Etapa[] }

const ETAPAS: Record<TipoRodada, Omit<Etapa, 'inicio' | 'fim'>[]> = {
  avaliativo: [
    { ordem: 1, codigo: 'autoavaliacao', nome: 'Autoavaliação e pré-work' },
    { ordem: 2, codigo: 'avaliacao', nome: 'Avaliação do gestor' },
    { ordem: 3, codigo: 'revisao', nome: 'Revisão do gestor acima' },
    { ordem: 4, codigo: 'resultados', nome: 'Resultados e devolutiva' },
  ],
  contratacao: [
    { ordem: 1, codigo: 'preenchimento', nome: 'Preenchimento do gestor' },
    { ordem: 2, codigo: 'aceite', nome: 'Aceite do colaborador' },
  ],
  feedback: [
    { ordem: 1, codigo: 'registro', nome: 'Registro do gestor' },
    { ordem: 2, codigo: 'resposta', nome: 'Resposta do colaborador' },
  ],
}
const DESCRICAO: Record<TipoRodada, string> = {
  contratacao: 'Gestor registra o acordo do ano e o colaborador dá o aceite.',
  avaliativo: 'Pré-work, autoavaliação, avaliação do gestor, avaliação do líder e pares, conforme o perfil.',
  feedback: 'Gestor registra os acordos e o colaborador responde ao feedback recebido.',
}
const STATUS_RODADA: Record<string, [string, string]> = { rascunho: ['Rascunho', 'neutro'], aberta: ['Aberta', 'ok'], encerrada: ['Encerrada', 'roxo'], historica: ['Histórico', 'neutro'] }

export default function Rodadas() {
  const [lista, setLista] = useState<RodadaCompleta[]>([])
  const [ano, setAno] = useState(new Date().getFullYear())
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [mostrarNova, setMostrarNova] = useState(false)
  const [numeros, setNumeros] = useState<Record<string, { total: number; feitas: number; part: number; faixas: Record<string, number> }>>({})
  const [faixasPadrao, setFaixasPadrao] = useState<string[]>([])
  const [contagem, setContagem] = useState<{ total: number; porPerfil: Record<string, number>; semGestor: number } | null>(null)

  async function carregar() {
    const { data } = await supabase.from('rodadas').select('*, etapas:rodada_etapas(*)').order('criado_em', { ascending: false })
    const l = (data as RodadaCompleta[]) ?? []
    setLista(l)
    const ids = l.filter((r) => r.status !== 'historica' && r.status !== 'rascunho').map((r) => r.id)
    const [{ data: av }, { data: rp }, { data: rs }, { data: fx }] = await Promise.all([
      ids.length ? supabase.from('avaliacoes').select('rodada_id, status, grupo, aceite:aceites(aceito_em)').in('rodada_id', ids).neq('status', 'cancelada') : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('rodada_participantes').select('rodada_id').in('rodada_id', ids) : Promise.resolve({ data: [] }),
      supabase.from('resultados').select('rodada_id, faixa_nome'),
      supabase.from('faixas_classificacao').select('nome').is('rodada_id', null).order('ordem'),
    ])
    setFaixasPadrao(((fx as { nome: string }[]) ?? []).map((f) => f.nome))
    const n: Record<string, { total: number; feitas: number; part: number; faixas: Record<string, number> }> = {}
    const ini = (id: string) => (n[id] ||= { total: 0, feitas: 0, part: 0, faixas: {} })
    const tipoDe = Object.fromEntries(l.map((r) => [r.id, r.tipo]))
    ;((av as { rodada_id: string; status: string; aceite: unknown }[]) ?? []).forEach((a) => {
      const x = ini(a.rodada_id); x.total++
      const aceite = Array.isArray(a.aceite) ? a.aceite.length > 0 : !!a.aceite
      if (tipoDe[a.rodada_id] === 'contratacao' ? a.status === 'concluida' && aceite : a.status === 'concluida' || a.status === 'enviada') x.feitas++
    })
    ;((rp as { rodada_id: string }[]) ?? []).forEach((p) => { ini(p.rodada_id).part++ })
    ;((rs as { rodada_id: string; faixa_nome: string | null }[]) ?? []).forEach((r) => { const x = ini(r.rodada_id); const f = r.faixa_nome ?? '—'; x.faixas[f] = (x.faixas[f] ?? 0) + 1 })
    setNumeros(n)
  }

  useEffect(() => {
    carregar()
    supabase.from('pessoas').select('gestor_id, perfil:perfis(nome)').eq('ativo', true).not('perfil_id', 'is', null).then(({ data }) => {
      const p = (data as unknown as { gestor_id: string | null; perfil: { nome: string } }[]) ?? []
      const porPerfil: Record<string, number> = {}
      p.forEach((x) => { porPerfil[x.perfil.nome] = (porPerfil[x.perfil.nome] ?? 0) + 1 })
      setContagem({ total: p.length, porPerfil, semGestor: p.filter((x) => !x.gestor_id).length })
    })
  }, [])


  // Nova rodada: sempre os 3 ciclos do ano de referência juntos (Contratação, Ciclo Avaliativo e Ciclo de Feedback)
  const TIPOS_ORDEM: TipoRodada[] = ['contratacao', 'avaliativo', 'feedback']
  const jaExiste = (t: TipoRodada) => lista.some((r) => r.ano === ano && r.tipo === t && r.status !== 'historica')
  const faltam = TIPOS_ORDEM.filter((t) => !jaExiste(t))

  async function salvar(abrir: boolean) {
    setMsg(null)
    if (salvando) return
    if (!faltam.length) return setMsg({ t: `Os 3 ciclos de ${ano} já existem. Use os cartões abaixo para abrir, encerrar ou reabrir.`, c: 'erro' })
    setSalvando(true)
    try {
      const hoje = new Date().toISOString().slice(0, 10)
      const escala = (await supabase.from('escalas').select('id').eq('codigo', 'competencia').single()).data?.id
      const abertas: string[] = []
      for (const tipo of faltam) {
        const { data: r, error } = await supabase.from('rodadas').insert({
          nome: `${TIPO_RODADA[tipo]} ${ano}`, tipo, ano, escala_nota_id: tipo === 'avaliativo' ? escala : null,
        }).select('id').single()
        if (error || !r) { setMsg({ t: error?.message ?? 'Erro ao criar a rodada', c: 'erro' }); break }
        await supabase.from('rodada_etapas').insert(ETAPAS[tipo].map((e) => ({ rodada_id: r.id, ordem: e.ordem, codigo: e.codigo, nome: e.nome, inicio: hoje, fim: hoje })))
        const { data: forms } = await supabase.from('formularios').select('id, perfil_id').eq('tipo_rodada', tipo).eq('ativo', true)
        await supabase.from('rodada_formularios').insert(((forms as { id: number; perfil_id: number | null }[]) ?? []).map((f) => ({ rodada_id: r.id, perfil_id: f.perfil_id, formulario_id: f.id })))
        if (abrir) {
          try { await rpc('abrir_rodada', { p_rodada: r.id }); abertas.push(TIPO_RODADA[tipo]) }
          catch (e) { setMsg({ t: `${TIPO_RODADA[tipo]}: ${(e as Error).message}`, c: 'erro' }); break }
        }
      }
      if (abrir && abertas.length) setMsg({ t: `Ciclos de ${ano} abertos: ${abertas.join(', ')}. Nenhum e-mail é enviado.`, c: 'ok' })
      else if (!abrir) setMsg({ t: `Rascunhos de ${ano} salvos. Abra cada ciclo pelo cartão quando estiver pronto.`, c: 'ok' })
      setMostrarNova(false)
      carregar()
    } finally { setSalvando(false) }
  }

  async function abrirRodada(id: string) {
    try {
      const r = await rpc<{ participantes: number; avaliacoes: number }>('abrir_rodada', { p_rodada: id })
      setMsg({ t: `Rodada aberta: ${r.participantes} participantes e ${r.avaliacoes} formulários gerados. Os avisos saem pelo n8n.`, c: 'ok' })
      carregar()
    } catch (e) { setMsg({ t: (e as Error).message, c: 'erro' }) }
  }

  // Encerrar a qualquer momento: fecha a etapa em andamento e, no Ciclo Avaliativo, calcula os resultados
  async function encerrarRodada(r: RodadaCompleta) {
    if (!window.confirm(`Encerrar "${r.nome}" agora? Ninguém mais consegue preencher até você reabrir. Dá para reabrir quando precisar.`)) return
    const atual = r.etapas.find((e) => e.status === 'aberta')
    if (atual) await supabase.from('rodada_etapas').update({ status: 'fechada' }).eq('id', atual.id!)
    const { error } = await supabase.from('rodadas').update({ status: 'encerrada' }).eq('id', r.id)
    if (error) return setMsg({ t: error.message, c: 'erro' })
    if (r.tipo === 'avaliativo') {
      try { await rpc('calcular_resultados', { p_rodada: r.id }); setMsg({ t: 'Rodada encerrada e resultados calculados. Libere as devolutivas em Resultados.', c: 'ok' }) }
      catch (e) { setMsg({ t: 'Rodada encerrada, mas o cálculo falhou: ' + (e as Error).message, c: 'erro' }) }
    } else setMsg({ t: 'Rodada encerrada. Você pode reabrir quando precisar.', c: 'ok' })
    carregar()
  }

  // Reabrir: volta a aceitar respostas; retoma a etapa onde parou (ou a última, se todas foram fechadas)
  async function reabrirRodada(r: RodadaCompleta) {
    if (!window.confirm(`Reabrir "${r.nome}"? As pessoas voltam a conseguir preencher o que estiver pendente. O que já foi concluído continua salvo.`)) return
    const ord = [...r.etapas].sort((a, b) => a.ordem - b.ordem)
    const etapa = ord.find((e) => e.status !== 'fechada') ?? ord[ord.length - 1]
    if (etapa) await supabase.from('rodada_etapas').update({ status: 'aberta' }).eq('id', etapa.id!)
    const { error } = await supabase.from('rodadas').update({ status: 'aberta' }).eq('id', r.id)
    if (error) return setMsg({ t: error.message, c: 'erro' })
    setMsg({ t: `Rodada reaberta${etapa ? ` na etapa "${etapa.nome}"` : ''}.${r.tipo === 'avaliativo' ? ' Ao encerrar de novo, os resultados são recalculados.' : ''}`, c: 'ok' })
    carregar()
  }

  async function avancarEtapa(r: RodadaCompleta) {
    const ord = [...r.etapas].sort((a, b) => a.ordem - b.ordem)
    const atual = ord.findIndex((e) => e.status === 'aberta')
    if (atual >= 0) await supabase.from('rodada_etapas').update({ status: 'fechada' }).eq('id', ord[atual].id!)
    if (ord[atual + 1]) await supabase.from('rodada_etapas').update({ status: 'aberta' }).eq('id', ord[atual + 1].id!)
    else {
      await supabase.from('rodadas').update({ status: 'encerrada' }).eq('id', r.id)
      // Ciclo Avaliativo: ao encerrar, as notas e faixas já ficam calculadas para liberar em Resultados
      if (r.tipo === 'avaliativo') {
        try { await rpc('calcular_resultados', { p_rodada: r.id }); setMsg({ t: `Rodada encerrada e resultados calculados. Libere as devolutivas em Resultados.`, c: 'ok' }) }
        catch (e) { setMsg({ t: 'Rodada encerrada, mas o cálculo falhou: ' + (e as Error).message, c: 'erro' }) }
      } else setMsg({ t: 'Rodada encerrada.', c: 'ok' })
    }
    carregar()
  }

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Visão RH</div><h1>Rodadas e resultados</h1></div>
        <button className="primario" onClick={() => setMostrarNova((v) => !v)} aria-expanded={mostrarNova}>{mostrarNova ? 'Fechar' : '+ Nova rodada'}</button>
      </div>
      {msg && <div className={`aviso ${msg.c}`}>{msg.t}</div>}

      {mostrarNova && <section className="card">
        <h2>Nova rodada</h2>
        <p className="muted" style={{ margin: 0 }}>Ao abrir, os 3 ciclos do ano de referência são criados e abertos juntos.</p>
        <div className="grade" style={{ ['--min' as string]: '220px' }}>
          {TIPOS_ORDEM.map((t, i) => (
            <div key={t} className="ciclo-novo" aria-disabled={jaExiste(t)}>
              <span className="ciclo-num">{i + 1}</span>
              <span style={{ color: 'var(--texto)', fontWeight: 600 }}>{TIPO_RODADA[t]} {ano}</span>
              <span className="muted">{DESCRICAO[t]}</span>
              {jaExiste(t) && <span className="pill neutro">Já existe em {ano}</span>}
            </div>
          ))}
        </div>
        <div className="grade" style={{ ['--min' as string]: '220px' }}>
          <label className="campo">Ano de referência<input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))} /></label>
        </div>
        {contagem && (
          <div className="aviso neutro">
            Ao abrir, o sistema tira a foto de hoje: <strong>{contagem.total} pessoas</strong> com cargo, área, gestor e perfil congelados ({Object.entries(contagem.porPerfil).map(([k, v]) => `${k}: ${v}`).join(' · ')}).
            {contagem.semGestor > 0 && <> <strong>{contagem.semGestor} sem gestor</strong> não terão avaliação do gestor.</>}
          </div>
        )}
        <div className="linha">
          <button className="primario" disabled={salvando || !faltam.length} onClick={() => salvar(true)}>{salvando ? 'Abrindo…' : faltam.length === 3 ? `Abrir os 3 ciclos de ${ano}` : `Abrir ${faltam.length} ciclo(s) que faltam em ${ano}`}</button>
          <button disabled={salvando || !faltam.length} onClick={() => salvar(false)}>Salvar como rascunho</button>
        </div>
      </section>}

      {[...new Set(lista.map((r) => r.ano))].sort((a, b) => b - a).map((anoG) => (
        <section key={anoG} className="card">
          <div className="ano-titulo">{anoG}</div>
          <div className="grade" style={{ ['--min' as string]: '300px' }}>
            {lista.filter((r) => r.ano === anoG).sort((a, b) => Number(b.status === 'aberta') - Number(a.status === 'aberta')).map((r) => {
              const atual = r.etapas.find((e) => e.status === 'aberta')
              const ord = [...r.etapas].sort((a, b) => a.ordem - b.ordem)
              const nn = numeros[r.id]
              const pct = nn?.total ? Math.round((nn.feitas / nn.total) * 100) : null
              const totRes = nn ? Object.values(nn.faixas).reduce((s2, x) => s2 + x, 0) : 0
              return (
                <article key={r.id} className="rodada-card">
                  <div className="topo">
                    <div><span className="muted">{TIPO_RODADA[r.tipo]}</span><h3>{r.nome}</h3></div>
                    <span className={`pill ${STATUS_RODADA[r.status][1]}`}>{STATUS_RODADA[r.status][0]}</span>
                  </div>
                  {r.status === 'aberta' && atual && <span className="muted">Etapa {ord.indexOf(atual) + 1} de {ord.length}: <strong>{atual.nome}</strong></span>}
                  {r.status !== 'historica' && r.status !== 'rascunho' && nn && (
                    <>
                      <div className="linha entre" style={{ fontSize: 13 }}>
                        <span>{nn.part} participantes</span>
                        <span><strong>{pct ?? 0}%</strong> {r.tipo === 'contratacao' ? 'com aceite' : 'concluído'} ({nn.feitas}/{nn.total})</span>
                      </div>
                      <div className="barra"><i className={pct == null ? 'n' : pct >= 80 ? 'v' : pct >= 50 ? 'a' : 'l'} style={{ width: `${pct ?? 0}%` }} /></div>
                    </>
                  )}
                  {r.tipo === 'avaliativo' && totRes > 0 && (
                    <>
                      <div className="mini-faixas" aria-label="Distribuição das faixas">
                        {faixasPadrao.map((f, i) => (nn!.faixas[f] ?? 0) > 0 && (
                          <span key={f} title={`${f}: ${nn!.faixas[f]}`} style={{ flex: nn!.faixas[f], background: ['#ea7b5e', '#ffefab', '#4ed8b0', '#1e756a'][i], color: i === 3 ? '#fff' : '#130c0e' }}>{nn!.faixas[f]}</span>
                        ))}
                      </div>
                      <span className="muted">{totRes} resultados · {r.resultado_liberado_em ? `devolutiva liberada em ${data(r.resultado_liberado_em)}` : 'devolutiva ainda não liberada'}</span>
                    </>
                  )}
                  <div className="acoes">
                    {r.status === 'rascunho' && <button className="primario pequeno" onClick={() => abrirRodada(r.id)}>Abrir rodada</button>}
                    {r.status !== 'rascunho' && r.status !== 'historica' && <Link className="botao pequeno" to={`/rh/acompanhamento?rodada=${r.id}`}>Status</Link>}
                    {r.tipo === 'avaliativo' && r.status !== 'rascunho' && <Link className="botao pequeno" to={`/rh/resultados?rodada=${r.id}`}>Resultados</Link>}
                    {r.status === 'aberta' && atual && ord.indexOf(atual) < ord.length - 1 && <button className="pequeno" onClick={() => avancarEtapa(r)}>Fechar etapa</button>}
                    {r.status === 'aberta' && <button className="pequeno" onClick={() => encerrarRodada(r)}>Encerrar rodada</button>}
                    {r.status === 'encerrada' && <button className="primario pequeno" onClick={() => reabrirRodada(r)}>Reabrir rodada</button>}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
      {lista.length === 0 && <div className="card"><p className="muted">Nenhuma rodada ainda. Clique em "+ Nova rodada".</p></div>}
    </>
  )
}
