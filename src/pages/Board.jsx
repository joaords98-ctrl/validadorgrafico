import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ETAPAS, ETAPAS_GRAFICA, dataBR } from '../lib/supabase'

const RES = { aprovado: 'ok', ressalvas: 'warn', reprovado: 'fail' }

export default function Board() {
  const [itens, setItens] = useState([])
  const [busca, setBusca] = useState('')
  const [orig, setOrig] = useState('todas')
  const [lixo, setLixo] = useState([])
  useEffect(() => {
    supabase.from('gr_demandas')
      .select('*, candidato:gr_candidatos!gr_demandas_candidato_id_fkey(nome), designer:gr_perfis!gr_demandas_designer_id_fkey(nome), gr_arquivos(resultado, versao), gr_eventos(tipo, em, detalhe)')
      .is('excluida_em', null).order('prazo', { ascending: true, nullsFirst: false })
      .then(({ data }) => setItens(data || []))
    supabase.from('gr_demandas').select('id,numero,titulo,excluida_em,excluida_por').not('excluida_em', 'is', null).order('excluida_em', { ascending: false }).then(({ data }) => setLixo(data || []))
  }, [])
  const hoje = new Date().toISOString().slice(0, 10)
  const filtrados = itens.filter(d => (orig === 'todas' || d.origem === orig) && (!busca || (d.titulo + ' ' + (d.candidato?.nome || '')).toLowerCase().includes(busca.toLowerCase())))
  return (
    <main className="board">
      <div className="toolbar">
        <input placeholder="Buscar por título ou candidato" value={busca} onChange={e => setBusca(e.target.value)} />
        <span className="muted">{itens.filter(d => d.etapa !== 'concluida').length} em andamento</span>
        <div className="chips">{[['todas', 'Todas'], ['candidato', 'Candidato'], ['partido', 'Partido']].map(([k, n]) => <button key={k} type="button" className={'btn ' + (orig === k ? '' : 'ghost')} onClick={() => setOrig(k)}>{n}{k !== 'todas' && ` (${itens.filter(d => d.origem === k).length})`}</button>)}</div>
      </div>
      <div className="cols">
        {ETAPAS.map(([key, nome]) => {
          const lista = filtrados.filter(d => d.etapa === key)
          return (
            <section key={key} className={'col ' + key}>
              <h2>{nome} <span>{lista.length}</span></h2>
              {lista.map(d => {
                const ult = [...(d.arquivos || [])].sort((a, b) => b.versao - a.versao)[0]
                const atrasada = d.prazo && d.prazo < hoje && d.etapa !== 'concluida'
                return (
                  <Link key={d.id} to={'/d/' + d.id} className="cardk">
                    <span className={'etq ' + d.origem}>{d.origem === 'candidato' ? 'Candidato' : 'Partido'}</span>
                    <div className="num">#{d.numero} · {d.peca}{d.largura_mm ? ` ${d.largura_mm}×${d.altura_mm}` : ''}</div>
                    <div className="tit">{d.titulo}</div>
                    <div className="meta">{d.candidato?.nome || 'Partido'}</div>
                    <div className="meta">
                      <span className={atrasada ? 'late' : ''}>{d.prazo ? 'prazo ' + dataBR(d.prazo) : 'sem prazo'}</span>
                      {d.designer && <span> · {d.designer.nome}</span>}
                      {ult && <span className={'dot ' + RES[ult.resultado]} title={'v' + ult.versao + ' ' + ult.resultado} />}
                    </div>
                    {key === 'arte' && (() => { const ev = [...(d.gr_eventos || [])].sort((a, b) => b.em.localeCompare(a.em))[0]; return ev?.tipo === 'grafica_devolveu' ? <div className="meta late">devolvido pela gráfica</div> : null })()}
                    {key === 'fechamento' && d.enviado_grafica_em && <div className="meta gstat">{(() => { const f = ETAPAS_GRAFICA.filter(([t]) => (d.gr_eventos || []).some(e => e.tipo === t)); const u = f[f.length - 1]; return u ? `gráfica: ${u[1].toLowerCase()}` : 'enviado · em produção' })()}</div>}
                    {key === 'conferencia' && <div className="meta">no comitê · conferido por {d.conferido_por} · aguardando retirada</div>}
                    {key === 'concluida' && (() => { const f = ETAPAS_GRAFICA.filter(([t]) => (d.gr_eventos || []).some(e => e.tipo === t)); const u = f[f.length - 1]; return <div className="meta gstat">{u ? `gráfica: ${u[1].toLowerCase()}` : 'gráfica: aguardando recebimento'}</div> })()}
                    {key === 'aprovacao' && <div className="meta">{d.aprov_coordenacao ? '✓' : '○'} Partido &nbsp; {d.aprov_candidato ? '✓' : '○'} candidato</div>}
                  </Link>
                )
              })}
              {!lista.length && <p className="empty">Nada aqui.</p>}
            </section>
          )
        })}
      </div>
      {lixo.length > 0 && <details className="lixeira"><summary>Lixeira ({lixo.length})</summary>
        {lixo.map(d => <div key={d.id} className="ver"><span>#{d.numero} · {d.titulo}</span><span className="muted">{d.excluida_por} · {dataBR(d.excluida_em)}</span><span><Link to={'/d/' + d.id}>abrir</Link> · <button className="link" onClick={async () => { await supabase.from('gr_demandas').update({ excluida_em: null, excluida_por: null }).eq('id', d.id); window.location.reload() }}>restaurar</button> · <button className="link danger" onClick={async () => { if (confirm('Excluir DEFINITIVAMENTE #' + d.numero + '? Não tem volta.')) { await supabase.from('gr_demandas').delete().eq('id', d.id); window.location.reload() } }}>apagar de vez</button></span></div>)}
      </details>}
    </main>
  )
}
