import { useEffect, useState } from 'react'
import { supabase, registrar, dataBR, horaBR, ETAPAS_GRAFICA } from '../lib/supabase'

export default function Grafica() {
  const [itens, setItens] = useState([])
  const [evs, setEvs] = useState({})
  const [previas, setPrevias] = useState({})
  const [motivo, setMotivo] = useState({})
  async function carregar() {
    const { data } = await supabase.from('gr_demandas').select('*, candidato:gr_candidatos!gr_demandas_candidato_id_fkey(nome,cargo,numero,cnpj_campanha,cnpj_grafica), contratante:gr_candidatos!gr_demandas_contratante_id_fkey(nome,cnpj_campanha,cnpj_grafica), gr_arquivos(id,versao,final,fonte,path,previa_path,relatorio,criado_em)')
      .in('etapa', ['fechamento', 'concluida']).order('enviado_grafica_em', { ascending: false, nullsFirst: true })
    setItens(data || [])
    const pv = {}
    for (const d of data || []) for (const x of d.gr_arquivos.filter(x => x.fonte && x.previa_path)) { const { data: u } = await supabase.storage.from('materiais').createSignedUrl(x.previa_path, 3600); pv[x.id] = u?.signedUrl }
    setPrevias(pv)
    const { data: e } = await supabase.from('gr_eventos').select('demanda_id,tipo,em').in('tipo', ETAPAS_GRAFICA.map(x => x[0]))
    const m = {}; for (const x of e || []) { m[x.demanda_id] = m[x.demanda_id] || {}; m[x.demanda_id][x.tipo] = x.em }; setEvs(m)
  }
  useEffect(() => { carregar() }, [])
  async function baixar(path) { const { data } = await supabase.storage.from('materiais').createSignedUrl(path, 600); if (data) window.open(data.signedUrl, '_blank') }
  async function devolver(d) {
    const m = (motivo[d.id] || '').trim(); if (!m) return alert('Descreva o problema encontrado.')
    if (!confirm('Devolver este material para a equipe de design?')) return
    await supabase.from('gr_demandas').update({ etapa: 'arte', enviado_grafica_em: null }).eq('id', d.id)
    await registrar(d.id, 'grafica_devolveu', `Gráfica devolveu o arquivo: ${m}`, null)
    setMotivo({ ...motivo, [d.id]: '' }); carregar()
  }
  async function marcar(d, tipo) { const et = ETAPAS_GRAFICA.find(x => x[0] === tipo); await registrar(d.id, tipo, `Gráfica: ${et[2]}`, null); carregar() }
  const arquivoFinal = d => { const a = [...d.gr_arquivos].filter(x => !x.fonte).sort((x, y) => y.versao - x.versao); return a.find(x => x.final) || a[0] }
  return <main className="form wide">
    <div className="card"><h1>Gráfica — arquivos para produção</h1><p className="muted">{itens.length} material{itens.length !== 1 ? 'is' : ''}. Baixe o arquivo final e vá marcando as etapas: recebido → produção → expedição → transporte → entregue.</p></div>
    {itens.map(d => { const a = arquivoFinal(d); const e = evs[d.id] || {}; const ct = d.contratante || d.candidato; const rodape = ct?.cnpj_campanha ? `CNPJ CONTRATANTE ${ct.cnpj_campanha}${ct.cnpj_grafica ? ` • CNPJ GRÁFICA ${ct.cnpj_grafica}` : ''}${d.quantidade ? ` • TIRAGEM ${d.quantidade} UN.` : ''}` : null
      return <div className="card gcard" key={d.id}>
        <div className="num">#{d.numero} · {d.peca}{d.largura_mm ? ` ${d.largura_mm} × ${d.altura_mm} mm` : ''} · <b>{d.quantidade ? d.quantidade.toLocaleString('pt-BR') + ' un.' : 'quantidade a confirmar'}</b>{d.prazo ? ` · prazo ${dataBR(d.prazo)}` : ''}</div>
        <h2>{d.titulo}</h2>
        <p className="muted">{d.candidato?.nome || 'Partido'}{d.enviado_grafica_em ? ` · enviado ${horaBR(d.enviado_grafica_em)}` : ' · em fechamento'}</p>
        {rodape && <p className="cnpjline">{rodape}</p>}
        <div className="row">
          {a ? <button className="btn" onClick={() => baixar(a.path)}>Baixar {a.final ? `arquivo final (${a.path.split('.').pop().toUpperCase()})` : 'PDF aprovado'} · v{a.versao}</button> : <span className="muted">Arquivo ainda não anexado.</span>}
          {(a?.relatorio?.arquivos || []).filter(p => p !== a.path).map(p => <button key={p} className="btn ghost" onClick={() => baixar(p)}>{p.split('/').pop()}</button>)}
          {d.gr_arquivos.filter(x => x.fonte).map(x => <span key={x.id} className="fontebtn">{previas[x.id] && <img src={previas[x.id]} alt="" />}<button className="btn ghost" onClick={() => baixar(x.path)}>Fonte {x.path.split('.').pop().toUpperCase()} — {x.path.split('/').pop().replace(/^fonte-\d+-/, '')}</button></span>)}
        </div>
        <ol className="gsteps">
          {ETAPAS_GRAFICA.map(([tipo, rotulo], i) => { const feito = e[tipo]; const anterior = i === 0 || e[ETAPAS_GRAFICA[i - 1][0]]
            return <li key={tipo} className={feito ? 'ok' : anterior ? 'now' : ''}>{feito ? <><b>{rotulo}</b> <small className="muted">{horaBR(feito)}</small></> : anterior ? <button className="btn" onClick={() => marcar(d, tipo)}>{rotulo}</button> : <span className="muted">{rotulo}</span>}</li> })}
        </ol>
        {!e.grafica_entregou && <details className="troca"><summary>Encontrei um problema — devolver arquivo</summary>
          <textarea rows="2" value={motivo[d.id] || ''} onChange={ev => setMotivo({ ...motivo, [d.id]: ev.target.value })} placeholder="Ex.: fonte faltando, sangria insuficiente, imagem em baixa, texto cortado…" />
          <div className="row"><button className="btn ghost" onClick={() => devolver(d)}>Devolver para a equipe</button></div>
        </details>}
      </div> })}
    {!itens.length && <div className="card"><p className="muted">Nenhum material liberado ainda.</p></div>}
  </main>
}
