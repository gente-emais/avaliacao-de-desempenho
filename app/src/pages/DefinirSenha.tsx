import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Página aberta pelo link do e-mail (primeiro acesso ou recuperação).
export default function DefinirSenha() {
  const nav = useNavigate()
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState('')

  async function salvar(e: FormEvent) {
    e.preventDefault()
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.')
    if (senha !== conf) return setErro('As senhas não conferem.')
    const { error } = await supabase.auth.updateUser({ password: senha })
    if (error) return setErro('O link expirou. Volte ao login e peça um novo.')
    nav('/')
  }

  return (
    <div className="login">
      <form className="card" onSubmit={salvar}>
        <h1>Criar senha</h1>
        <p className="muted">Depois disso, você entra sempre com seu CPF e esta senha.</p>
        <label className="campo">Nova senha<input type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} /></label>
        <label className="campo">Repita a senha<input type="password" autoComplete="new-password" value={conf} onChange={(e) => setConf(e.target.value)} /></label>
        {erro && <div className="aviso erro">{erro}</div>}
        <button className="primario">Salvar senha</button>
      </form>
    </div>
  )
}
