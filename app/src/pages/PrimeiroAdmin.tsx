import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { entrarComCpf } from '../lib/auth'

// Configuração inicial: só funciona enquanto o sistema não tiver nenhum RH administrador.
export default function PrimeiroAdmin() {
  const nav = useNavigate()
  const [disponivel, setDisponivel] = useState<boolean | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    supabase.functions.invoke('primeiro-admin', { method: 'GET' })
      .then(({ data }) => setDisponivel(!!(data as { disponivel?: boolean })?.disponivel))
      .catch(() => setDisponivel(false))
  }, [])

  async function criar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErro('')
    const f = new FormData(e.currentTarget)
    const corpo = { cpf: f.get('cpf'), nome: f.get('nome'), email: f.get('email'), senha: f.get('senha') }
    const { error } = await supabase.functions.invoke('primeiro-admin', { body: corpo })
    if (error) {
      let msg = 'Não foi possível criar o administrador.'
      try { const c = await (error as { context?: Response }).context?.json(); if (c?.erro) msg = c.erro } catch { /* padrão */ }
      return setErro(msg)
    }
    await entrarComCpf(String(corpo.cpf), String(corpo.senha))
    nav('/rh/pessoas')
  }

  return (
    <div className="login">
      {disponivel === null ? <div className="card">Verificando…</div> : !disponivel ? (
        <div className="card"><h1>Configuração concluída</h1><p className="muted">O sistema já tem um administrador. Entre pela tela de login.</p><a className="botao primario" href={`${import.meta.env.BASE_URL}login`}>Ir para o login</a></div>
      ) : (
        <form className="card" onSubmit={criar}>
          <h1>Configuração inicial</h1>
          <p className="muted">Crie o primeiro administrador de RH. Depois disso esta tela deixa de funcionar.</p>
          <label className="campo">Nome<input name="nome" required /></label>
          <label className="campo">CPF<input name="cpf" inputMode="numeric" required /></label>
          <label className="campo">E-mail corporativo<input name="email" type="email" /></label>
          <label className="campo">Senha (mínimo 8 caracteres)<input name="senha" type="password" minLength={8} required /></label>
          {erro && <div className="aviso erro">{erro}</div>}
          <button className="primario">Criar administrador</button>
        </form>
      )}
    </div>
  )
}
