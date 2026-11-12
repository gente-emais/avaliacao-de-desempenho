import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase, type Grupo, type StatusAvaliacao, type TipoRodada } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import ComoFunciona, { type Explicacao } from '../../components/ComoFunciona'
import { STATUS, TIPO_RODADA, dataHora, tituloTarefa, umAceite } from '../../lib/format'

// Visão do colaborador por processo (Contratação, Ciclo Avaliativo, Ciclo de Feedback):
// o que ele preenche e o que recebeu, rodada a rodada.
interface Item {
  id: string; grupo: Grupo; status: StatusAvaliacao; avaliado_id: string; avaliador_id: string; enviada_em: string | null
  rodada: { id: string; nome: string; ano: number; status: string; tipo: TipoRodada; resultado_liberado_em: string | null }
  avaliado: { nome: string } | null
  aceite: { aceito_em: string } | { aceito_em: string }[] | null
}

// Passo a passo de cada processo, em linguagem simples para o colaborador
const EXPLICA: Record<TipoRodada, Explicacao> = {
  contratacao: {
    resumo: 'É o combinado do ano entre você e seu gestor: o que se espera do seu trabalho. Ele serve de base para o Ciclo Avaliativo.',
    passos: [
      { titulo: 'Conversa de contratação', quem: 'Você e seu gestor', texto: 'No início do ciclo, vocês conversam sobre suas entregas, metas e os comportamentos esperados para o ano.' },
      { titulo: 'Registro do combinado', quem: 'Seu gestor', texto: 'O gestor registra no sistema o que foi combinado. Você não precisa preencher nada nesta etapa.' },
      { titulo: 'Seu aceite', quem: 'Você', texto: 'Leia o registro e confirme em "Li e estou ciente". Se algo não estiver como foi conversado, fale com seu gestor antes de dar o aceite.' },
      { titulo: 'Acompanhamento', quem: 'Ao longo do ano', texto: 'Retome esse combinado nos One a One e registre suas entregas no Diário de bordo. Isso ajuda muito na hora da avaliação.' },
    ],
    ondeVer: 'Quando o gestor registrar a sua contratação, ela aparece aqui com o botão "Ler e dar aceite".',
  },
  avaliativo: {
    resumo: 'É o momento de olhar para o seu desempenho no período, nas competências da EMAIS. Cada competência recebe uma faixa: A desenvolver, Em desenvolvimento, Desenvolvido ou Consolidado.',
    passos: [
      { titulo: 'Pré-work', quem: 'Você', texto: 'Algumas perguntas rápidas sobre você, como escolaridade e formação. Elas vêm junto com a sua autoavaliação.' },
      { titulo: 'Autoavaliação', quem: 'Você', texto: 'Em cada competência, escolha a faixa que melhor descreve como você atuou no período e comente com exemplos reais. Dica: o Diário de bordo ajuda a lembrar suas entregas.' },
      { titulo: 'Avaliação do gestor', quem: 'Seu gestor', texto: 'Seu gestor avalia você nas mesmas competências e registra a percepção dele sobre o seu potencial. Você não precisa fazer nada nesta etapa.' },
      { titulo: 'Devolutiva', quem: 'Você e seu gestor', texto: 'Conversa para alinhar o resultado, reconhecer seus pontos fortes e combinar o que desenvolver. Os combinados podem virar ações do seu PDI.' },
    ],
    ondeVer: 'Quando o RH liberar, o resultado completo, com as avaliações e os comentários, aparece em Meu resultado. Depois vem o Ciclo de Feedback, que fecha a entrega do ciclo.',
  },
  feedback: {
    resumo: 'É a etapa final do ano, depois do Ciclo Avaliativo: a conversa em que o gestor dá o retorno sobre o seu resultado e vocês combinam os próximos passos.',
    passos: [
      { titulo: 'Conversa de feedback', quem: 'Você e seu gestor', texto: 'Com o resultado do Ciclo Avaliativo em mãos, o gestor conversa com você sobre seus pontos fortes e o que você pode desenvolver.' },
      { titulo: 'Registro dos acordos', quem: 'Seu gestor', texto: 'O gestor registra no sistema os pontos conversados e os acordos feitos.' },
      { titulo: 'Sua resposta', quem: 'Você', texto: 'Você confirma se recebeu o feedback no prazo e se concorda com o que foi registrado. Se quiser, deixe um comentário.' },
      { titulo: 'Próximos passos', quem: 'Você e seu gestor', texto: 'Os acordos viram ações do seu PDI e são acompanhados nos One a One ao longo do próximo ciclo.' },
    ],
    ondeVer: 'Quando o gestor registrar o feedback, ele aparece aqui para você responder.',
  },
}

export default function MinhasRodadas({ tipo }: { tipo: TipoRodada }) {
  const { eu } = useAuth()
  const [itens, setItens] = useState<Item[] | null>(null)
  const [historicas, setHistoricas] = useState<Item['rodada'][]>([])
  const [params] = useSearchParams()
  const rodadaSel = params.get('rodada')
  const anoSel = params.get('ano') ? Number(params.get('ano')) : null

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
    // Ciclo Avaliativo: rodadas em que tenho resultado e nenhum formulário (ex.: importadas da Mindsight)
    if (tipo === 'avaliativo') {
      supabase.from('resultados').select('rodada:rodadas!inner(id, nome, ano, status, tipo, resultado_liberado_em)').eq('pessoa_id', eu.id).eq('rodada.tipo', 'avaliativo')
        .then(({ data }) => setHistoricas(((data as unknown as { rodada: Item['rodada'] }[]) ?? []).map((x) => x.rodada)))
    } else setHistoricas([])
  }, [eu?.id, tipo])

  if (!eu) return null
  const todasRodadas = [...new Map([...historicas, ...(itens ?? []).map((i) => i.rodada)].map((r) => [r.id, r])).values()]
    .sort((a, b) => Number(b.status === 'aberta') - Number(a.status === 'aberta') || b.ano - a.ano)
  const rodadas = rodadaSel ? todasRodadas.filter((r) => r.id === rodadaSel) : anoSel ? todasRodadas.filter((r) => r.ano === anoSel) : todasRodadas

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
      <ComoFunciona titulo={TIPO_RODADA[tipo]} explicacao={EXPLICA[tipo]} aberto={itens !== null && todasRodadas.length === 0} />
      {todasRodadas.length > 1 && (
        <nav className="anos" aria-label="Escolher a rodada">
          <span className="muted">Rodadas:</span>
          <Link className={`ano${!rodadaSel ? ' atual' : ''}`} to={`/?aba=${tipo}`}>Todas</Link>
          {todasRodadas.map((r) => (
            <Link key={r.id} className={`ano${rodadaSel === r.id ? ' atual' : ''}`} to={`/?aba=${tipo}&rodada=${r.id}`} aria-current={rodadaSel === r.id ? 'page' : undefined}>
              {r.status === 'aberta' && <span className="ponto" aria-hidden="true" />}{r.ano}
            </Link>
          ))}
        </nav>
      )}
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
            {doRound.length === 0 && <p className="muted">Resultado trazido do sistema anterior; os formulários dessa rodada não estão aqui.</p>}
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
