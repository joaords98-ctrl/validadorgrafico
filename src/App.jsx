import { useState, useEffect } from 'react'
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { supabase, configOk } from './lib/supabase'
import Login from './pages/Login'
import Board from './pages/Board'
import NovaDemanda from './pages/NovaDemanda'
import Demanda from './pages/Demanda'
import Candidatos from './pages/Candidatos'
import Aprovar from './pages/Aprovar'
import Lote from './pages/Lote'
import Relatorio from './pages/Relatorio'
import Partido from './pages/Partido'
import Grafica from './pages/Grafica'

const KEY = 'grafica.usuario', SKEY = 'grafica.senha'

export default function App() {
  const loc = useLocation()
  const [perfil, setPerfil] = useState(() => { try { return JSON.parse(localStorage.getItem(KEY)) } catch { return null } })
  const [liberado, setLiberado] = useState(undefined) // false | 'equipe' | 'partido' | 'grafica'
  useEffect(() => {
    if (!configOk) return
    const s = localStorage.getItem(SKEY)
    if (!s) { setLiberado(false); return }
    supabase.rpc('gr_checar_senha', { s }).then(({ data }) => { if (!data) localStorage.removeItem(SKEY); setLiberado(data || false) })
  }, [])
  if (!configOk) return <main className="login"><div className="card"><h1>Configuração faltando</h1><p>As variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> não estão definidas. No Vercel: Settings → Environment Variables → adicione as duas e faça <strong>Redeploy</strong>.</p></div></main>
  if (loc.pathname.startsWith('/a/') || loc.pathname.startsWith('/c/')) return <Routes><Route path="/a/:token" element={<Aprovar modo="candidato" />} /><Route path="/c/:token" element={<Aprovar modo="coordenacao" />} /></Routes>
  if (liberado === undefined) return null
  const sairTudo = () => { localStorage.removeItem(KEY); localStorage.removeItem(SKEY); setPerfil(null); setLiberado(false) }
  if (liberado === 'partido' || liberado === 'grafica') return <>
    <header className="top"><span className="brand"><img src="/missao.png" alt="Missão" /><span>Validador Gráfico<small>{liberado === 'partido' ? 'Aprovações do partido' : 'Área da gráfica'}</small></span></span><nav><button className="link" onClick={sairTudo}>sair</button></nav></header>
    {liberado === 'partido' ? <Partido /> : <Grafica />}
  </>
  if (!liberado || !perfil) return <Login liberado={liberado} onSenha={(s, papel) => { localStorage.setItem(SKEY, s); setLiberado(papel) }} onEntrar={p => { localStorage.setItem(KEY, JSON.stringify(p)); setPerfil(p) }} />
  const sair = sairTudo
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
