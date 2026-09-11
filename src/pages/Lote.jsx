import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PRODUTOS, PECAS } from '../lib/catalogo'

export default function Lote({ perfil }) {
  const nav = useNavigate()
  const [cands, setCands] = useState([])
  const [sel, setSel] = useState(new Set())
  const [f, setF] = useState({ peca: 'Colinha', largura_mm: 70, altura_mm: 100, material: 'Couchê 90g', forma: 'ret', molde: '', contratante_id: '', quantidade: 5000, prazo: '', briefing: '', lados: 'frente e verso' })
  const [busy, setBusy] = useState(false)
  useEffect(() => { supabase.from('gr_candidatos').select('id,nome,cargo,numero,status_cnpj,cnpj_campanha').eq('ativo', true).order('cargo').order('nome').then(({ data }) => setCands(data || [])) }, [])
  const set = k => e => setF({ ...f, [k]: e.target.value })
  const formato = e => { const s = PRODUTOS.find(x => x.nome === e.target.value); if (s) setF({ ...f, peca: s.peca, largura_mm: s.w, altura_mm: s.h, material: s.material, forma: s.forma, molde: s.molde || '' }) }
  const toggle = id => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n) }
  const marcar = filtro => setSel(new Set(cands.filter(filtro).map(c => c.id)))
  const titulo = c => `${f.peca} ${f.largura_mm}×${f.altura_mm}${f.lados ? ' ' + f.lados : ''} — ${c.nome}`
  const cargos = [...new Set(cands.map(c => c.cargo))]

  async function gerar() {
    if (!sel.size) return alert('Marque pelo menos um candidato.')
    if (!confirm(`Criar ${sel.size} demandas de "${f.peca} ${f.largura_mm}×${f.altura_mm}"?`)) return
    setBusy(true)
    const rows = cands.filter(c => sel.has(c.id)).map(c => ({
      titulo: titulo(c), candidato_id: c.id, origem: 'candidato', peca: f.peca, largura_mm: f.largura_mm, altura_mm: f.altura_mm, material: f.material || null, forma: f.forma || 'ret', molde: f.molde || null, contratante_id: f.contratante_id || null,
      quantidade: f.quantidade || null, prazo: f.prazo || null, briefing: f.briefing || null, criado_por: perfil?.id,
    }))
    const { data, error } = await supabase.from('gr_demandas').insert(rows).select('id')
    if (error) { setBusy(false); return alert(error.message) }
    await supabase.from('gr_eventos').insert(data.map(d => ({ demanda_id: d.id, tipo: 'criada', detalhe: `Criada em lote (${sel.size} demandas)`, por: perfil?.id })))
    nav('/')
  }

  return (
    <main className="form wide">
      <div className="card">
        <h1>Criar demandas em lote</h1>
        <div className="row">
          <label>Peça<select value={f.peca} onChange={set('peca')}>{PECAS.map(p => <option key={p}>{p}</option>)}</select></label>
          <label>Produto padrão<select onChange={formato} defaultValue=""><option value="">personalizado</option>{['Papelaria','Adesivos','Tecido'].map(c => <optgroup key={c} label={c}>{PRODUTOS.filter(p => p.cat === c).map(p => <option key={p.nome}>{p.nome}</option>)}</optgroup>)}</select></label>
          <label>Material<input value={f.material || ''} onChange={set('material')} placeholder="ex. Couchê 90g" /></label>
          <label>Largura (mm)<input type="number" step="0.5" value={f.largura_mm} onChange={set('largura_mm')} /></label>
          <label>Altura (mm)<input type="number" step="0.5" value={f.altura_mm} onChange={set('altura_mm')} /></label>
        </div>
        <div className="row">
          <label>Lados<select value={f.lados} onChange={set('lados')}><option value="frente e verso">frente e verso</option><option value="só frente">só frente</option><option value="">não informar</option></select></label>
          <label>Quantidade por candidato<input type="number" value={f.quantidade} onChange={set('quantidade')} /></label>
          <label>Prazo<input type="date" value={f.prazo} onChange={set('prazo')} /></label>
          <label>CNPJ contratante<select value={f.contratante_id} onChange={set('contratante_id')}><option value="">do próprio candidato</option>{cands.filter(c => c.cnpj_campanha).map(c => <option key={c.id} value={c.id}>{c.nome} ({c.cargo}) — {c.cnpj_campanha}</option>)}</select></label>
        </div>
        <label>Briefing comum<textarea rows="3" value={f.briefing} onChange={set('briefing')} placeholder="Vale para todas as demandas do lote. Ex.: usar template oficial, foto aprovada, número em destaque, rodapé com CNPJ e tiragem." /></label>
        <p className="muted">Título de cada demanda: <b>{titulo({ nome: 'Nome do candidato' })}</b></p>
      </div>

      <div className="card">
        <h2>Candidatos <span className="muted">({sel.size} de {cands.length})</span></h2>
        <div className="row chips">
          <button type="button" className="btn ghost" onClick={() => marcar(() => true)}>Todos</button>
          {cargos.map(c => <button key={c} type="button" className="btn ghost" onClick={() => marcar(x => x.cargo === c)}>{c}</button>)}
          <button type="button" className="btn ghost" onClick={() => setSel(new Set())}>Nenhum</button>
        </div>
        <div className="candgrid">
          {cands.map(c => <label key={c.id} className={'candchk ' + (sel.has(c.id) ? 'on' : '')}>
            <input type="checkbox" checked={sel.has(c.id)} onChange={() => toggle(c.id)} />
            <span><b>{c.nome}</b> <small className="muted">{c.numero || ''} · {c.cargo}</small>{c.status_cnpj && c.status_cnpj !== 'OK' && <small className="err"> · {c.status_cnpj}</small>}</span>
          </label>)}
        </div>
        <div className="row"><button className="btn" onClick={gerar} disabled={busy || !sel.size}>{busy ? 'Criando…' : `Criar ${sel.size} demanda${sel.size !== 1 ? 's' : ''}`}</button></div>
      </div>
    </main>
  )
}
