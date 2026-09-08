import { useEffect, useState } from 'react'
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import Board from './pages/Board'
import NovaDemanda from './pages/NovaDemanda'
import Demanda from './pages/Demanda'
import Candidatos from './pages/Candidatos'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const nav = useNavigate()
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) { setPerfil(null); return }
    supabase.from('perfis').select('*').eq('id', session.user.id).single().then(({ data }) => setPerfil(data))
  }, [session])
  if (session === undefined) return null
  if (!session) return <Login />
  return (
    <>
      <header className="top">
        <Link to="/" className="brand"><span className="cmyk"><i /><i /><i /><i /></span>Materiais impressos</Link>
        <nav>
          <Link to="/">Quadro</Link>
          <Link to="/candidatos">Candidatos</Link>
          <Link to="/nova" className="btn">Nova demanda</Link>
          <button className="link" onClick={() => supabase.auth.signOut().then(() => nav('/'))}>{perfil?.nome || 'Sair'} · sair</button>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Board perfil={perfil} />} />
        <Route path="/nova" element={<NovaDemanda perfil={perfil} />} />
        <Route path="/candidatos" element={<Candidatos />} />
        <Route path="/d/:id" element={<Demanda perfil={perfil} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  )
}
