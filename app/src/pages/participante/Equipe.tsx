import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, PESSOA_COLS, type Pessoa, type Grupo, type StatusAvaliacao, type TipoRodada } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { STATUS, iniciais, nota } from '../../lib/format'

interface Av { id: string; grupo: Grupo; status: StatusAvaliacao; avaliado_id: string; avaliador_id: string; rodada: { nome: string; tipo: TipoRodada; status: string }; aceite: { aceito_em: string }[] }
interface Res { pessoa_id: string; nota_final: number | null; faixa_nome: string | null; rodada: { nome: string } }

const TIPO_CURTO: Record<TipoRodada, string> = { contratacao: 'Contratação', avaliativo: 'Avaliação', feedback: 'Feedback' }

export default function Equipe() {
  const { eu } = useAuth()
  const [time, setTime] = useState<Pessoa[]>([])
  const [avs, setAvs] = useState<Av[]>([])
  const [res, setRes] = useState<Res[]>([])
  const [perfis, setPerfis] = useState<Record<number, string>>({})

  useEffect(() => {
    if (!eu) return
    ;(async () => {
      const { data: p } = await supabase.from('pessoas').select(PESSOA_COLS).eq('gestor_id', eu.id).eq('ativo', true).order('nome')
      const pessoas = (p as Pessoa[]) ?? []
      setTime(pessoas)
      const ids = pessoas.map((x) => x.id)
      if (!ids.length) return
      const [a, r, pf] = await Promise.all([
        supabase.from('avaliacoes').select('id, grupo, status, avaliado_id, avaliador_id, rodada:rodadas!inner(nome, tipo, status), aceite:aceites(aceito_em)')
          .in('avaliado_id', ids).eq('rodada.status', 'aberta'),
        supabase.from('resultados').select('pessoa_id, nota_final, faixa_nome, rodada:rodadas(nome)').in('pessoa_id', ids).order('calculado_em', { ascending: false }),
        supabase.from('perfis').select('id, nome'),
      ])
      setAvs((a.data as unknown as Av[]) ?? [])
      setRes((r.data as unknown as Res[]) ?? [])
      setPerfis(Object.fromEntries(((pf.data as { id: number; nome: string }[]) ?? []).map((x) => [x.id, x.nome])))
    })()
  }, [eu?.id])

  return (
    <>
      <div className="cabecalho">
        <div><div className="migalha">Meu espaço</div><h1>Minha equipe</h1></div>
        <span className="muted">{time.length} liderados · tudo de cada pessoa num cartão</span>
      </div>
      <div className="grade" style={{ ['--min' as string]: '300px' }}>
        {time.map((p) => {
          const minhas = avs.filter((a) => a.avaliado_id === p.id && a.grupo === 'gestor' && a.avaliador_id === eu?.id)
          const auto = avs.filter((a) => a.avaliado_id === p.id && a.grupo === 'auto')
          const ultimo = res.find((r) => r.pessoa_id === p.id)
          const pendente = minhas.find((a) => ['pendente', 'em_andamento'].includes(a.status))
          return (
            <article className="card" key={p.id}>
              <div className="linha">
                <div className="avatar">{iniciais(p.nome)}</div>
                <div><strong>{p.nome}</strong><div className="muted">{p.cargo ?? '—'}</div></div>
              </div>
              <div className="linha">
                {p.perfil_id && <span className="pill roxo">{perfis[p.perfil_id]}</span>}
                {p.acesso_assistido && <span className="pill pend">Você preenche por ele</span>}
              </div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 12px', fontSize: 13 }}>
                {minhas.map((a) => (
                  <Linha key={a.id} k={TIPO_CURTO[a.rodada.tipo]}
                    v={a.rodada.tipo === 'contratacao' && a.status === 'concluida' ? (a.aceite?.length ? 'Ciente' : 'Sem aceite') : STATUS[a.status].rotulo}
                    c={a.rodada.tipo === 'contratacao' && a.status === 'concluida' && !a.aceite?.length ? 'pend' : STATUS[a.status].classe} />
                ))}
                {auto.map((a) => <Linha key={a.id} k={a.rodada.tipo === 'feedback' ? 'Resposta ao feedback' : 'Autoavaliação'} v={STATUS[a.status].rotulo} c={STATUS[a.status].classe} />)}
                {ultimo && <Linha k="Último resultado" v={`${nota(ultimo.nota_final)} · ${ultimo.faixa_nome ?? ''}`} c="neutro" />}
                {!minhas.length && !auto.length && !ultimo && <Linha k="Rodadas" v="Nenhuma aberta" c="neutro" />}
              </dl>
              {pendente
                ? <Link className="botao primario" to={`/avaliacao/${pendente.id}`} style={{ justifyContent: 'center' }}>{pendente.status === 'pendente' ? 'Começar' : 'Continuar'}</Link>
                : <Link className="botao" to="/one-a-one" style={{ justifyContent: 'center' }}>Abrir One a One</Link>}
            </article>
          )
        })}
      </div>
    </>
  )
}

function Linha({ k, v, c }: { k: string; v: string; c: string }) {
  return (<><dt className="muted">{k}</dt><dd style={{ margin: 0, textAlign: 'right' }}><span className={`pill ${c}`}>{v}</span></dd></>)
}
