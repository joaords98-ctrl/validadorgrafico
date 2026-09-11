import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, registrar, dataBR } from '../lib/supabase'

const RES_TXT = { aprovado: 'Aprovado na validação técnica', ressalvas: 'Aprovado com ressalvas técnicas', reprovado: 'Reprovado na validação técnica' }

export default function Aprovar({ modo }) {
  const { token } = useParams()
  const cand = modo === 'candidato'
  const [d, setD] = useState(undefined)
  const [arq, setArq] = useState(null)
  const [provas, setProvas] = useState([])
  const quem = modo
  const [nome, setNome] = useState('')
  const [coment, setComent] = useState('')
  const [feito, setFeito] = useState('')
  const [busy, setBusy] = useState(false)

  async function carregar() {
    const { data: dem } = await supabase.from('gr_demandas').select('*, candidato:gr_candidatos!gr_demandas_candidato_id_fkey(nome)').eq('token', token).maybeSingle()
    setD(dem || null); if (!dem) return
    const { data: a } = await supabase.from('gr_arquivos').select('*').eq('demanda_id', dem.id).eq('final', false).order('versao', { ascending: false }).limit(1)
    const ult = a?.[0]; setArq(ult || null)
    const paths = ult?.relatorio?.lados ? ult.relatorio.lados.map(l => l.prova_path) : ult?.prova_path ? [ult.prova_path] : []
    const urls = []; for (const p of paths) { const { data } = await supabase.storage.from('materiais').createSignedUrl(p, 3600); urls.push(data?.signedUrl) }
    setProvas(urls)
  }
  useEffect(() => { carregar() }, [token])

  async function observar() {
    if (!coment.trim()) return alert('Escreva a observação.')
    setBusy(true)
    await registrar(d.id, 'observacao', `Candidato${nome ? ' — ' + nome : ''} observou pelo link: ${coment}`, null)
    setFeito('Observação enviada para a equipe de design. Obrigado!')
    setBusy(false); setComent('')
  }
  async function responder(ok) {
    if (!ok && !coment.trim()) return alert('Descreva o que precisa mudar.')
    setBusy(true)
    const rotulo = quem === 'coordenacao' ? 'Partido' : `Candidato${nome ? ' — ' + nome : ''}`
    if (!ok) {
      await supabase.from('gr_demandas').update({ etapa: 'arte', aprov_coordenacao: false, aprov_candidato: false }).eq('id', d.id)
      await registrar(d.id, 'ajustes', `${rotulo} pediu ajustes pelo link: ${coment}`, null)
      setFeito('Pedido de ajuste registrado. A equipe de design vai receber o retorno e mandar uma nova prova.')
    } else {
      const patch = quem === 'coordenacao' ? { aprov_coordenacao: true } : { aprov_candidato: true }
      const ambos = (quem === 'coordenacao' || d.aprov_coordenacao) && (quem === 'candidato' || d.aprov_candidato || d.origem !== 'candidato')
      if (ambos) patch.etapa = 'fechamento'
      await supabase.from('gr_demandas').update(patch).eq('id', d.id)
      await registrar(d.id, 'aprovacao', `${rotulo} aprovou pelo link${coment ? ': ' + coment : ''}${ambos ? ' — aprovação final, liberado para produção' : ''}`, null)
      setFeito(ambos ? 'Aprovado. Material liberado para a gráfica.' : 'Aprovação registrada. Falta a outra aprovação para liberar a produção.')
    }
    setBusy(false); carregar()
  }

  if (d === undefined) return <main className="pub"><p className="muted">Carregando…</p></main>
  if (d === null) return <main className="pub"><div className="card"><h1>Link inválido</h1><p>Este link de aprovação não existe ou foi removido.</p></div></main>
  const emAprovacao = d.etapa === 'aprovacao'
  return (
    <main className="pub">
      <div className="pubhead"><img src="/missao.png" alt="Missão" /></div>
      <div className="card">
        <div className="num">{cand ? 'Prévia da arte' : 'Aprovação de material'} · #{d.numero}</div>
        <h1>{d.titulo}</h1>
        <p className="muted">{d.candidato?.nome || 'Partido'} · {d.peca} {d.largura_mm && `${d.largura_mm} × ${d.altura_mm} mm`}{d.quantidade && ` · ${d.quantidade} un.`}{d.prazo && ` · prazo ${dataBR(d.prazo)}`}</p>
        {arq && <p className={'tag ' + arq.resultado}>v{arq.versao} · {RES_TXT[arq.resultado]}</p>}
      </div>

      {provas.map((u, i) => <div className="card" key={i}>
        {provas.length > 1 && <h2>{arq.relatorio?.lados?.[i]?.nome || `Lado ${i + 1}`}</h2>}
        <img src={u} alt={'Prova ' + (i + 1)} className="prova" />
      </div>)}
      {!provas.length && <div className="card"><p className="muted">A prova ainda não foi gerada.</p></div>}

      <div className="card">
        {feito ? <p className="ok big">{feito}</p> : !emAprovacao ? <p className="muted">
          {d.etapa === 'arte' ? 'A arte está em ajuste. Uma nova prova será enviada.' : d.etapa === 'entrada' ? 'A arte ainda não foi feita.' : 'Este material já foi aprovado e liberado para produção.'}
        </p> : <>
          {cand ? <>
            <h2>Alguma observação?</h2>
            <p className="muted">Confira textos, nome, número e foto. A linha preta é o corte; o que está fora dela some.</p>
            <label>Seu nome<input value={nome} onChange={e => setNome(e.target.value)} placeholder="opcional" /></label>
            <label>Observação<textarea rows="3" value={coment} onChange={e => setComent(e.target.value)} placeholder="Ex.: trocar a foto, corrigir o número, aumentar o nome…" /></label>
            <div className="row">
              <button className="btn" onClick={() => responder(true)} disabled={busy || d.aprov_candidato}>{d.aprov_candidato ? 'Já aprovado' : 'Está tudo certo'}</button>
              <button className="btn ghost" onClick={observar} disabled={busy}>Enviar observação</button>
            </div>
          </> : <>
            <h2>Aprovação do partido</h2>
            <p className="muted">Você está respondendo pelo partido. Status: <b className={d.aprov_coordenacao ? 'ok' : ''}>partido {d.aprov_coordenacao ? 'aprovou' : 'pendente'}</b>{d.origem === 'candidato' && <> · <b className={d.aprov_candidato ? 'ok' : ''}>candidato {d.aprov_candidato ? 'aprovou' : 'pendente'}</b></>}</p>
            <label>Comentário ou ajuste<textarea rows="3" value={coment} onChange={e => setComent(e.target.value)} placeholder="Se pedir ajuste, diga o que mudar" /></label>
            <div className="row">
              <button className="btn" onClick={() => responder(true)} disabled={busy || d.aprov_coordenacao}>{d.aprov_coordenacao ? 'Já aprovado' : 'Aprovar'}</button>
              <button className="btn ghost" onClick={() => responder(false)} disabled={busy}>Pedir ajustes</button>
            </div>
          </>}
        </>}
      </div>
    </main>
  )
}
