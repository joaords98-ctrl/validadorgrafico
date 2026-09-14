import { useEffect, useState } from 'react'
import { supabase, registrar, dataBR, horaBR, ETAPAS_GRAFICA } from '../lib/supabase'

const GRUPOS = [
  ['novos', 'Novos — aguardando recebimento do arquivo', d => !d._st],
  ['producao', 'Em produção', d => d._st === 'grafica_recebeu' || d._st === 'grafica_producao'],
  ['saida', 'Expedição e transporte', d => d._st === 'grafica_expedicao' || d._st === 'grafica_transporte'],
  ['entregues', 'Entregues', d => d._st === 'grafica_entregou'],
]

export default function Grafica() {
  const [itens, setItens] = useState([])
  const [evs, setEvs] = useState({})
  const [thumb, setThumb] = useState({})
  const [motivo, setMotivo] = useState({})
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState({})
  const [grupo, setGrupo] = useState('todos')

  async function carregar() {
    const { data } = await supabase.from('gr_demandas')
      .select('*, candidato:gr_candidatos!gr_demandas_candidato_id_fkey(nome,cargo,numero,cnpj_campanha,cnpj_grafica), contratante:gr_candidatos!gr_demandas_contratante_id_fkey(nome,cnpj_campanha,cnpj_grafica), gr_arquivos(id,versao,final,fonte,path,url,prova_path,previa_path,relatorio,criado_em)')
      .in('etapa', ['fechamento', 'conferencia', 'concluida']).not('enviado_grafica_em', 'is', null).order('enviado_grafica_em', { ascending: false })
    const lista = data || []
    const { data: e } = await supabase.from('gr_eventos').select('demanda_id,tipo,em').in('tipo', ETAPAS_GRAFICA.map(x => x[0]))
    const m = {}; for (const x of e || []) { m[x.demanda_id] = m[x.demanda_id] || {}; m[x.demanda_id][x.tipo] = x.em }
    for (const d of lista) { const f = ETAPAS_GRAFICA.filter(([t]) => m[d.id]?.[t]); d._st = f.length ? f[f.length - 1][0] : null }
    setEvs(m); setItens(lista)
    const th = {}
    for (const d of lista) {
      const v = [...d.gr_arquivos].filter(x => !x.fonte && !x.final).sort((a, b) => b.versao - a.versao)[0]
      const p = v?.relatorio?.lados?.[0]?.prova_path || v?.prova_path || d.gr_arquivos.find(x => x.fonte && x.previa_path)?.previa_path
      if (p) { const { data: u } = await supabase.storage.from('materiais').createSignedUrl(p, 3600); th[d.id] = u?.signedUrl }
    }
    setThumb(th)
  }
  useEffect(() => { carregar() }, [])

  async function baixar(path, url) { if (url) return window.open(url, '_blank'); const { data } = await supabase.storage.from('materiais').createSignedUrl(path, 600); if (data) window.open(data.signedUrl, '_blank') }
  async function marcar(d, tipo) { const et = ETAPAS_GRAFICA.find(x => x[0] === tipo); await registrar(d.id, tipo, `Gráfica: ${et[2]}`, null); carregar() }
  async function devolver(d) {
    const m = (motivo[d.id] || '').trim(); if (!m) return alert('Descreva o problema encontrado.')
    if (!confirm('Devolver este material para a equipe de design?')) return
    await supabase.from('gr_demandas').update({ etapa: 'arte', enviado_grafica_em: null }).eq('id', d.id)
    await registrar(d.id, 'grafica_devolveu', `Gráfica devolveu o arquivo: ${m}`, null)
    setMotivo({ ...motivo, [d.id]: '' }); carregar()
  }
  // ordem para a gráfica: arquivo final marcado → CDR/fonte mais recente → PDF aprovado
  const arquivoFinal = d => { const a = [...d.gr_arquivos].sort((x, y) => (y.criado_em || '').localeCompare(x.criado_em || '')); return a.find(x => x.final) || a.find(x => x.fonte) || [...d.gr_arquivos].filter(x => !x.fonte).sort((x, y) => y.versao - x.versao)[0] }
  const rotulo = a => a.final ? `final ${a.path.split('.').pop().toUpperCase()}` : a.fonte ? a.path.split('.').pop().toUpperCase() : 'PDF aprovado'
  const hoje = new Date().toISOString().slice(0, 10)
  const filtr = itens.filter(d => !busca || (d.titulo + ' ' + (d.candidato?.nome || '') + ' ' + d.peca).toLowerCase().includes(busca.toLowerCase()))
  const contagem = Object.fromEntries(GRUPOS.map(([k, , f]) => [k, itens.filter(f).length]))

  return <main className="form wide grafica">
    <div className="card">
      <h1>Gráfica — materiais para produção</h1>
      <div className="row">
        <input placeholder="Buscar por material ou candidato" value={busca} onChange={e => setBusca(e.target.value)} style={{ maxWidth: 360 }} />
        <div className="chips">
          <button type="button" className={'btn ' + (grupo === 'todos' ? '' : 'ghost')} onClick={() => setGrupo('todos')}>Todos ({itens.length})</button>
          {GRUPOS.map(([k, n]) => <button key={k} type="button" className={'btn ' + (grupo === k ? '' : 'ghost')} onClick={() => setGrupo(k)}>{n.split(' — ')[0]} ({contagem[k]})</button>)}
        </div>
      </div>
    </div>

    {GRUPOS.filter(([k]) => grupo === 'todos' || grupo === k).map(([k, nome, f]) => {
      const lista = filtr.filter(f); if (!lista.length && grupo === 'todos') return null
      return <section key={k} className="ggrupo">
        <h2 className="sec">{nome} <span className="muted">({lista.length})</span></h2>
        {!lista.length && <div className="card"><p className="muted">Nada aqui.</p></div>}
        {lista.map(d => {
          const a = arquivoFinal(d), e = evs[d.id] || {}, ct = d.contratante || d.candidato
          const rodape = ct?.cnpj_campanha ? `CNPJ CONTRATANTE ${ct.cnpj_campanha}${ct.cnpj_grafica ? ` • CNPJ GRÁFICA ${ct.cnpj_grafica}` : ''}${d.quantidade ? ` • TIRAGEM ${d.quantidade} UN.` : ''}` : null
          const atras = d.prazo && d.prazo < hoje && d._st !== 'grafica_entregou'
          const open = !!aberto[d.id]
          return <div className={'card gcard ' + (open ? 'open' : '')} key={d.id}>
            <div className="ghead" onClick={() => setAberto({ ...aberto, [d.id]: !open })}>
              {thumb[d.id] ? <img src={thumb[d.id]} alt="" /> : <div className="semprevia">{a ? a.path.split('.').pop().toUpperCase() : '—'}</div>}
              <div className="ginfo">
                <div className="num">#{d.numero} · enviado {horaBR(d.enviado_grafica_em)}</div>
                <h2>{d.titulo}</h2>
                <div className="gtags">
                  <span className="tag k">{d.peca}</span>
                  {d.largura_mm && <span className="tag">{d.largura_mm} × {d.altura_mm} mm</span>}
                  {d.material && <span className="tag">{d.material}</span>}
                  <span className="tag y">{d.quantidade ? d.quantidade.toLocaleString('pt-BR') + ' un.' : 'qtd. a confirmar'}</span>
                  {d.prazo && <span className={'tag ' + (atras ? 'r' : '')}>prazo {dataBR(d.prazo)}</span>}
                  {d.molde && <span className="tag">molde: wind curvo esq.</span>}
                </div>
                <div className="muted">{d.candidato?.nome || 'Partido'}{d.candidato?.numero ? ` · nº ${d.candidato.numero}` : ''} · status: <b>{d._st ? ETAPAS_GRAFICA.find(x => x[0] === d._st)[1].toLowerCase() : 'aguardando recebimento'}</b></div>
              </div>
              <div className="gact" onClick={ev => ev.stopPropagation()}>
                {a ? <button className="btn" onClick={() => baixar(a.path, a.url)}>{a.url ? 'Abrir link' : 'Baixar'} {rotulo(a)}</button> : <span className="muted">sem arquivo</span>}
                {a && d.gr_arquivos.length > 1 && <small className="muted">+{d.gr_arquivos.length - 1} arquivo(s) em detalhes</small>}
                <button className="link" onClick={() => setAberto({ ...aberto, [d.id]: !open })}>{open ? 'fechar' : 'detalhes'}</button>
              </div>
            </div>
            {open && <div className="gbody">
              {rodape && <p className="cnpjline">{rodape}</p>}
              <div className="row">
                {(a?.relatorio?.arquivos || []).filter(p => p !== a.path).map(p => <button key={p} className="btn ghost" onClick={() => baixar(p, a.url)}>{p.split('/').pop()}</button>)}
                {d.gr_arquivos.filter(x => x.fonte && x.id !== a?.id).map(x => <button key={x.id} className="btn ghost" onClick={() => baixar(x.path, x.url)}>{x.url ? 'Link · ' : ''}Fonte {x.path.split('.').pop().toUpperCase()}</button>)}
                {d.gr_arquivos.filter(x => !x.fonte && x.id !== a?.id).map(x => <button key={x.id} className="btn ghost" onClick={() => baixar(x.path, x.url)}>{x.final ? 'Final' : 'PDF'} v{x.versao}</button>)}
              </div>
              {d.briefing && <p className="brief">{d.briefing}</p>}
              <ol className="gsteps">
                {ETAPAS_GRAFICA.map(([tipo, rotulo], i) => { const feito = e[tipo]; const anterior = i === 0 || e[ETAPAS_GRAFICA[i - 1][0]]
                  return <li key={tipo} className={feito ? 'ok' : anterior ? 'now' : ''}>{feito ? <><b>{rotulo}</b> <small className="muted">{horaBR(feito)}</small></> : anterior ? <button className="btn" onClick={() => marcar(d, tipo)}>{rotulo}</button> : <span className="muted">{rotulo}</span>}</li> })}
              </ol>
              {!e.grafica_entregou && <details className="troca"><summary>Encontrei um problema — devolver arquivo</summary>
                <textarea rows="2" value={motivo[d.id] || ''} onChange={ev => setMotivo({ ...motivo, [d.id]: ev.target.value })} placeholder="Ex.: fonte faltando, sangria insuficiente, imagem em baixa, texto cortado…" />
                <div className="row"><button className="btn ghost" onClick={() => devolver(d)}>Devolver para a equipe</button></div>
              </details>}
            </div>}
          </div>
        })}
      </section>
    })}
    {!itens.length && <div className="card"><p className="muted">Nenhum material liberado ainda.</p></div>}
  </main>
}
