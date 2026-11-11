import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './styles.css'
import { AuthProvider, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import DefinirSenha from './pages/DefinirSenha'
import PrimeiroAdmin from './pages/PrimeiroAdmin'
import Inicio from './pages/participante/Inicio'
import Equipe from './pages/participante/Equipe'
import Formulario from './pages/participante/Formulario'
import MinhaAutoavaliacao from './pages/participante/MinhaAutoavaliacao'
import MeuResultado from './pages/participante/MeuResultado'
import Pdi from './pages/participante/Pdi'
import OneAOne from './pages/participante/OneAOne'
import Pessoas from './pages/rh/Pessoas'
import Rodadas from './pages/rh/Rodadas'
import Acompanhamento from './pages/rh/Acompanhamento'
import Resultados from './pages/rh/Resultados'
import Configuracao from './pages/rh/Configuracao'
import PainelEstrategico from './pages/rh/PainelEstrategico'

function Protegido({ rh, children }: { rh?: boolean; children: React.ReactNode }) {
  const { carregando, sessao, eu, ehRh } = useAuth()
  if (carregando) return <div className="login"><div className="card">Carregando…</div></div>
  if (!sessao) return <Navigate to="/login" replace />
  if (!eu) return (
    <div className="login"><div className="card">
      <h2>Acesso sem cadastro</h2>
      <p className="muted">Seu login não está vinculado a nenhuma pessoa ativa. Fale com o time de Gente e Gestão.</p>
    </div></div>
  )
  if (rh && !ehRh) return <Navigate to="/" replace />
  return <>{children}</>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/definir-senha" element={<DefinirSenha />} />
          <Route path="/configurar" element={<PrimeiroAdmin />} />
          <Route element={<Protegido><Layout /></Protegido>}>
            <Route index element={<Inicio />} />
            <Route path="autoavaliacao" element={<MinhaAutoavaliacao />} />
            <Route path="equipe" element={<Equipe />} />
            <Route path="avaliacao/:id" element={<Formulario />} />
            <Route path="resultado" element={<MeuResultado />} />
            <Route path="pdi" element={<Pdi />} />
            <Route path="one-a-one" element={<OneAOne />} />
            <Route path="rh" element={<Protegido rh><PainelEstrategico /></Protegido>} />
            <Route path="rh/pessoas" element={<Protegido rh><Pessoas /></Protegido>} />
            <Route path="rh/rodadas" element={<Protegido rh><Rodadas /></Protegido>} />
            <Route path="rh/acompanhamento" element={<Protegido rh><Acompanhamento /></Protegido>} />
            <Route path="rh/resultados" element={<Protegido rh><Resultados /></Protegido>} />
            <Route path="rh/estrategico" element={<Navigate to="/rh" replace />} />
            <Route path="rh/configuracao" element={<Protegido rh><Configuracao /></Protegido>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>,
)
