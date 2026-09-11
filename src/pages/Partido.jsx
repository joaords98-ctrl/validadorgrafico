import { useEffect, useState } from 'react'
import { supabase, ETAPAS, dataBR } from '../lib/supabase'

function comQuem(d) {
  switch (d.etapa) {
    case 'entrada': return d.designer ? `${d.designer.nome} (a iniciar)` : 'equipe de design — ninguém assumiu'
    case 'arte': return `${d.designer?.nome || 'designer'} — em criação/ajuste`
    case 'aprovacao': {
      const f = []; if (!d.aprov_coordenacao) f.push('partido'); if (d.origem === 'candidato' && !d.aprov_candidato) f.push('candidato')
      return f.length ? `aguardando ${f.join(' e ')}` : 'aprovado — liberando'
    }
    case 'fechamento': return `${d.designer?.nome || 'equipe'} — fechando arquivo p/ gráfica`
    case 'concluida': return `gráfica${d.grafica ? ' (' + d.grafica + ')' : ''} — enviado ${dataBR(d.enviado_grafica_em)}`
    default: return ''
  }
}

export default function Partido() {
  const [itens, setItens] = useState([])
  const [provas, setProvas] = useState({})
  const [busca, setBusca] = useState('')
  useEffect(() => {
    supabase.from('gr_demandas').select('*, candidato:gr_candidatos!gr_demandas_candidato_id_fkey(nome,cargo,numero), designer:gr_perfis!gr_demandas_designer_id_fkey(nome), gr_arquivos(versao,final,prova_path,resultado)')
      .order('prazo', { ascending: true, nullsFirst: false }).then(async ({ data }) => {
        const lista = data || []; setItens(lista)
        const p = {}
        for (const d of lista.filter(x => x.etapa === 'aprovacao' && !x.aprov_coordenacao)) { const a = [...d.gr_arquivos].filter(x => !x.final).sort((x, y) => y.versao - x.versao)[0]; if (a?.prova_path) { const { data: u } = await supabase.storage.from('materiais').createSignedUrl(a.prova_path, 3600); p[d.id] = u?.signedUrl } }
        setProvas(p)
      })
  }, [])
  const hoje = new Date().toISOString().slice(0, 10)
  const pend = itens.filter(d => d.etapa === 'aprovacao' && !d.aprov_coordenacao)
  const filtr = itens.filter(d => !busca || (d.titulo + ' ' + (d.candidato?.nome || '') + ' ' + (d.designer?.nome || '')).toLowerCase().includes(busca.toLowerCase()))
  const etapaNome = Object.fromEntries(ETAPAS)
  return <main className="form wide">
    <div className="card"><h1>Aprovações do partido</h1><p className="muted">{pend.length} material{pend.length !== 1 ? 'is' : ''} aguardando sua aprovação.</p></div>
    {pend.map(d => <a className="card pcard" key={d.id} href={`/c/${d.token}`}>
      {provas[d.id] && <img src={provas[d.id]} alt="" />}
      <div><div className="num">#{d.numero} · {d.peca}{d.largura_mm ? ` ${d.largura_mm}×${d.altura_mm}` : ''}{d.quantidade ? ` · ${d.quantidade} un.` : ''}</div>
        <b>{d.titulo}</b><div className="muted">{d.candidato?.nome || 'Partido'}{d.prazo ? ` · prazo ${dataBR(d.prazo)}` : ''}</div>
        <div className="muted">{comQuem(d)}</div></div>
    </a>)}
    {!pend.length && <div className="card"><p className="muted">Nada pendente para o partido.</p></div>}

    <div className="card">
      <h2>Todas as demandas <span className="muted">({itens.filter(d => d.etapa !== 'concluida').length} em andamento · {itens.length} no total)</span></h2>
      <input placeholder="Buscar por título, candidato ou designer" value={busca} onChange={e => setBusca(e.target.value)} style={{ maxWidth: 420, marginBottom: 10 }} />
      <div className="tablewrap"><table className="rel">
        <thead><tr><th>Nº</th><th>Material</th><th>Candidato</th><th>Etapa</th><th>Com quem está</th><th>Prazo</th><th>Versão</th></tr></thead>
        <tbody>{filtr.map(d => { const ult = [...d.gr_arquivos].sort((a, b) => b.versao - a.versao)[0]; const atras = d.prazo && d.prazo < hoje && d.etapa !== 'concluida'
          return <tr key={d.id} className={'et-' + d.etapa}>
            <td>{d.etapa === 'aprovacao' ? <a href={`/c/${d.token}`}>#{d.numero}</a> : '#' + d.numero}</td>
            <td>{d.titulo}<br /><small className="muted">{d.peca}{d.largura_mm ? ` ${d.largura_mm}×${d.altura_mm}` : ''}{d.quantidade ? ` · ${d.quantidade} un.` : ''}</small></td>
            <td>{d.candidato?.nome || (d.origem === 'partido' ? 'Partido' : 'Coordenação')}</td>
            <td><span className={'etapa ' + d.etapa}>{etapaNome[d.etapa]}</span></td>
            <td>{comQuem(d)}</td>
            <td className={atras ? 'late' : ''}>{d.prazo ? dataBR(d.prazo) : '—'}</td>
            <td>{ult ? <>v{ult.versao} <span className={'dot ' + (ult.final ? 'ok' : { aprovado: 'ok', ressalvas: 'warn', reprovado: 'fail' }[ult.resultado])} /></> : '—'}</td>
          </tr> })}</tbody>
      </table></div>
    </div>
  </main>
}
