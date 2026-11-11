import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, type Grupo, type StatusAvaliacao, type TipoRodada } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { STATUS, TIPO_RODADA, dataHora, tituloTarefa, umAceite } from '../../lib/format'

// Visão do colaborador por processo (Contratação, Ciclo Avaliativo, Ciclo de Feedback):
// o que ele preenche e o que recebeu, rodada a rodada.
interface Item {
  id: string; grupo: Grupo; status: StatusAvaliacao; avaliado_id: string; avaliador_id: string; enviada_em: string | null
  rodada: { id: string; nome: string; ano: number; status: string; tipo: TipoRodada; resultado_liberado_em: string | null }
  avaliado: { nome: string } | null
  aceite: { aceito_em: string } | { aceito_em: string }[] | null
}

const EXPLICA: Record<TipoRodada, string> = {
  contratacao: 'O gestor registra o que foi combinado para o ano e você dá o aceite de que leu e está ciente.',
  avaliativo: 'Pré-work, autoavaliação, avaliação do seu gestor e, conforme o seu perfil, avaliação de pares. O resultado aparece em Meu resultado quando o RH liberar.',
  feedback: 'O gestor registra os acordos da conversa de feedback e você responde se recebeu no prazo e se concorda.',
}

export default function MinhasRodadas({ tipo }: { tipo: TipoRodada }) {
  const { eu } = useAuth()
  const [itens, setItens] = useState<Item[] | null>(null)

  useEffect(() => {
    if (!eu) return
    setItens(null)
    supabase.from('avaliacoes')
      .select('id, grupo, status, avaliado_id, avaliador_id, enviada_em, rodada:rodadas!inner(id, nome, ano, status, tipo, resultado_liberado_em), avaliado:pessoas!avaliacoes_avaliado_id_fkey(nome), aceite:aceites(aceito_em)')
      .eq('rodada.tipo', tipo).neq('status', 'cancelada').neq('rodada.status', 'rascunho')
      .or(`avaliador_id.eq.${eu.id},avaliado_id.eq.${eu.id}`)
      .then(({ data }) => {
        const l = ((data as unknown as Item[]) ?? []).filter((x) =>
          // o que eu preencho, e o registro do gestor sobre mim na Contratação e no Feedback (as avaliações sobre mim no Ciclo ficam em Meu resultado)
          x.avaliador_id === eu.id || (x.avaliado_id === eu.id && x.grupo === 'gestor' && tipo !== 'avaliativo' && x.status === 'concluida'))
        setItens(l)
      })
  }, [eu?.id, tipo])

  if (!eu) return null
  const rodadas = [...new Map((itens ?? []).map((i) => [i.rodada.id, i.rodada])).values()]
    .sort((a, b) => Number(b.status === 'aberta') - Number(a.status === 'aberta') || b.ano - a.ano)

  function linha(i: Item) {
    const souAvaliado = i.avaliado_id === eu!.id
    const recebido = souAvaliado && i.avaliador_id !== eu!.id
    const aceite = umAceite(i.aceite)
    const titulo = recebido
      ? (tipo === 'contratacao' ? 'Sua contratação (registrada pelo gestor)' : 'Feedback que você recebeu')
      : tituloTarefa(tipo, i.grupo, i.avaliado?.nome ?? '', souAvaliado)
    const situacao: [string, string] = tipo === 'contratacao' && recebido
      ? (aceite ? [`Ciente em ${dataHora(aceite.aceito_em)}`, 'ok'] : ['Falta o seu aceite', 'pend'])
      : [STATUS[i.status].rotulo, STATUS[i.status].classe]
    const fazer = !recebido && (i.status === 'pendente' || i.status === 'em_andamento') && i.rodada.status === 'aberta'
    const botao = fazer ? (i.status === 'pendente' ? 'Começar' : 'Continuar')
      : tipo === 'contratacao' && recebido && !aceite ? 'Ler e dar aceite' : 'Ver'
    return (
      <div key={i.id} className="linha entre" style={{ borderTop: '1px solid #e8eef6', paddingTop: 12 }}>
        <div>
          <strong>{titulo}</strong>
          <div className="linha" style={{ marginTop: 6 }}><span className={`pill ${situacao[1]}`}>{situacao[0]}</span></div>
        </div>
        <Link className={`botao pequeno ${fazer || botao === 'Ler e dar aceite' ? 'primario' : ''}`} to={`/avaliacao/${i.id}`}>{botao}</Link>
      </div>
    )
  }

  return (
    <>
      <p className="muted" style={{ maxWidth: 820 }}>{EXPLICA[tipo]}</p>
      {itens === null && <div className="card"><p>Carregando…</p></div>}
      {itens !== null && rodadas.length === 0 && (
        <div className="card"><p>Você ainda não tem nada em {TIPO_RODADA[tipo]}. Quando o RH abrir uma rodada, ela aparece aqui.</p></div>
      )}
      {rodadas.map((r) => {
        const doRound = (itens ?? []).filter((i) => i.rodada.id === r.id)
          .sort((a, b) => Number(b.avaliado_id === eu.id) - Number(a.avaliado_id === eu.id) || (a.avaliado?.nome ?? '').localeCompare(b.avaliado?.nome ?? ''))
        return (
          <section className="card" key={r.id}>
            <div className="linha entre">
              <h2>{r.nome}</h2>
              <span className={`pill ${r.status === 'aberta' ? 'ok' : 'neutro'}`}>{r.status === 'aberta' ? 'Em andamento' : 'Encerrada'}</span>
            </div>
            {doRound.map(linha)}
            {tipo === 'avaliativo' && r.resultado_liberado_em && (
              <div className="linha" style={{ borderTop: '1px solid #e8eef6', paddingTop: 12 }}>
                <Link className="botao pequeno" to="/resultado">Ver meu resultado</Link>
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
