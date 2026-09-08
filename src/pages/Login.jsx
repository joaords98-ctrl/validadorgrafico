import { useState } from 'react'
import { supabase } from '../lib/supabase'
export default function Login() {
  const [email, setEmail] = useState(''), [senha, setSenha] = useState(''), [erro, setErro] = useState('')
  async function entrar(e) {
    e.preventDefault(); setErro('')
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro('E-mail ou senha incorretos.')
  }
  return (
    <main className="login">
      <form onSubmit={entrar} className="card">
        <h1><span className="cmyk"><i /><i /><i /><i /></span>Materiais impressos</h1>
        <p className="muted">Fluxo de trabalho da equipe de design e gráfica.</p>
        <label>E-mail<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus /></label>
        <label>Senha<input type="password" value={senha} onChange={e => setSenha(e.target.value)} required /></label>
        {erro && <p className="err">{erro}</p>}
        <button className="btn" type="submit">Entrar</button>
      </form>
    </main>
  )
}
