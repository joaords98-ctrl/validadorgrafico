import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ETAPAS, dataBR } from '../lib/supabase'

const RES = { aprovado: 'ok', ressalvas: 'warn', reprovado: 'fail' }

export default function Board() {
  const [itens, setItens] = useState([])
  const [busca, setBusca] = useState('')
  useEffect(() => {
    supabase.from('gr_demandas')
      .select('*, candidato:gr_candidatos(nome), designer:gr_perfis!gr_demandas_designer_id_fkey(nome), gr_arquivos(resultado, versao)')
      .order('prazo', { ascending: true, nullsFirst: false })
      .then(({ data }) => setItens(data || []))
  }, [])
  const hoje = new Date().toISOString().slice(0, 10)
  const filtrados = itens.filter(d => !busca || (d.titulo + ' ' + (d.candidato?.nome || '')).toLowerCase().includes(busca.toLowerCase()))
  return (
    <main className="board">
      <div className="toolbar">
        <input placeholder="Buscar por título ou candidato" value={busca} onChange={e => setBusca(e.target.value)} />
        <span className="muted">{itens.filter(d => d.etapa !== 'concluida').length} em andamento</span>
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
                    <div className="num">#{d.numero} · {d.peca}{d.largura_mm ? ` ${d.largura_mm}×${d.altura_mm}` : ''}</div>
                    <div className="tit">{d.titulo}</div>
                    <div className="meta">{d.candidato?.nome || (d.origem === 'partido' ? 'Partido' : 'Flávio')}</div>
                    <div className="meta">
                      <span className={atrasada ? 'late' : ''}>{d.prazo ? 'prazo ' + dataBR(d.prazo) : 'sem prazo'}</span>
                      {d.designer && <span> · {d.designer.nome}</span>}
                      {ult && <span className={'dot ' + RES[ult.resultado]} title={'v' + ult.versao + ' ' + ult.resultado} />}
                    </div>
                    {key === 'aprovacao' && <div className="meta">{d.aprov_coordenacao ? '✓' : '○'} Flávio &nbsp; {d.aprov_candidato ? '✓' : '○'} candidato</div>}
                  </Link>
                )
              })}
              {!lista.length && <p className="empty">Nada aqui.</p>}
            </section>
          )
        })}
      </div>
    </main>
  )
}
