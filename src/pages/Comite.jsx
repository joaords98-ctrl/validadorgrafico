import { useEffect, useState } from 'react'
import { supabase, registrar, dataBR, horaBR, ETAPAS_GRAFICA } from '../lib/supabase'

export default function Comite() {
  const [itens, setItens] = useState([])
  const [evs, setEvs] = useState({})
  const [thumb, setThumb] = useState({})
  const [f, setF] = useState({})   // { [id]: { nome, obs } }
  const [busca, setBusca] = useState('')
  async function carregar() {
    const { data } = await supabase.from('gr_demandas')
      .select('*, candidato:gr_candidatos!gr_demandas_candidato_id_fkey(nome,cargo,numero,telefone), gr_arquivos(id,versao,final,fonte,prova_path,previa_path,relatorio)')
      .in('etapa', ['fechamento', 'conferencia', 'concluida']).is('excluida_em', null).not('enviado_grafica_em', 'is', null).order('enviado_grafica_em', { ascending: false })
    const lista = data || []; setItens(lista)
    const { data: e } = await supabase.from('gr_eventos').select('demanda_id,tipo,em').in('tipo', ETAPAS_GRAFICA.map(x => x[0]))
    const m = {}; for (const x of e || []) { m[x.demanda_id] = m[x.demanda_id] || {}; m[x.demanda_id][x.tipo] = x.em }; setEvs(m)
    const th = {}
    for (const d of lista) { const v = [...d.gr_arquivos].filter(x => !x.fonte && !x.final).sort((a, b) => b.versao - a.versao)[0]; const p = v?.relatorio?.lados?.[0]?.prova_path || v?.prova_path || d.gr_arquivos.find(x => x.fonte && x.previa_path)?.previa_path; if (p) { const { data: u } = await supabase.storage.from('materiais').createSignedUrl(p, 3600); th[d.id] = u?.signedUrl } }
    setThumb(th)
  }
  useEffect(() => { carregar() }, [])
  const g = id => f[id] || { nome: '', obs: '' }
  const setG = (id, k, v) => setF({ ...f, [id]: { ...g(id), [k]: v } })
  async function receber(d) {
    const n = g(d.id).nome.trim(); if (!n) return alert('Informe quem recebeu.')
    await supabase.from('gr_demandas').update({ etapa: 'conferencia', conferido_por: n, conferido_em: new Date().toISOString(), conferido_obs: g(d.id).obs || null }).eq('id', d.id)
    await registrar(d.id, 'conferido', `Material recebido e conferido no comitê por ${n}${g(d.id).obs ? ': ' + g(d.id).obs : ''}`, null)
    setF({ ...f, [d.id]: { nome: '', obs: '' } }); carregar()
  }
  async function retirar(d) {
    const n = g(d.id).nome.trim() || d.candidato?.nome; if (!n) return alert('Informe quem retirou.')
    await supabase.from('gr_demandas').update({ etapa: 'concluida', retirado_por: n, retirado_em: new Date().toISOString(), retirado_obs: g(d.id).obs || null }).eq('id', d.id)
    await registrar(d.id, 'retirado', `Remetido/retirado por ${n}${g(d.id).obs ? ': ' + g(d.id).obs : ''} — demanda concluída`, null)
    setF({ ...f, [d.id]: { nome: '', obs: '' } }); carregar()
  }
  const status = d => { const fe = ETAPAS_GRAFICA.filter(([t]) => evs[d.id]?.[t]); return fe.length ? fe[fe.length - 1][1].toLowerCase() : 'em produção' }
  const filtr = itens.filter(d => !busca || (d.titulo + ' ' + (d.candidato?.nome || '')).toLowerCase().includes(busca.toLowerCase()))
  const chegando = filtr.filter(d => d.etapa === 'fechamento'), noComite = filtr.filter(d => d.etapa === 'conferencia'), feitas = filtr.filter(d => d.etapa === 'concluida')
  const Card = ({ d, children }) => <div className="card gcard open"><div className="ghead" style={{ cursor: 'default' }}>
    {thumb[d.id] ? <img src={thumb[d.id]} alt="" /> : <div className="semprevia">—</div>}
    <div className="ginfo"><div className="num">#{d.numero}</div><h2>{d.titulo}</h2>
      <div className="gtags"><span className={'etq ' + d.origem}>{d.origem === 'candidato' ? 'Candidato' : 'Partido'}</span><span className="tag k">{d.peca}</span>{d.largura_mm && <span className="tag">{d.largura_mm} × {d.altura_mm} mm</span>}<span className="tag y">{d.quantidade ? d.quantidade.toLocaleString('pt-BR') + ' un.' : 'qtd. —'}</span>{d.prazo && <span className="tag">prazo {dataBR(d.prazo)}</span>}</div>
      <div className="muted">{d.candidato?.nome || 'Partido'}{d.candidato?.telefone ? ` · ${d.candidato.telefone}` : ''}</div></div>
  </div><div className="gbody">{children}</div></div>

  return <main className="form wide grafica">
    <div className="card"><h1>Comitê — recebimento e remessa</h1>
      <input placeholder="Buscar por material ou candidato" value={busca} onChange={e => setBusca(e.target.value)} style={{ maxWidth: 360 }} /></div>

    <h2 className="sec">Na gráfica — a chegar <span className="muted">({chegando.length})</span></h2>
    {!chegando.length && <div className="card"><p className="muted">Nada em produção.</p></div>}
    {chegando.map(d => <Card key={d.id} d={d}>
      <p className="muted">Enviado {horaBR(d.enviado_grafica_em)} para {d.grafica || 'a gráfica'} · status na gráfica: <b>{status(d)}</b></p>
      <div className="row">
        <label>Quem recebeu no comitê<input value={g(d.id).nome} onChange={e => setG(d.id, 'nome', e.target.value)} /></label>
        <label>Observação (quantidade conferida, avarias…)<input value={g(d.id).obs} onChange={e => setG(d.id, 'obs', e.target.value)} /></label>
        <button className="btn" onClick={() => receber(d)}>Material chegou — recebido e conferido</button>
      </div>
    </Card>)}

    <h2 className="sec">No comitê — aguardando retirada <span className="muted">({noComite.length})</span></h2>
    {!noComite.length && <div className="card"><p className="muted">Nada aguardando retirada.</p></div>}
    {noComite.map(d => <Card key={d.id} d={d}>
      <p className="ok">Recebido por {d.conferido_por} em {horaBR(d.conferido_em)}{d.conferido_obs && <> · {d.conferido_obs}</>}</p>
      <div className="row">
        <label>Quem retirou / recebeu<input value={g(d.id).nome} onChange={e => setG(d.id, 'nome', e.target.value)} placeholder={d.candidato?.nome || ''} /></label>
        <label>Observação (enviado por…, quantidade)<input value={g(d.id).obs} onChange={e => setG(d.id, 'obs', e.target.value)} /></label>
        <button className="btn" onClick={() => retirar(d)}>Retirado / remetido</button>
      </div>
    </Card>)}

    {feitas.length > 0 && <><h2 className="sec">Entregues ao candidato <span className="muted">({feitas.length})</span></h2>
      <div className="card"><div className="tablewrap"><table className="rel"><thead><tr><th>Nº</th><th>Material</th><th>Candidato</th><th>Qtd.</th><th>Recebido no comitê</th><th>Retirado por</th></tr></thead>
        <tbody>{feitas.map(d => <tr key={d.id}><td>#{d.numero}</td><td>{d.titulo}</td><td>{d.candidato?.nome || 'Partido'}</td><td>{d.quantidade || ''}</td><td>{d.conferido_por} · {horaBR(d.conferido_em)}</td><td>{d.retirado_por} · {horaBR(d.retirado_em)}</td></tr>)}</tbody></table></div></div></>}
  </main>
}
