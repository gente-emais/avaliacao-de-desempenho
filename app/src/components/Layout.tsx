import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'

export default function Layout() {
  const { eu, ehRh, ehAdmin, temEquipe, sair } = useAuth()
  const [trocou] = useState(() => { try { const v = sessionStorage.getItem('troca-login'); sessionStorage.removeItem('troca-login'); return !!v } catch { return false } })
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="marca">
          <div className="marca-logo">E</div>
          <div><strong>EMAIS Desempenho</strong><small>Gente e Gestão</small></div>
        </div>
        {ehRh && (
          <nav className="nav" aria-label="Visão RH">
            <span className="nav-titulo">Visão RH</span>
            <NavLink to="/rh" end>Painel estratégico</NavLink>
            <NavLink to="/rh/rodadas">Rodadas e resultados</NavLink>
            <NavLink to="/rh/acompanhamento">Status das avaliações</NavLink>
            <NavLink to="/rh/pessoas">Base de colaboradores</NavLink>
            {ehAdmin && <NavLink to="/rh/configuracao">Configuração</NavLink>}
          </nav>
        )}
        <nav className="nav" aria-label="Meu espaço">
          <span className="nav-titulo">Meu espaço</span>
          <NavLink to="/" end>Início</NavLink>
          {temEquipe && <NavLink to="/equipe">Minha equipe</NavLink>}
          <NavLink to="/diario">Diário de bordo</NavLink>
          <NavLink to="/resultado">Meu resultado</NavLink>
        </nav>
        <div className="sidebar-rodape">
          <span>{eu?.nome}</span>
          <button type="button" className="pequeno" onClick={sair}>Sair</button>
        </div>
      </aside>
      <main className="conteudo">
        {trocou && <div className="aviso pend">Outra aba deste navegador entrou com outro login. Esta janela agora está como <strong>{eu?.nome}</strong>. Para testar vários usuários ao mesmo tempo, use uma janela anônima ou outro navegador para cada login.</div>}
        <Outlet />
      </main>
    </div>
  )
}
