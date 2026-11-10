import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { entrarComCpf, pedirLinkDeSenha, useAuth } from '../lib/auth'

const mascaraCpf = (v: string) => {
  if (/[a-z@]/i.test(v)) return v
  const d = v.replace(/\D/g, '').slice(0, 11)
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

export default function Login() {
  const { sessao } = useAuth()
  const nav = useNavigate()
  const [cpf, setCpf] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (sessao) return <Navigate to="/" replace />

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro(''); setMsg(''); setEnviando(true)
    try { await entrarComCpf(cpf, senha); nav('/') } catch (err) { setErro((err as Error).message) } finally { setEnviando(false) }
  }

  async function primeiroAcesso() {
    setErro(''); setMsg('')
    if (cpf.replace(/\D/g, '').length !== 11) { setErro('Digite seu CPF para receber o link.'); return }
    try {
      await pedirLinkDeSenha(cpf)
      setMsg('Se o CPF estiver cadastrado, enviamos um link para o e-mail do seu cadastro.')
    } catch (err) { setErro((err as Error).message) }
  }

  return (
    <div className="login">
      <form className="card" onSubmit={entrar}>
        <div className="marca" style={{ padding: 0 }}>
          <div className="marca-logo">E</div>
          <div><strong>EMAIS Desempenho</strong><small style={{ color: 'var(--muted)' }}>Gente e Gestão</small></div>
        </div>
        <h1>Entrar</h1>
        <label className="campo">CPF ou e-mail
          <input autoComplete="username" value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} placeholder="000.000.000-00" required />
        </label>
        <label className="campo">Senha
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>
        {erro && <div className="aviso erro">{erro}</div>}
        {msg && <div className="aviso ok">{msg}</div>}
        <button className="primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        <button type="button" onClick={primeiroAcesso}>Primeiro acesso ou esqueci a senha</button>
      </form>
    </div>
  )
}
