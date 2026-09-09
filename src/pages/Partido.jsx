import { useEffect, useState } from 'react'
import { supabase, dataBR } from '../lib/supabase'

export default function Partido() {
  const [itens, setItens] = useState([])
  const [provas, setProvas] = useState({})
  useEffect(() => {
    supabase.from('gr_demandas').select('*, candidato:gr_candidatos(nome,cargo,numero), gr_arquivos(versao,final,prova_path,relatorio,resultado)')
      .in('etapa', ['aprovacao', 'fechamento', 'concluida']).order('atualizado_em', { ascending: false }).then(async ({ data }) => {
        const lista = data || []; setItens(lista)
        const p = {}
        for (const d of lista) { const a = [...d.gr_arquivos].filter(x => !x.final).sort((x, y) => y.versao - x.versao)[0]; if (a?.prova_path) { const { data: u } = await supabase.storage.from('materiais').createSignedUrl(a.prova_path, 3600); p[d.id] = u?.signedUrl } }
        setProvas(p)
      })
  }, [])
  const pend = itens.filter(d => d.etapa === 'aprovacao' && !d.aprov_coordenacao)
  const outros = itens.filter(d => !pend.includes(d))
  const Card = ({ d }) => <a className="card pcard" href={`/c/${d.token}`}>
    {provas[d.id] && <img src={provas[d.id]} alt="" />}
    <div><div className="num">#{d.numero} · {d.peca}{d.largura_mm ? ` ${d.largura_mm}×${d.altura_mm}` : ''}{d.quantidade ? ` · ${d.quantidade} un.` : ''}</div>
      <b>{d.titulo}</b><div className="muted">{d.candidato?.nome || 'Partido'}{d.prazo ? ` · prazo ${dataBR(d.prazo)}` : ''}</div>
      <div className="muted">{d.etapa === 'aprovacao' ? (d.aprov_coordenacao ? 'partido aprovou · aguardando candidato' : 'aguardando aprovação do partido') : 'aprovado — em produção'}</div></div>
  </a>
  return <main className="form wide">
    <div className="card"><h1>Aprovações do partido</h1><p className="muted">{pend.length} material{pend.length !== 1 ? 'is' : ''} aguardando sua aprovação. Clique para ver a prova e aprovar ou pedir ajustes.</p></div>
    {pend.map(d => <Card key={d.id} d={d} />)}
    {!pend.length && <div className="card"><p className="muted">Nada pendente.</p></div>}
    {outros.length > 0 && <><h2 className="sec">Já aprovados</h2>{outros.map(d => <Card key={d.id} d={d} />)}</>}
  </main>
}
