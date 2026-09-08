import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
export default function Candidatos() {
  const [lista, setLista] = useState([])
  const [f, setF] = useState({ nome: '', cargo: 'deputado estadual', numero: '', telefone: '' })
  const carregar = () => supabase.from('gr_candidatos').select('*').order('nome').then(({ data }) => setLista(data || []))
  useEffect(() => { carregar() }, [])
  async function add(e) { e.preventDefault(); await supabase.from('gr_candidatos').insert(f); setF({ ...f, nome: '', numero: '', telefone: '' }); carregar() }
  async function toggle(c) { await supabase.from('gr_candidatos').update({ ativo: !c.ativo }).eq('id', c.id); carregar() }
  return (
    <main className="form">
      <form onSubmit={add} className="card">
        <h1>Candidatos</h1>
        <div className="row">
          <label>Nome<input value={f.nome} onChange={e => setF({ ...f, nome: e.target.value })} required /></label>
          <label>Cargo<select value={f.cargo} onChange={e => setF({ ...f, cargo: e.target.value })}><option>deputado estadual</option><option>deputado federal</option></select></label>
          <label>Número<input value={f.numero} onChange={e => setF({ ...f, numero: e.target.value })} /></label>
          <label>WhatsApp<input value={f.telefone} onChange={e => setF({ ...f, telefone: e.target.value })} /></label>
        </div>
        <button className="btn" type="submit">Adicionar</button>
        <table>
          <tbody>{lista.map(c => <tr key={c.id} className={c.ativo ? '' : 'off'}><td>{c.nome}<br /><small className="muted">{c.nome_completo}</small></td><td>{c.cargo}</td><td>{c.numero}</td><td><small>{c.cnpj_campanha}</small>{c.status_cnpj && c.status_cnpj !== 'OK' && <><br /><small className="err">{c.status_cnpj}</small></>}</td><td><button type="button" className="link" onClick={() => toggle(c)}>{c.ativo ? 'desativar' : 'reativar'}</button></td></tr>)}</tbody>
        </table>
      </form>
    </main>
  )
}
