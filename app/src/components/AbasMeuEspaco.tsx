import { Link, useLocation } from 'react-router-dom'

// Abas do Meu espaço: o que fazer agora + uma aba por processo
const ABAS = [
  { id: 'agora', rotulo: 'O que fazer agora', to: '/' },
  { id: 'contratacao', rotulo: 'Contratação de Desempenho', to: '/?aba=contratacao' },
  { id: 'avaliativo', rotulo: 'Ciclo Avaliativo', to: '/?aba=avaliativo' },
  { id: 'feedback', rotulo: 'Ciclo de Feedback', to: '/?aba=feedback' },
  { id: 'pdi', rotulo: 'PDI', to: '/pdi' },
  { id: 'one', rotulo: 'One a One', to: '/one-a-one' },
]

export default function AbasMeuEspaco() {
  const { pathname, search } = useLocation()
  const aba = pathname.endsWith('/pdi') ? 'pdi' : pathname.endsWith('/one-a-one') ? 'one'
    : new URLSearchParams(search).get('aba') ?? 'agora'
  return (
    <nav aria-label="Processos do Meu espaço" className="abas">
      {ABAS.map((a) => (
        <Link key={a.id} to={a.to} className="aba" aria-current={aba === a.id ? 'page' : undefined}>{a.rotulo}</Link>
      ))}
    </nav>
  )
}
