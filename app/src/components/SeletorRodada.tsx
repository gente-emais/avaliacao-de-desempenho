import type { Rodada, TipoRodada } from '../lib/supabase'
import { TIPO_RODADA } from '../lib/format'

// Escolha da rodada em dois toques: o processo e depois o ano (no lugar de uma lista suspensa longa).
const SITUACAO: Record<Rodada['status'], [string, string]> = {
  rascunho: ['rascunho', 'neutro'], aberta: ['aberta', 'ok'], encerrada: ['encerrada', 'roxo'], historica: ['histórico', 'neutro'],
}

export default function SeletorRodada({ rodadas, valor, onChange, tipos }: {
  rodadas: Rodada[]; valor: string; onChange: (id: string) => void; tipos?: TipoRodada[]
}) {
  const lista = rodadas.filter((r) => r.status !== 'rascunho' && (!tipos || tipos.includes(r.tipo)))
  const atual = lista.find((r) => r.id === valor)
  const tiposPresentes = (Object.keys(TIPO_RODADA) as TipoRodada[]).filter((t) => lista.some((r) => r.tipo === t))
  const tipo = atual?.tipo ?? tiposPresentes[0]
  const doTipo = lista.filter((r) => r.tipo === tipo).sort((a, b) => b.ano - a.ano || Number(b.status === 'aberta') - Number(a.status === 'aberta'))
  // quando há mais de uma rodada no mesmo ano, mostra o nome para diferenciar
  const repetido = (r: Rodada) => doTipo.filter((x) => x.ano === r.ano).length > 1

  if (!lista.length) return <p className="muted">Nenhuma rodada ainda. Crie em Rodadas e resultados.</p>
  return (
    <div className="seletor-rodada">
      {tiposPresentes.length > 1 && (
        <div className="seg" role="tablist" aria-label="Processo">
          {tiposPresentes.map((t) => (
            <button key={t} role="tab" aria-selected={t === tipo}
              onClick={() => { const r = lista.filter((x) => x.tipo === t).sort((a, b) => Number(b.status === 'aberta') - Number(a.status === 'aberta') || b.ano - a.ano)[0]; if (r) onChange(r.id) }}>
              {TIPO_RODADA[t]}
            </button>
          ))}
        </div>
      )}
      <div className="anos" role="radiogroup" aria-label="Rodada">
        {doTipo.map((r) => (
          <button key={r.id} role="radio" aria-checked={r.id === valor} className={`ano${r.id === valor ? ' atual' : ''}`} onClick={() => onChange(r.id)} title={r.nome}>
            {r.status === 'aberta' && <span className="ponto" aria-hidden="true" />}
            {repetido(r) ? r.nome.replace(TIPO_RODADA[r.tipo], '').trim() || r.nome : r.ano}
          </button>
        ))}
      </div>
      {atual && <span className="muted">{atual.nome} · <span className={`pill ${SITUACAO[atual.status][1]}`}>{SITUACAO[atual.status][0]}</span>{atual.resultado_liberado_em ? <> · <span className="pill ok">devolutiva liberada</span></> : null}</span>}
    </div>
  )
}
