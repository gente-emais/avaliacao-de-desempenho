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
  const aba = pathname.endsWith('/diario') ? 'diario' : pathname.endsWith('/pdi') ? 'pdi' : pathname.endsWith('/one-a-one') ? 'one'
    : new URLSearchParams(search).get('aba') ?? 'agora'
  // mantém os filtros do topo (ano, pessoa, situação) ao trocar de aba
  const atuais = new URLSearchParams(search)
  const comFiltros = (to: string) => {
    if (!to.startsWith('/?') && to !== '/') return atuais.get('ano') && to !== '/diario' ? `${to}?ano=${atuais.get('ano')}` : to
    const n = new URLSearchParams(to.split('?')[1] ?? '')
    ;['ano', 'pessoa', 'sit'].forEach((k) => { const v = atuais.get(k); if (v) n.set(k, v) })
    const q = n.toString()
    return q ? `/?${q}` : '/'
  }
  return (
    <nav aria-label="Processos do Meu espaço" className="abas">
      {ABAS.map((a) => (
        <Link key={a.id} to={comFiltros(a.to)} className="aba" aria-current={aba === a.id ? 'page' : undefined}>{a.rotulo}</Link>
      ))}
    </nav>
  )
}
