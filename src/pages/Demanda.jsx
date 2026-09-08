import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, ETAPAS, ORIGENS, registrar, dataBR, horaBR } from '../lib/supabase'
import { openPdf, analyze, renderProof } from '../lib/validator'

const ICON = { pass: '✓', warn: '!', fail: '✕' }
const RES_TXT = { aprovado: 'Aprovado para a gráfica', ressalvas: 'Aprovado com ressalvas', reprovado: 'Reprovado — corrija antes de enviar' }

export default function Demanda({ perfil }) {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [arqs, setArqs] = useState([])
  const [evs, setEvs] = useState([])
  const [busy, setBusy] = useState('')
  const [coment, setComent] = useState('')
  const [provaUrl, setProvaUrl] = useState(null)

  const carregar = useCallback(async () => {
    const [{ data: dem }, { data: a }, { data: e }] = await Promise.all([
      supabase.from('gr_demandas').select('*, candidato:gr_candidatos(*), designer:gr_perfis!gr_demandas_designer_id_fkey(nome)').eq('id', id).single(),
      supabase.from('gr_arquivos').select('*, enviado:gr_perfis(nome)').eq('demanda_id', id).order('versao', { ascending: false }),
      supabase.from('gr_eventos').select('*, autor:gr_perfis(nome)').eq('demanda_id', id).order('em', { ascending: false }),
    ])
    setD(dem); setArqs(a || []); setEvs(e || [])
    const ult = (a || [])[0]
    if (ult?.prova_path) { const { data } = await supabase.storage.from('materiais').createSignedUrl(ult.prova_path, 3600); setProvaUrl(data?.signedUrl) } else setProvaUrl(null)
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  async function atualizar(patch, tipo, detalhe) {
    await supabase.from('gr_demandas').update(patch).eq('id', id)
    if (tipo) await registrar(id, tipo, detalhe, perfil?.id)
    carregar()
  }

  async function upload(file) {
    if (!file) return
    setBusy('Lendo PDF…')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const docs = await openPdf(bytes)
      setBusy('Validando…')
      const rel = await analyze(docs, { targetW: d.largura_mm, targetH: d.altura_mm })
      setBusy('Gerando prova…')
      const prova = await renderProof(docs, rel, `#${d.numero} ${d.titulo}`)
      const versao = (arqs[0]?.versao || 0) + 1
      const base = `${id}/v${versao}`
      setBusy('Enviando…')
      const up1 = await supabase.storage.from('materiais').upload(`${base}.pdf`, file, { contentType: 'application/pdf' })
      if (up1.error) throw up1.error
      await supabase.storage.from('materiais').upload(`${base}-prova.png`, prova, { contentType: 'image/png' })
      const { _geo, ...relatorio } = rel
      await supabase.from('gr_arquivos').insert({ demanda_id: id, versao, path: `${base}.pdf`, prova_path: `${base}-prova.png`, relatorio, resultado: rel.resultado, enviado_por: perfil?.id })
      await registrar(id, 'validacao', `v${versao}: ${RES_TXT[rel.resultado]}`, perfil?.id)
      // Arquivo OK? → aprovação. Não → continua em arte (ajustes técnicos).
      if (rel.resultado !== 'reprovado') await atualizar({ etapa: 'aprovacao', aprov_coordenacao: false, aprov_candidato: false }, 'etapa', 'Arquivo OK → Aprovação executiva e política')
      else carregar()
    } catch (e) { alert('Falha no upload: ' + e.message) }
    setBusy('')
  }

  async function aprovar(tipo, ok) {
    const quem = tipo === 'coordenacao' ? 'Flávio (coordenação)' : 'Candidato'
    if (!ok) {
      if (!coment.trim()) return alert('Descreva o ajuste pedido.')
      await atualizar({ etapa: 'arte', aprov_coordenacao: false, aprov_candidato: false }, 'ajustes', `${quem} pediu ajustes de conteúdo: ${coment}`)
      setComent(''); return
    }
    const patch = tipo === 'coordenacao' ? { aprov_coordenacao: true } : { aprov_candidato: true }
    const ambos = (tipo === 'coordenacao' ? true : d.aprov_coordenacao) && (tipo === 'candidato' ? true : d.aprov_candidato)
    if (ambos) patch.etapa = 'fechamento'
    await atualizar(patch, 'aprovacao', `${quem} aprovou${coment ? ': ' + coment : ''}${ambos ? ' — aprovação final, liberado para produção' : ''}`)
    setComent('')
  }

  async function uploadFinal(file) {
    if (!file) return
    setBusy('Enviando PDF final…')
    const versao = (arqs[0]?.versao || 0) + 1
    const path = `${id}/v${versao}-final.pdf`
    const { error } = await supabase.storage.from('materiais').upload(path, file, { contentType: 'application/pdf' })
    if (!error) {
      await supabase.from('gr_arquivos').insert({ demanda_id: id, versao, path, final: true, enviado_por: perfil?.id })
      await registrar(id, 'final', `PDF/X-1a final anexado (v${versao})`, perfil?.id)
      carregar()
    }
    setBusy('')
  }

  async function baixar(path) { const { data } = await supabase.storage.from('materiais').createSignedUrl(path, 600); if (data) window.open(data.signedUrl, '_blank') }

  if (!d) return <main className="detail"><p className="muted">Carregando…</p></main>
  const ult = arqs.find(a => !a.final)
  const etapaNome = Object.fromEntries(ETAPAS)[d.etapa]
  const etapaIdx = ETAPAS.findIndex(e => e[0] === d.etapa)

  return (
    <main className="detail">
      <div className="head">
        <div>
          <div className="num">#{d.numero} · {ORIGENS[d.origem]}{d.candidato ? ' · ' + d.candidato.nome : ''}</div>
          <h1>{d.titulo}</h1>
          <p className="muted">{d.peca} · {d.largura_mm && `${d.largura_mm} × ${d.altura_mm} mm`}{d.quantidade && ` · ${d.quantidade} un.`} · prazo {dataBR(d.prazo)}{d.designer && ` · designer: ${d.designer.nome}`}</p>
        </div>
        <ol className="steps">{ETAPAS.map(([k, n], i) => <li key={k} className={i < etapaIdx ? 'done' : i === etapaIdx ? 'now' : ''}>{n}</li>)}</ol>
      </div>

      <div className="grid">
        <section className="card">
          <h2>{etapaNome}</h2>
          {busy && <p className="busy">{busy}</p>}
          {d.candidato?.cnpj_campanha && d.etapa !== 'concluida' && (() => {
            const txt = `CNPJ CONTRATANTE ${d.candidato.cnpj_campanha}${d.candidato.cnpj_grafica ? ` • CNPJ GRÁFICA ${d.candidato.cnpj_grafica}` : ''}${d.quantidade ? ` • TIRAGEM ${d.quantidade} UN.` : ''}`
            return <div className="cnpj"><strong>Rodapé obrigatório</strong>{d.candidato.status_cnpj && d.candidato.status_cnpj !== 'OK' && <span className="err"> · {d.candidato.status_cnpj}</span>}<code>{txt}</code><button type="button" className="link" onClick={() => navigator.clipboard.writeText(txt)}>copiar</button></div>
          })()}

          {d.etapa === 'entrada' && <>
            <p>{d.briefing || 'Sem briefing.'}</p>
            <button className="btn" onClick={() => atualizar({ etapa: 'arte', designer_id: perfil.id }, 'assumida', `${perfil.nome} assumiu a arte`)}>Assumir a arte</button>
          </>}

          {d.etapa === 'arte' && <>
            {d.briefing && <p className="brief">{d.briefing}</p>}
            {ult?.resultado === 'reprovado' && <p className="err">Última versão reprovada na validação técnica. Corrija os itens abaixo e envie de novo.</p>}
            <label className="upload">
              <input type="file" accept="application/pdf" onChange={e => upload(e.target.files[0])} disabled={!!busy} />
              <strong>Enviar PDF para validação</strong><br /><span className="muted">Formato, sangria, CMYK, resolução, curvas e margens são conferidos na hora.</span>
            </label>
            {d.designer_id !== perfil?.id && <button className="link" onClick={() => atualizar({ designer_id: perfil.id }, 'assumida', `${perfil.nome} assumiu a arte`)}>Assumir esta demanda</button>}
          </>}

          {d.etapa === 'aprovacao' && <>
            <p className="muted">Baixe a prova, mande pelo WhatsApp para o Flávio e para o candidato, e registre as respostas aqui.</p>
            <textarea rows="2" placeholder="Comentário ou ajuste pedido" value={coment} onChange={e => setComent(e.target.value)} />
            <div className="aprov">
              <div>
                <strong>Flávio (coordenação)</strong> {d.aprov_coordenacao ? <span className="ok">aprovado</span>
                  : <><button className="btn" onClick={() => aprovar('coordenacao', true)}>Aprovou</button><button className="btn ghost" onClick={() => aprovar('coordenacao', false)}>Pediu ajustes</button></>}
              </div>
              <div>
                <strong>Candidato</strong> {d.origem !== 'candidato' ? <span className="muted">não se aplica</span> : d.aprov_candidato ? <span className="ok">aprovado</span>
                  : <><button className="btn" onClick={() => aprovar('candidato', true)}>Registrar aprovação</button><button className="btn ghost" onClick={() => aprovar('candidato', false)}>Pediu ajustes</button></>}
              </div>
              {d.origem !== 'candidato' && !d.aprov_candidato && <button className="link" onClick={() => atualizar({ aprov_candidato: true, ...(d.aprov_coordenacao ? { etapa: 'fechamento' } : {}) }, 'aprovacao', 'Peça do partido: aprovação do candidato dispensada')}>Dispensar aprovação do candidato</button>}
            </div>
          </>}

          {d.etapa === 'fechamento' && <>
            <ol className="check">
              <li className={arqs.some(a => a.final) ? 'ok' : ''}>Gerar PDF/X-1a e anexar
                <label className="upload small"><input type="file" accept="application/pdf" onChange={e => uploadFinal(e.target.files[0])} disabled={!!busy} />Anexar PDF final</label></li>
              <li>Disparar para a gráfica
                <div className="row"><input placeholder="Nome da gráfica" value={d.grafica || ''} onChange={e => setD({ ...d, grafica: e.target.value })} />
                  <button className="btn" onClick={() => atualizar({ grafica: d.grafica, enviado_grafica_em: new Date().toISOString(), etapa: 'concluida' }, 'fechamento', `Enviado para ${d.grafica || 'gráfica'}`)}>Marcar como enviado</button></div></li>
            </ol>
          </>}

          {d.etapa === 'concluida' && <p className="ok">Enviado para {d.grafica || 'a gráfica'} em {horaBR(d.enviado_grafica_em)}.</p>}

          {ult?.relatorio && <div className="relatorio">
            <div className={'summary ' + ult.resultado}>v{ult.versao} · {RES_TXT[ult.resultado]}</div>
            {ult.relatorio.checks.map(c => <div key={c.t} className={'chk ' + c.s}><span className="mark">{ICON[c.s]}</span><div><h3>{c.t}</h3><p>{c.msg}</p></div></div>)}
            {ult.relatorio.images?.length > 0 && <details><summary>Imagens ({ult.relatorio.images.length})</summary>
              {ult.relatorio.images.map((p, i) => <div key={i} className="imgrow"><span>{p.w}×{p.h} px · {Math.round(p.wmm)}×{Math.round(p.hmm)} mm · {p.cs.toUpperCase()}</span><span className={p.dpi < 300 ? 'fail' : 'ok'}>{Math.round(p.dpi)} dpi</span></div>)}</details>}
          </div>}
        </section>

        <aside>
          <section className="card">
            <h2>Prova</h2>
            {provaUrl ? <><img src={provaUrl} alt="Prova com marcas" className="prova" /><a className="btn ghost" href={provaUrl} download target="_blank" rel="noreferrer">Baixar prova (PNG)</a></> : <p className="muted">Envie um PDF para gerar a prova.</p>}
          </section>
          <section className="card">
            <h2>Versões</h2>
            {arqs.map(a => <div key={a.id} className="ver"><span>v{a.versao}{a.final ? ' · final' : ''} <span className={'dot ' + (a.final ? 'ok' : { aprovado: 'ok', ressalvas: 'warn', reprovado: 'fail' }[a.resultado])} /></span><span className="muted">{a.enviado?.nome} · {horaBR(a.criado_em)}</span><button className="link" onClick={() => baixar(a.path)}>PDF</button></div>)}
            {!arqs.length && <p className="muted">Nenhum arquivo ainda.</p>}
          </section>
          <section className="card">
            <h2>Histórico</h2>
            {evs.map(e => <div key={e.id} className="ev"><span className="muted">{horaBR(e.em)} · {e.autor?.nome}</span><br />{e.detalhe}</div>)}
          </section>
          {d.etapa !== 'concluida' && <button className="link danger" onClick={async () => { if (confirm('Excluir esta demanda e todos os arquivos?')) { await supabase.from('gr_demandas').delete().eq('id', id); nav('/') } }}>Excluir demanda</button>}
        </aside>
      </div>
    </main>
  )
}
