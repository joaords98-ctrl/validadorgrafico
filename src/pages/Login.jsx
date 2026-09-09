import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
export default function Login({ onEntrar, liberado, onSenha }) {
  const [senha, setSenha] = useState('')
  const [erroSenha, setErroSenha] = useState('')
  const [lista, setLista] = useState([])
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')
  useEffect(() => { if (liberado) supabase.from('gr_perfis').select('id,nome,papel').order('nome').then(({ data }) => setLista(data || [])) }, [])
  async function entrar(e) {
    e.preventDefault(); setErro('')
    const n = nome.trim(); if (!n) return
    let p = lista.find(x => x.nome.toLowerCase() === n.toLowerCase())
    if (!p) { const { data, error } = await supabase.from('gr_perfis').insert({ nome: n }).select().single(); if (error) return setErro(error.message); p = data }
    onEntrar(p)
  }
  if (!liberado) return (
    <main className="login">
      <form onSubmit={checar} className="card">
        <img className="logo" src="/missao.png" alt="Missão" /><h1>Validador Gráfico</h1>
        <p className="muted">Digite a senha da equipe, do partido ou da gráfica.</p>
        <label>Senha<input type="password" value={senha} onChange={e => setSenha(e.target.value)} autoFocus /></label>
        {erroSenha && <p className="err">{erroSenha}</p>}
        <button className="btn" type="submit">Entrar</button>
      </form>
    </main>
  )
  return (
    <main className="login">
      <form onSubmit={entrar} className="card">
        <img className="logo" src="/missao.png" alt="Missão" /><h1>Validador Gráfico</h1>
        <p className="muted">Quem está usando? O nome fica registrado no histórico de cada demanda.</p>
        {lista.length > 0 && <div className="nomes">{lista.map(p => <button type="button" key={p.id} className="btn ghost" onClick={() => onEntrar(p)}>{p.nome}</button>)}</div>}
        <label>Ou digite um nome novo<input value={nome} onChange={e => setNome(e.target.value)} placeholder="ex. Murilo" autoFocus /></label>
        {erro && <p className="err">{erro}</p>}
        <button className="btn" type="submit">Entrar</button>
      </form>
    </main>
  )
}
