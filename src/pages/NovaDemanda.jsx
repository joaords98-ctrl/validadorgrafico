import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, ORIGENS, PECAS, registrar } from '../lib/supabase'
import { STD } from '../lib/validator'

export default function NovaDemanda({ perfil }) {
  const nav = useNavigate()
  const [cands, setCands] = useState([])
  const [f, setF] = useState({ titulo: '', origem: 'candidato', candidato_id: '', peca: 'Santinho', largura_mm: 100, altura_mm: 70, quantidade: '', prazo: '', briefing: '' })
  const [erro, setErro] = useState('')
  useEffect(() => { supabase.from('gr_candidatos').select('id,nome,cargo').eq('ativo', true).order('nome').then(({ data }) => setCands(data || [])) }, [])
  const set = k => e => setF({ ...f, [k]: e.target.value })
  function formato(e) { const s = STD.find(x => x[0] === e.target.value); if (s) setF({ ...f, largura_mm: s[1], altura_mm: s[2] }) }
  async function salvar(e) {
    e.preventDefault(); setErro('')
    if (f.origem === 'candidato' && !f.candidato_id) return setErro('Escolha o candidato.')
    const row = { ...f, candidato_id: f.candidato_id || null, quantidade: f.quantidade || null, prazo: f.prazo || null, criado_por: perfil?.id }
    const { data, error } = await supabase.from('gr_demandas').insert(row).select().single()
    if (error) return setErro(error.message)
    await registrar(data.id, 'criada', `Demanda criada (${ORIGENS[f.origem]})`, perfil?.id)
    nav('/d/' + data.id)
  }
  return (
    <main className="form">
      <form onSubmit={salvar} className="card">
        <h1>Nova demanda</h1>
        <label>Título<input value={f.titulo} onChange={set('titulo')} required placeholder="ex. Santinho frente/verso — Karen Guerreiro" /></label>
        <div className="row">
          <label>Origem<select value={f.origem} onChange={set('origem')}>{Object.entries(ORIGENS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Candidato<select value={f.candidato_id} onChange={set('candidato_id')} disabled={f.origem !== 'candidato'}>
            <option value="">—</option>{cands.map(c => <option key={c.id} value={c.id}>{c.nome}{c.cargo ? ` (${c.cargo})` : ''}</option>)}</select></label>
        </div>
        <div className="row">
          <label>Peça<select value={f.peca} onChange={set('peca')}>{PECAS.map(p => <option key={p}>{p}</option>)}</select></label>
          <label>Formato padrão<select onChange={formato} defaultValue=""><option value="">personalizado</option>{STD.map(s => <option key={s[0]}>{s[0]}</option>)}</select></label>
        </div>
        <div className="row">
          <label>Largura final (mm)<input type="number" step="0.5" value={f.largura_mm} onChange={set('largura_mm')} /></label>
          <label>Altura final (mm)<input type="number" step="0.5" value={f.altura_mm} onChange={set('altura_mm')} /></label>
          <label>Quantidade<input type="number" value={f.quantidade} onChange={set('quantidade')} /></label>
          <label>Prazo<input type="date" value={f.prazo} onChange={set('prazo')} /></label>
        </div>
        <label>Briefing<textarea rows="5" value={f.briefing} onChange={set('briefing')} placeholder="Mensagem, referências, textos obrigatórios, número do candidato, CNPJ na peça, etc." /></label>
        {erro && <p className="err">{erro}</p>}
        <button className="btn" type="submit">Criar demanda</button>
      </form>
    </main>
  )
}
