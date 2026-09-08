import { useState } from 'react'
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { configOk } from './lib/supabase'
import Login from './pages/Login'
import Board from './pages/Board'
import NovaDemanda from './pages/NovaDemanda'
import Demanda from './pages/Demanda'
import Candidatos from './pages/Candidatos'
import Aprovar from './pages/Aprovar'
import Lote from './pages/Lote'
import Relatorio from './pages/Relatorio'

const KEY = 'grafica.usuario'

export default function App() {
  const loc = useLocation()
  const [perfil, setPerfil] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } })
  if (!configOk) return <main className="login"><div className="card"><h1>Configuração faltando</h1><p>As variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> não estão definidas. No Vercel: Settings → Environment Variables → adicione as duas e faça <strong>Redeploy</strong>.</p></div></main>
  if (loc.pathname.startsWith('/a/') || loc.pathname.startsWith('/c/')) return <Routes><Route path="/a/:token" element={<Aprovar modo="candidato" />} /><Route path="/c/:token" element={<Aprovar modo="coordenacao" />} /></Routes>
  if (!perfil) return <Login onEntrar={p => { localStorage.setItem(KEY, JSON.stringify(p)); setPerfil(p) }} />
  const sair = () => { localStorage.removeItem(KEY); setPerfil(null) }
  return (
    <>
      <header className="top">
        <Link to="/" className="brand"><img src="/missao.png" alt="Missão" /><span>Validador Gráfico<small>Materiais impressos · Missão Paraná</small></span></Link>
        <nav>
          <Link to="/">Quadro</Link>
          <Link to="/candidatos">Candidatos</Link>
          <Link to="/relatorio">Relatório</Link>
          <Link to="/lote">Criar em lote</Link>
          <Link to="/nova" className="btn">Nova demanda</Link>
          <button className="link" onClick={sair}>{perfil.nome} · trocar</button>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Board perfil={perfil} />} />
        <Route path="/nova" element={<NovaDemanda perfil={perfil} />} />
        <Route path="/candidatos" element={<Candidatos />} />
        <Route path="/lote" element={<Lote perfil={perfil} />} />
        <Route path="/relatorio" element={<Relatorio />} />
        <Route path="/d/:id" element={<Demanda perfil={perfil} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  )
}
