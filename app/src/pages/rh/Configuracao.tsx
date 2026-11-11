import { useSearchParams } from 'react-router-dom'
import Faixas from './config/Faixas'
import Formularios from './config/Formularios'
import Colaboradores from './config/Colaboradores'
import ImportarResultados from './config/ImportarResultados'

const ABAS = [
  ['faixas', 'Faixas de classificação'],
  ['formularios', 'Formulários'],
  ['colaboradores', 'Colaboradores'],
  ['importar', 'Importar resultados'],
] as const

export default function Configuracao() {
  const [params, setParams] = useSearchParams()
  const aba = params.get('aba') ?? 'faixas'
  return (
    <>
      <div className="cabecalho"><div><div className="migalha">Visão RH</div><h1>Configuração</h1></div></div>
      <div role="tablist" className="linha" style={{ borderBottom: '1px solid var(--borda)', gap: 4 }}>
        {ABAS.map(([id, nome]) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => setParams({ aba: id })}
            style={{ border: 0, borderRadius: '10px 10px 0 0', background: aba === id ? '#fff' : 'transparent',
              borderBottom: aba === id ? '3px solid var(--verde-escuro)' : '3px solid transparent', color: aba === id ? 'var(--texto)' : 'var(--muted)' }}>
            {nome}
          </button>
        ))}
      </div>
      {aba === 'faixas' && <Faixas />}
      {aba === 'formularios' && <Formularios />}
      {aba === 'colaboradores' && <Colaboradores />}
      {aba === 'importar' && <ImportarResultados />}
    </>
  )
}
