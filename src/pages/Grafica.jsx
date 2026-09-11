import { useEffect, useState } from 'react'
import { supabase, registrar, dataBR, horaBR } from '../lib/supabase'

export default function Grafica() {
  const [itens, setItens] = useState([])
  const [evs, setEvs] = useState({})
  async function carregar() {
    const { data } = await supabase.from('gr_demandas').select('*, candidato:gr_candidatos!gr_demandas_candidato_id_fkey(nome,cargo,numero,cnpj_campanha,cnpj_grafica), contratante:gr_candidatos!gr_demandas_contratante_id_fkey(nome,cnpj_campanha,cnpj_grafica), gr_arquivos(id,versao,final,path,relatorio,criado_em)')
      .in('etapa', ['fechamento', 'concluida']).order('enviado_grafica_em', { ascending: false, nullsFirst: true })
    setItens(data || [])
    const { data: e } = await supabase.from('gr_eventos').select('demanda_id,tipo,em').in('tipo', ['grafica_recebeu', 'grafica_entregou'])
    const m = {}; for (const x of e || []) { m[x.demanda_id] = m[x.demanda_id] || {}; m[x.demanda_id][x.tipo] = x.em }; setEvs(m)
  }
  useEffect(() => { carregar() }, [])
  async function baixar(path) { const { data } = await supabase.storage.from('materiais').createSignedUrl(path, 600); if (data) window.open(data.signedUrl, '_blank') }
  async function marcar(d, tipo) { await registrar(d.id, tipo, tipo === 'grafica_recebeu' ? 'Gráfica confirmou recebimento do arquivo' : 'Gráfica marcou como impresso/entregue', null); carregar() }
  const arquivoFinal = d => { const a = [...d.gr_arquivos].sort((x, y) => y.versao - x.versao); return a.find(x => x.final) || a[0] }
  return <main className="form wide">
    <div className="card"><h1>Gráfica — arquivos para produção</h1><p className="muted">{itens.length} material{itens.length !== 1 ? 'is' : ''}. Baixe o arquivo final e marque o recebimento e a entrega.</p></div>
    {itens.map(d => { const a = arquivoFinal(d); const e = evs[d.id] || {}; const ct = d.contratante || d.candidato; const rodape = ct?.cnpj_campanha ? `CNPJ CONTRATANTE ${ct.cnpj_campanha}${ct.cnpj_grafica ? ` • CNPJ GRÁFICA ${ct.cnpj_grafica}` : ''}${d.quantidade ? ` • TIRAGEM ${d.quantidade} UN.` : ''}` : null
      return <div className="card gcard" key={d.id}>
        <div className="num">#{d.numero} · {d.peca}{d.largura_mm ? ` ${d.largura_mm} × ${d.altura_mm} mm` : ''} · <b>{d.quantidade ? d.quantidade.toLocaleString('pt-BR') + ' un.' : 'quantidade a confirmar'}</b>{d.prazo ? ` · prazo ${dataBR(d.prazo)}` : ''}</div>
        <h2>{d.titulo}</h2>
        <p className="muted">{d.candidato?.nome || 'Partido'}{d.enviado_grafica_em ? ` · enviado ${horaBR(d.enviado_grafica_em)}` : ' · em fechamento'}</p>
        {rodape && <p className="cnpjline">{rodape}</p>}
        <div className="row">
          {a ? <button className="btn" onClick={() => baixar(a.path)}>Baixar {a.final ? 'PDF/X-1a final' : 'arquivo aprovado'} (v{a.versao})</button> : <span className="muted">Arquivo ainda não anexado.</span>}
          {(a?.relatorio?.arquivos || []).filter(p => p !== a.path).map(p => <button key={p} className="btn ghost" onClick={() => baixar(p)}>{p.split('/').pop()}</button>)}
        </div>
        <div className="row">
          {e.grafica_recebeu ? <span className="ok">✓ recebido {horaBR(e.grafica_recebeu)}</span> : <button className="btn ghost" onClick={() => marcar(d, 'grafica_recebeu')}>Confirmar recebimento</button>}
          {e.grafica_entregou ? <span className="ok">✓ entregue {horaBR(e.grafica_entregou)}</span> : e.grafica_recebeu && <button className="btn ghost" onClick={() => marcar(d, 'grafica_entregou')}>Marcar como impresso/entregue</button>}
        </div>
      </div> })}
    {!itens.length && <div className="card"><p className="muted">Nenhum material liberado ainda.</p></div>}
  </main>
}
