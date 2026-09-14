import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, ETAPAS, ORIGENS, registrar, dataBR, horaBR } from '../lib/supabase'
import { openPdf, analyze, renderProof, analyzeImage, renderProofImage, checarCnpj } from '../lib/validator'
import { MOLDES } from '../lib/catalogo'

const ICON = { pass: '✓', warn: '!', fail: '✕' }

function Upload({ onFiles, busy, trocar }) {
  return <label className="upload">
    <input type="file" accept="application/pdf,image/png,image/jpeg" multiple onChange={e => { onFiles(e.target.files); e.target.value = '' }} disabled={!!busy} />
    <strong>{trocar ? 'Enviar arquivo corrigido' : 'Enviar PDF, PNG ou JPEG para validação'}</strong><br />
    <span className="muted">Frente e verso: um PDF de 2 páginas ou selecione os dois arquivos juntos.</span>
    {!trocar && <><br /><span className="muted">PDF: formato, sangria, CMYK, resolução, curvas e margens. Imagem: proporção, sangria, modo de cor e resolução efetiva.</span></>}
  </label>
}
const RES_TXT = { aprovado: 'Aprovado para a gráfica', ressalvas: 'Aprovado com ressalvas', reprovado: 'Reprovado — corrija antes de enviar' }

export default function Demanda({ perfil }) {
  const { id } = useParams()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [arqs, setArqs] = useState([])
  const [evs, setEvs] = useState([])
  const [busy, setBusy] = useState('')
  const [edit, setEdit] = useState(null)
  const [aviso, setAviso] = useState('')
  const [fontePrevia, setFontePrevia] = useState({})
  const [cands, setCands] = useState([])
  const [perfis, setPerfis] = useState([])
  const [dist, setDist] = useState('')
  const [conf, setConf] = useState({ nome: '', obs: '' })
  const [ret, setRet] = useState({ nome: '', obs: '' })
  const [coment, setComent] = useState('')
  const [provas, setProvas] = useState([])
  const [lado, setLado] = useState(0)

  const carregar = useCallback(async () => {
    const [{ data: dem }, { data: a }, { data: e }] = await Promise.all([
      supabase.from('gr_demandas').select('*, candidato:gr_candidatos!gr_demandas_candidato_id_fkey(*), contratante:gr_candidatos!gr_demandas_contratante_id_fkey(*), designer:gr_perfis!gr_demandas_designer_id_fkey(nome)').eq('id', id).single(),
      supabase.from('gr_arquivos').select('*, enviado:gr_perfis(nome)').eq('demanda_id', id).order('versao', { ascending: false }),
      supabase.from('gr_eventos').select('*, autor:gr_perfis(nome)').eq('demanda_id', id).order('em', { ascending: false }),
    ])
    setD(dem); setArqs(a || []); setEvs(e || [])
    const ult = (a || [])[0]
    const paths = ult?.relatorio?.lados ? ult.relatorio.lados.map(l => l.prova_path) : ult?.prova_path ? [ult.prova_path] : (a || []).filter(x => x.fonte && x.previa_path).map(x => x.previa_path)
    const urls = []
    for (const p of paths) { const { data } = await supabase.storage.from('materiais').createSignedUrl(p, 3600); urls.push(data?.signedUrl) }
    setProvas(urls); setLado(0)
    const fp = {}
    for (const x of (a || []).filter(x => x.fonte && x.previa_path)) { const { data } = await supabase.storage.from('materiais').createSignedUrl(x.previa_path, 3600); fp[x.id] = data?.signedUrl }
    setFontePrevia(fp)
  }, [id])
  useEffect(() => { carregar(); supabase.from('gr_perfis').select('id,nome').order('nome').then(({ data }) => setPerfis(data || [])); supabase.from('gr_candidatos').select('id,nome,cargo,cnpj_campanha').eq('ativo', true).order('nome').then(({ data }) => setCands(data || [])) }, [carregar])

  async function atualizar(patch, tipo, detalhe) {
    await supabase.from('gr_demandas').update(patch).eq('id', id)
    if (tipo) await registrar(id, tipo, detalhe, perfil?.id)
    carregar()
  }

  async function upload(files) {
    files = [...(files || [])]; if (!files.length) return
    setBusy('Lendo arquivo…')
    try {
      const opts = { targetW: d.largura_mm, targetH: d.altura_mm, forma: d.forma, molde: d.molde }
      const versao = (arqs.filter(a => !a.fonte)[0]?.versao || 0) + 1
      const base = `${id}/v${versao}`
      const lados = []; const uploads = []; const fontes = []
      let n = 0
      for (const file of files) {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
        const ext = isPdf ? 'pdf' : /\.png$/i.test(file.name) || file.type === 'image/png' ? 'png' : 'jpg'
        const path = files.length === 1 ? `${base}.${ext}` : `${base}-${uploads.length + 1}.${ext}`
        uploads.push({ path, file })
        if (isPdf) {
          const docs = await openPdf(new Uint8Array(await file.arrayBuffer())); fontes.push({ docs })
          for (let p = 0; p < docs.pjDoc.numPages; p++) {
            n++; setBusy(`Validando lado ${n}…`)
            const rel = await analyze(docs, { ...opts, page: p })
            const prova = await renderProof(docs, rel, `#${d.numero} ${d.titulo} · lado ${n}`)
            lados.push({ rel, prova })
          }
        } else {
          n++; setBusy(`Validando lado ${n}…`); fontes.push({ file })
          const rel = await analyzeImage(file, opts)
          const prova = await renderProofImage(rel, `#${d.numero} ${d.titulo} · lado ${n}`)
          lados.push({ rel, prova })
        }
      }
      const nome = i => lados.length === 1 ? 'Único' : lados.length === 2 ? ['Frente', 'Verso'][i] : `Lado ${i + 1}`
      setBusy('Enviando…')
      for (const u of uploads) { const r = await supabase.storage.from('materiais').upload(u.path, u.file, { contentType: u.file.type || 'application/octet-stream' }); if (r.error) throw r.error }
      const ladosRel = []
      for (let i = 0; i < lados.length; i++) {
        const prova_path = `${base}-prova-${i + 1}.png`
        await supabase.storage.from('materiais').upload(prova_path, lados[i].prova, { contentType: 'image/png' })
        const { _geo, ...rel } = lados[i].rel
        ladosRel.push({ nome: nome(i), prova_path, ...rel })
      }
      const ordem = { reprovado: 0, ressalvas: 1, aprovado: 2 }
      let resultado = ladosRel.reduce((a, l) => ordem[l.resultado] < ordem[a] ? l.resultado : a, 'aprovado')
      let extra = []
      const ct = d.contratante || d.candidato
      if (ct) {
        setBusy('Conferindo CNPJ e tiragem…')
        const { data: outros } = await supabase.from('gr_candidatos').select('nome, cnpj:cnpj_campanha').neq('id', ct.id)
        try { const chk = await checarCnpj(fontes, { cand: ct, quantidade: d.quantidade, outros: outros || [] }, setBusy); extra.push(chk) }
        catch (e) { extra.push({ t: 'CNPJ e tiragem', s: 'warn', msg: 'Não foi possível conferir automaticamente: ' + e.message }) }
        const mapa = { fail: 'reprovado', warn: 'ressalvas', pass: 'aprovado' }
        for (const c of extra) if (ordem[mapa[c.s]] < ordem[resultado]) resultado = mapa[c.s]
      }
      const relatorio = { resultado, lados: ladosRel, extra, arquivos: uploads.map(u => u.path) }
      await supabase.from('gr_arquivos').insert({ demanda_id: id, versao, path: uploads[0].path, prova_path: ladosRel[0].prova_path, relatorio, resultado, enviado_por: perfil?.id })
      await registrar(id, 'validacao', `v${versao} (${ladosRel.length} lado${ladosRel.length > 1 ? 's' : ''}): ${RES_TXT[resultado]}`, perfil?.id)
      const troca = d.etapa !== 'arte'
      if (resultado !== 'reprovado') await atualizar({ etapa: 'aprovacao', aprov_coordenacao: false, aprov_candidato: false }, 'etapa', (troca ? 'Arquivo trocado — aprovações zeradas. ' : '') + 'Arquivo OK → Aprovação executiva e política')
      else await atualizar({ etapa: 'arte', aprov_coordenacao: false, aprov_candidato: false }, 'etapa', (troca ? 'Arquivo trocado e reprovado na validação → volta para Arte' : 'Reprovado na validação técnica — ajustes técnicos'))
    } catch (e) { alert('Falha no upload: ' + e.message) }
    setBusy('')
  }

  async function aprovar(tipo, ok) {
    const quem = tipo === 'coordenacao' ? 'Partido' : 'Candidato'
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

  async function uploadFonte(file) {
    if (!file) return
    if (arqs.some(a => a.fonte && a.path.endsWith('/' + file.name.replace(/\s+/g, '_'))) && !confirm('Já existe um arquivo fonte com esse nome. Anexar de novo?')) return
    setBusy('Anexando arquivo fonte…'); setAviso('')
    const n = arqs.filter(a => a.fonte).length + 1
    const path = `${id}/fonte-${n}-${file.name.replace(/\s+/g, '_')}`
    const { error } = await supabase.storage.from('materiais').upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (error) alert('Falha: ' + error.message)
    else {
      await supabase.from('gr_arquivos').insert({ demanda_id: id, versao: 1000 + n, path, fonte: true, enviado_por: perfil?.id })
      await registrar(id, 'fonte', `Arquivo fonte anexado: ${file.name}`, perfil?.id)
      setAviso(`✓ ${file.name} anexado.`)
      carregar()
    }
    setBusy('')
  }
  async function anexarLink(final) {
    const url = prompt(final ? 'Link do arquivo final (Drive, WeTransfer…):' : 'Link do arquivo fonte (Drive, WeTransfer…):')
    if (!url || !/^https?:\/\//i.test(url.trim())) return
    const nome = prompt('Nome do arquivo (ex.: Wind ISAAK.cdr):') || 'arquivo externo'
    const n = arqs.filter(a => a.fonte).length + 1
    const versao = final ? (arqs.filter(a => !a.fonte)[0]?.versao || 0) + 1 : 1000 + n
    await supabase.from('gr_arquivos').insert({ demanda_id: id, versao, path: `${id}/${final ? 'v' + versao + '-final' : 'fonte-' + n}-${nome.replace(/\s+/g, '_')}`, url: url.trim(), fonte: !final, final, enviado_por: perfil?.id })
    await registrar(id, final ? 'final' : 'fonte', `${final ? 'Arquivo final' : 'Arquivo fonte'} por link externo: ${nome}`, perfil?.id)
    carregar()
  }
  async function uploadPrevia(arq, file) {
    if (!file) return
    setBusy('Enviando prévia…')
    const path = arq.path.replace(/\.[^.]+$/, '') + '-previa.' + (file.name.split('.').pop().toLowerCase() || 'png')
    const { error } = await supabase.storage.from('materiais').upload(path, file, { contentType: file.type, upsert: true })
    if (!error) { await supabase.from('gr_arquivos').update({ previa_path: path }).eq('id', arq.id); await registrar(id, 'fonte', `Prévia anexada para ${arq.path.split('/').pop()}`, perfil?.id); carregar() }
    else alert('Falha: ' + error.message)
    setBusy('')
  }
  async function uploadFinal(file) {
    if (!file) return
    setBusy('Enviando PDF final…')
    const versao = (arqs.filter(a => !a.fonte)[0]?.versao || 0) + 1
    const ext = file.name.split('.').pop().toLowerCase()
    const path = `${id}/v${versao}-final.${ext}`
    const { error } = await supabase.storage.from('materiais').upload(path, file, { contentType: file.type || 'application/octet-stream' })
    if (error) alert('Falha: ' + error.message)
    else {
      await supabase.from('gr_arquivos').insert({ demanda_id: id, versao, path, final: true, enviado_por: perfil?.id })
      await registrar(id, 'final', `Arquivo final para a gráfica anexado: ${file.name} (v${versao})`, perfil?.id)
      carregar()
    }
    setBusy('')
  }

  async function excluirArquivo(a) {
    const nome = a.fonte ? a.path.split('/').pop().replace(/^fonte-\d+-/, '') : `v${a.versao}${a.final ? ' (final)' : ''}`
    if (!confirm(`Excluir ${nome}? O arquivo sai do storage e da lista.`)) return
    const paths = [a.path, ...(a.relatorio?.arquivos || []), ...(a.relatorio?.lados || []).map(l => l.prova_path), a.prova_path, a.previa_path].filter(Boolean)
    if (!a.url) await supabase.storage.from('materiais').remove([...new Set(paths)])
    await supabase.from('gr_arquivos').delete().eq('id', a.id)
    await registrar(id, 'excluido', `${perfil.nome} excluiu ${nome}`, perfil?.id)
    carregar()
  }
  async function baixar(path, url) { if (url) return window.open(url, '_blank'); const { data } = await supabase.storage.from('materiais').createSignedUrl(path, 600); if (data) window.open(data.signedUrl, '_blank') }

  if (!d) return <main className="detail"><p className="muted">Carregando…</p></main>
  const ult = arqs.find(a => !a.final && !a.fonte)
  const etapaNome = Object.fromEntries(ETAPAS)[d.etapa]
  const etapaIdx = ETAPAS.findIndex(e => e[0] === d.etapa)

  return (
    <main className="detail">
      <div className="head">
        <div>
          <div className="num">#{d.numero} · {ORIGENS[d.origem]}{d.candidato ? ' · ' + d.candidato.nome : ''}</div>
          <h1>{d.titulo}</h1>
          <p className="muted">{d.peca}{d.material && ` · ${d.material}`} · {d.largura_mm && `${d.largura_mm} × ${d.altura_mm} mm`}{d.forma === 'redondo' && ' (redondo)'}{d.quantidade && ` · ${d.quantidade} un.`} · prazo {dataBR(d.prazo)}{d.designer && ` · designer: ${d.designer.nome}`}</p>
        </div>
        <ol className="steps">{ETAPAS.map(([k, n], i) => <li key={k} className={i < etapaIdx ? 'done' : i === etapaIdx ? 'now' : ''}>{n}</li>)}</ol>
      </div>

      <div className="grid">
        <section className="card">
          <h2>{etapaNome}</h2>
          {busy && <p className="busy">{busy}</p>}
          {(() => {
            const ct = d.contratante || d.candidato
            if (!ct?.cnpj_campanha || d.etapa === 'concluida') return null
            const txt = `CNPJ CONTRATANTE ${ct.cnpj_campanha}${ct.cnpj_grafica ? ` • CNPJ GRÁFICA ${ct.cnpj_grafica}` : ''}${d.quantidade ? ` • TIRAGEM ${d.quantidade} UN.` : ''}`
            return <div className="cnpj"><strong>Rodapé obrigatório</strong>{d.contratante && <span className="muted"> · contratante: {ct.nome} ({ct.cargo})</span>}{ct.status_cnpj && ct.status_cnpj !== 'OK' && <span className="err"> · {ct.status_cnpj}</span>}<code>{txt}</code><button type="button" className="link" onClick={() => navigator.clipboard.writeText(txt)}>copiar</button></div>
          })()}

          {d.etapa === 'entrada' && <>
            <p>{d.briefing || 'Sem briefing.'}</p>
            <div className="row">
              <label>Distribuir a arte para<select value={dist} onChange={e => setDist(e.target.value)}><option value="">escolha o designer</option>{perfis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
              <button className="btn" disabled={!dist} onClick={() => { const q = perfis.find(p => p.id === dist); atualizar({ etapa: 'arte', designer_id: dist }, 'distribuida', `${perfil.nome} distribuiu a arte para ${q?.nome}`) }}>Distribuir</button>
              <button className="btn ghost" onClick={() => atualizar({ etapa: 'arte', designer_id: perfil.id }, 'assumida', `${perfil.nome} assumiu a arte`)}>Assumir eu mesmo</button>
            </div>
            <button className="link" onClick={() => { const m = prompt('Motivo (ex.: reimpressão de material já produzido pela gráfica):'); if (m) atualizar({ etapa: 'fechamento', aprov_coordenacao: true, aprov_candidato: true }, 'forcado', `${perfil.nome} enviou direto para a gráfica sem arte nova: ${m}`) }}>Enviar direto para a gráfica sem arte (reimpressão)</button>
          </>}

          {d.molde && MOLDES[d.molde] && <div className="linkbox"><strong>Molde: {MOLDES[d.molde].nome}</strong><p className="muted">{MOLDES[d.molde].dica}</p><a className="btn ghost" href={MOLDES[d.molde].arquivo} download>Baixar molde (PDF)</a></div>}
          {d.etapa === 'arte' && evs[0]?.tipo === 'grafica_devolveu' && <p className="devolvido"><strong>Devolvido pela gráfica:</strong> {evs[0].detalhe.replace(/^Gráfica devolveu o arquivo: /, '')}</p>}
          {d.etapa === 'arte' && <>
            {d.briefing && <p className="brief">{d.briefing}</p>}
            {ult?.resultado === 'reprovado' && <p className="err">Última versão reprovada na validação técnica. Corrija os itens abaixo e envie de novo.</p>}
            <Upload onFiles={upload} busy={busy} />
            {d.designer_id !== perfil?.id && <button className="link" onClick={() => atualizar({ designer_id: perfil.id }, 'assumida', `${perfil.nome} assumiu a arte`)}>Assumir esta demanda</button>}
            <div className="forcar">
              <strong>Seguir mesmo assim</strong>
              <p className="muted">Sem PDF validado, o partido e o candidato veem a prévia do arquivo fonte. Para reimpressão de material que a gráfica já produziu, vá direto sem anexar nada. Fica registrado no histórico.</p>
              <div className="row">
                {(ult || arqs.some(a => a.fonte)) && <button className="btn ghost" onClick={() => { const m = prompt('Motivo para avançar sem passar na validação:'); if (m) atualizar({ etapa: 'aprovacao', aprov_coordenacao: false, aprov_candidato: false }, 'forcado', `${perfil.nome} enviou para aprovação sem validação aprovada: ${m}`) }}>Mandar para aprovação</button>}
                <button className="btn ghost" onClick={() => { const m = prompt('Motivo (ex.: reimpressão — a gráfica já tem o arquivo):'); if (m) atualizar({ etapa: 'fechamento', aprov_coordenacao: true, aprov_candidato: true }, 'forcado', `${perfil.nome} enviou direto para a gráfica: ${m}`) }}>Direto para a gráfica</button>
              </div>
            </div>
          </>}

          {d.etapa === 'aprovacao' && <>
            {(() => {
              const linkC = `${window.location.origin}/a/${d.token}`, linkF = `${window.location.origin}/c/${d.token}`
              const msgC = `Olá! Segue a prévia do material "${d.titulo}". Abra o link, confira e, se tiver alguma observação, escreva por lá: ${linkC}`
              const msgF = `Material "${d.titulo}" para aprovação: ${linkF}`
              const tel = (d.candidato?.telefone || '').replace(/\D/g, '')
              const wa = (t, m) => `https://wa.me/${t ? (t.length <= 11 ? '55' + t : t) : ''}?text=${encodeURIComponent(m)}`
              return <>
                {d.origem === 'candidato' && <div className="linkbox"><strong>Prévia para o candidato</strong><code>{linkC}</code>
                  <div className="row"><button type="button" className="btn ghost" onClick={() => navigator.clipboard.writeText(linkC)}>Copiar</button><a className="btn" href={wa(tel, msgC)} target="_blank" rel="noreferrer">Enviar no WhatsApp</a></div>
                  <p className="muted">O candidato vê só a arte e pode deixar observações ou marcar "está tudo certo".</p></div>}
                <div className="linkbox f"><strong>Aprovação do partido</strong><code>{linkF}</code>
                  <div className="row"><button type="button" className="btn ghost" onClick={() => navigator.clipboard.writeText(linkF)}>Copiar</button><a className="btn" href={wa('', msgF)} target="_blank" rel="noreferrer">Enviar no WhatsApp</a></div></div>
                <button className="link" onClick={() => { const m = prompt('Motivo para pular as aprovações pendentes e liberar para a gráfica:'); if (m) atualizar({ etapa: 'fechamento', aprov_coordenacao: true, aprov_candidato: true }, 'forcado', `${perfil.nome} liberou para a gráfica sem as aprovações pendentes: ${m}`) }}>Pular aprovações e liberar para a gráfica</button>
                {evs.filter(e => e.tipo === 'observacao').length > 0 && <div className="obs"><strong>Observações do candidato</strong>{evs.filter(e => e.tipo === 'observacao').map(e => <p key={e.id}><span className="muted">{horaBR(e.em)}</span> · {e.detalhe.replace(/^Candidato( — [^:]+)? observou pelo link: /, '')}</p>)}</div>}
              </>
            })()}
            <textarea rows="2" placeholder="Comentário ou ajuste pedido" value={coment} onChange={e => setComent(e.target.value)} />
            <div className="aprov">
              <div>
                <strong>Aprovação partido</strong> {d.aprov_coordenacao ? <span className="ok">aprovado</span>
                  : <><button className="btn" onClick={() => aprovar('coordenacao', true)}>Aprovou</button><button className="btn ghost" onClick={() => aprovar('coordenacao', false)}>Pediu ajustes</button></>}
              </div>
              <div>
                <strong>Aprovação candidato</strong> {d.origem !== 'candidato' ? <span className="muted">não se aplica</span> : d.aprov_candidato ? <span className="ok">aprovado</span>
                  : <><button className="btn" onClick={() => aprovar('candidato', true)}>Registrar aprovação</button><button className="btn ghost" onClick={() => aprovar('candidato', false)}>Pediu ajustes</button></>}
              </div>
              {d.origem !== 'candidato' && !d.aprov_candidato && <button className="link" onClick={() => atualizar({ aprov_candidato: true, ...(d.aprov_coordenacao ? { etapa: 'fechamento' } : {}) }, 'aprovacao', 'Peça do partido: aprovação do candidato dispensada')}>Dispensar aprovação do candidato</button>}
            </div>
          </>}

          {(d.etapa !== 'concluida' || arqs.some(a => a.fonte)) && <details className="troca" open={arqs.some(a => a.fonte)}><summary>Arquivos fonte (CDR, AI, PSD, INDD){arqs.some(a => a.fonte) && ` · ${arqs.filter(a => a.fonte).length}`}</summary>
            {arqs.filter(a => a.fonte).map(a => <div key={a.id} className="fonte">
              {fontePrevia[a.id] ? <img src={fontePrevia[a.id]} alt="prévia" /> : <div className="semprevia">{a.path.split('.').pop().toUpperCase()}</div>}
              <div><b>{a.path.split('/').pop().replace(/^fonte-\d+-/, '')}</b><br /><small className="muted">{a.enviado?.nome} · {horaBR(a.criado_em)}</small><br />
                <button className="link" onClick={() => baixar(a.path, a.url)}>{a.url ? 'abrir link' : 'baixar'}</button> · <button className="link danger" onClick={() => excluirArquivo(a)}>excluir</button> · <label className="link">{fontePrevia[a.id] ? 'trocar prévia' : 'anexar prévia (PNG/JPG)'}<input type="file" accept="image/png,image/jpeg" style={{ display: 'none' }} onChange={e => { uploadPrevia(a, e.target.files[0]); e.target.value = '' }} /></label></div>
            </div>)}
            {aviso && <p className="ok">{aviso}</p>}
            {d.etapa !== 'concluida' && <>
              <p className="muted">O arquivo fonte fica guardado para a gráfica ou outro designer; não passa pela validação. Para quem não abre CDR, anexe uma prévia em imagem (exporte do Corel em PNG).</p>
              <label className="upload small"><input type="file" accept=".cdr,.ai,.psd,.indd,.svg,.eps,.zip" onChange={e => { uploadFonte(e.target.files[0]); e.target.value = '' }} disabled={!!busy} />{busy && busy.includes('fonte') ? busy : 'Escolher arquivo fonte (até 50 MB)'}</label>
              <button className="link" onClick={() => anexarLink(false)}>Arquivo maior que 50 MB? Colar link do Drive / WeTransfer</button>
            </>}
          </details>}
          {(d.etapa === 'aprovacao' || d.etapa === 'fechamento') && <details className="troca"><summary>Houve alteração na arte? Trocar arquivo</summary>
            <p className="muted">O novo arquivo vira a v{(arqs.filter(a => !a.fonte)[0]?.versao || 0) + 1}, passa pela validação de novo e as aprovações voltam a zero.</p>
            <Upload onFiles={upload} busy={busy} trocar />
          </details>}

          {d.etapa === 'fechamento' && <>
            <ol className="check">
              <li className={arqs.some(a => a.final) ? 'ok' : ''}>Anexar o arquivo final que vai para a gráfica (CDR fechado, ou PDF/X-1a)
                <label className="upload small"><input type="file" accept=".cdr,.pdf,.ai,.zip" onChange={e => { uploadFinal(e.target.files[0]); e.target.value = '' }} disabled={!!busy} />Anexar arquivo final</label>
                <button className="link" onClick={() => anexarLink(true)}>ou colar link externo (arquivo grande)</button>
                {arqs.filter(a => a.final).map(a => <div key={a.id} className="muted">✓ {a.path.split('/').pop()}{a.url && ' (link externo)'}</div>)}
                <div className="muted">Reimpressão sem arquivo novo? Pode marcar como enviado direto no passo 2.</div></li>
              <li>Disparar para a gráfica
                <div className="row"><input placeholder="Nome da gráfica" value={d.grafica || ''} onChange={e => setD({ ...d, grafica: e.target.value })} />
                  <button className="btn" onClick={() => atualizar({ grafica: d.grafica, enviado_grafica_em: new Date().toISOString(), etapa: 'conferencia' }, 'fechamento', `Enviado para ${d.grafica || 'gráfica'}`)}>Marcar como enviado</button></div></li>
            </ol>
          </>}

          {d.etapa === 'conferencia' && <>
            <p className="muted">Enviado para {d.grafica || 'a gráfica'} em {horaBR(d.enviado_grafica_em)}.{(() => { const g = evs.find(e => e.tipo.startsWith('grafica_') && e.tipo !== 'grafica_devolveu'); return g ? ` Última etapa da gráfica: ${g.detalhe.replace(/^Gráfica: /, '')} (${horaBR(g.em)}).` : '' })()}</p>
            <ol className="check">
              <li className={d.conferido_em ? 'ok' : ''}><strong>Recebido e conferido no comitê</strong>
                {d.conferido_em ? <div>{d.conferido_por} · {horaBR(d.conferido_em)}{d.conferido_obs && <> · {d.conferido_obs}</>}</div> : <div className="row">
                  <label>Quem conferiu<input value={conf.nome} onChange={e => setConf({ ...conf, nome: e.target.value })} placeholder={perfil?.nome} /></label>
                  <label>Observação (quantidade, avarias…)<input value={conf.obs} onChange={e => setConf({ ...conf, obs: e.target.value })} /></label>
                  <button className="btn" onClick={() => { const n = conf.nome.trim() || perfil.nome; atualizar({ conferido_por: n, conferido_em: new Date().toISOString(), conferido_obs: conf.obs || null }, 'conferido', `Recebido e conferido no comitê por ${n}${conf.obs ? ': ' + conf.obs : ''}`) }}>Marcar conferido</button>
                </div>}</li>
              <li className={d.retirado_em ? 'ok' : ''}><strong>Remetido / retirado pelo candidato</strong>
                {d.retirado_em ? <div>{d.retirado_por} · {horaBR(d.retirado_em)}{d.retirado_obs && <> · {d.retirado_obs}</>}</div> : <div className="row">
                  <label>Quem retirou / recebeu<input value={ret.nome} onChange={e => setRet({ ...ret, nome: e.target.value })} placeholder={d.candidato?.nome || 'nome'} /></label>
                  <label>Observação (enviado por…, quantidade)<input value={ret.obs} onChange={e => setRet({ ...ret, obs: e.target.value })} /></label>
                  <button className="btn" disabled={!d.conferido_em} onClick={() => { const n = ret.nome.trim() || d.candidato?.nome || 'candidato'; atualizar({ retirado_por: n, retirado_em: new Date().toISOString(), retirado_obs: ret.obs || null, etapa: 'concluida' }, 'retirado', `Remetido/retirado por ${n}${ret.obs ? ': ' + ret.obs : ''} — demanda concluída`) }}>Marcar retirado e concluir</button>
                </div>}</li>
            </ol>
          </>}
          {d.etapa === 'concluida' && <div className="ok">
            <p>Enviado para {d.grafica || 'a gráfica'} em {horaBR(d.enviado_grafica_em)}.</p>
            {d.conferido_em && <p>Conferido no comitê por {d.conferido_por} em {horaBR(d.conferido_em)}.</p>}
            {d.retirado_em && <p>Retirado/remetido: {d.retirado_por} em {horaBR(d.retirado_em)}.</p>}
          </div>}

          {ult?.relatorio && (() => {
            const lados = ult.relatorio.lados || [{ nome: 'Único', ...ult.relatorio }]
            const L = lados[Math.min(lado, lados.length - 1)]
            return <div className="relatorio">
              <div className={'summary ' + ult.resultado}>v{ult.versao} · {RES_TXT[ult.resultado]}</div>
              {(ult.relatorio.extra || []).map(c => <div key={c.t} className={'chk ' + c.s}><span className="mark">{ICON[c.s]}</span><div><h3>{c.t}</h3><p>{c.msg}</p></div></div>)}
              {lados.length > 1 && <div className="tabs">{lados.map((l, i) => <button key={i} type="button" className={i === lado ? 'on' : ''} onClick={() => setLado(i)}>{l.nome} <span className={'dot ' + { aprovado: 'ok', ressalvas: 'warn', reprovado: 'fail' }[l.resultado]} /></button>)}</div>}
              {L.checks.map(c => <div key={c.t} className={'chk ' + c.s}><span className="mark">{ICON[c.s]}</span><div><h3>{c.t}</h3><p>{c.msg}</p></div></div>)}
              {L.images?.length > 0 && <details><summary>Imagens ({L.images.length})</summary>
                {L.images.map((p, i) => <div key={i} className="imgrow"><span>{p.w}×{p.h} px · {Math.round(p.wmm)}×{Math.round(p.hmm)} mm · {p.cs.toUpperCase()}</span><span className={p.dpi < 300 ? 'fail' : 'ok'}>{Math.round(p.dpi)} dpi</span></div>)}</details>}
            </div>
          })()}
        </section>

        <aside>
          <section className="card">
            <h2>Prova{provas.length > 1 && ` — ${(ult?.relatorio?.lados || [])[lado]?.nome || ''}`}</h2>
            {provas.length ? <><img src={provas[Math.min(lado, provas.length - 1)]} alt="Prova com marcas" className="prova" />
              <div className="row">{provas.map((u, i) => <a key={i} className="btn ghost" href={u} download target="_blank" rel="noreferrer">Baixar {provas.length > 1 ? (ult.relatorio.lados[i]?.nome || i + 1) : 'prova'}</a>)}</div></> : <p className="muted">Envie um arquivo para gerar a prova.</p>}
          </section>
          <section className="card">
            <h2>Versões</h2>
            {arqs.map(a => <div key={a.id} className="ver"><span>{a.fonte ? 'fonte · ' + a.path.split('.').pop().toUpperCase() : 'v' + a.versao + (a.final ? ' · final' : '')} {!a.fonte && <span className={'dot ' + (a.final ? 'ok' : { aprovado: 'ok', ressalvas: 'warn', reprovado: 'fail' }[a.resultado])} />}</span><span className="muted">{a.enviado?.nome} · {horaBR(a.criado_em)}</span><span>{(a.relatorio?.arquivos || [a.path]).map(p => <button key={p} className="link" onClick={() => baixar(p, a.url)}>{a.url ? 'link' : p.split('.').pop().toUpperCase()}</button>)} <button className="link danger" onClick={() => excluirArquivo(a)} title="Excluir">✕</button></span></div>)}
            {!arqs.length && <p className="muted">Nenhum arquivo ainda.</p>}
          </section>
          <section className="card">
            <h2>Histórico</h2>
            {evs.map(e => <div key={e.id} className="ev"><span className="muted">{horaBR(e.em)} · {e.autor?.nome}</span><br />{e.detalhe}</div>)}
          </section>
          <section className="card">
            <h2>Dados da demanda <button className="link" onClick={() => setEdit(edit ? null : { titulo: d.titulo, largura_mm: d.largura_mm || '', altura_mm: d.altura_mm || '', quantidade: d.quantidade || '', prazo: d.prazo || '', material: d.material || '', contratante_id: d.contratante_id || '', briefing: d.briefing || '' })}>{edit ? 'cancelar' : 'editar'}</button></h2>
            {edit ? <>
              <label>Título<input value={edit.titulo} onChange={e => setEdit({ ...edit, titulo: e.target.value })} /></label>
              <div className="row"><label>Largura (mm)<input type="number" step="0.5" value={edit.largura_mm} onChange={e => setEdit({ ...edit, largura_mm: e.target.value })} /></label><label>Altura (mm)<input type="number" step="0.5" value={edit.altura_mm} onChange={e => setEdit({ ...edit, altura_mm: e.target.value })} /></label></div>
              <div className="row"><label>Quantidade<input type="number" value={edit.quantidade} onChange={e => setEdit({ ...edit, quantidade: e.target.value })} /></label><label>Prazo<input type="date" value={edit.prazo} onChange={e => setEdit({ ...edit, prazo: e.target.value })} /></label></div>
              <label>Material<input value={edit.material} onChange={e => setEdit({ ...edit, material: e.target.value })} /></label>
              <label>CNPJ contratante<select value={edit.contratante_id} onChange={e => setEdit({ ...edit, contratante_id: e.target.value })}><option value="">do próprio candidato</option>{cands.filter(c => c.cnpj_campanha).map(c => <option key={c.id} value={c.id}>{c.nome} ({c.cargo})</option>)}</select></label>
              <label>Briefing<textarea rows="3" value={edit.briefing} onChange={e => setEdit({ ...edit, briefing: e.target.value })} /></label>
              <button className="btn" onClick={async () => { const p = { ...edit, largura_mm: edit.largura_mm || null, altura_mm: edit.altura_mm || null, quantidade: edit.quantidade || null, prazo: edit.prazo || null, material: edit.material || null, contratante_id: edit.contratante_id || null, briefing: edit.briefing || null }; await atualizar(p, 'editada', `${perfil.nome} editou os dados da demanda`); setEdit(null) }}>Salvar</button>
            </> : <p className="muted">Contratante: {(d.contratante || d.candidato)?.nome || '—'}{d.material && ` · ${d.material}`}{d.briefing && <><br />{d.briefing}</>}</p>}
          </section>
          {<button className="link danger" onClick={async () => { if (confirm('Excluir esta demanda e todos os arquivos?')) { await supabase.from('gr_demandas').delete().eq('id', id); nav('/') } }}>Excluir demanda</button>}
        </aside>
      </div>
    </main>
  )
}
