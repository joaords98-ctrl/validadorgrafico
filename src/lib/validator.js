// Validação técnica de pré-impressão + geração da prova com marcas.
// Mesmo motor do validador standalone: pdf.js (render/DPI/texto) + pdf-lib (caixas, fontes, cores).
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import * as PDFLib from 'pdf-lib'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const MM = 72 / 25.4
const mm = v => v / MM
const fmt = v => (Math.round(v * 10) / 10).toLocaleString('pt-BR')

export const STD = [['Santinho 10×7',100,70],['Santinho 7×10',70,100],['Cartão 9×5',90,50],['Adesivo 10×10',100,100],['Adesivo 5×5',50,50],['A6',105,148],['Flyer 10×15',100,150],['A5',148,210],['Panfleto 14×20',140,200],['Filipeta 10×21',100,210],['A4',210,297],['A3',297,420],['Cartaz 30×42',300,420],['Cartaz 42×60',420,600],['Cartaz 46×64',460,640],['Banner 60×90',600,900],['Banner 80×120',800,1200],['Banner 90×120',900,1200]]

export async function openPdf(bytes) {
  const pjDoc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise
  const plDoc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  return { pjDoc, plDoc }
}

/**
 * @param {{pjDoc, plDoc}} docs
 * @param {{page?:number, targetW?:number, targetH?:number, bleedMin?:number, safe?:number}} opts (mm)
 */
export async function analyze(docs, opts = {}) {
  const { pjDoc, plDoc } = docs
  const pi = opts.page ?? 0, bleedMin = opts.bleedMin ?? 3, safe = opts.safe ?? 3
  const tw = opts.targetW, th = opts.targetH
  const pj = await pjDoc.getPage(pi + 1)
  const pl = plDoc.getPage(pi)
  const ctx = plDoc.context
  const { PDFName, PDFDict, PDFArray, PDFStream, PDFRef } = PDFLib
  const L = o => (o instanceof PDFRef) ? ctx.lookup(o) : o
  const dget = (d, k) => d ? L(d.get(PDFName.of(k))) : undefined
  const nm = n => n ? n.toString() : ''
  const rectOf = a => { if (!a) return null; try { const r = a.asRectangle(); return { x: r.x, y: r.y, w: r.width, h: r.height } } catch { return null } }

  const rot = (pl.getRotation().angle % 360 + 360) % 360, swap = rot === 90 || rot === 270
  const media = rectOf(pl.node.MediaBox()), trimBox = rectOf(pl.node.TrimBox()), bleedBox = rectOf(pl.node.BleedBox())
  const dims = r => swap ? { w: mm(r.h), h: mm(r.w) } : { w: mm(r.w), h: mm(r.h) }

  const fonts = new Map(), images = [], colors = { cmyk: 0, rgb: 0, gray: 0, spot: 0, other: 0 }, seen = new Set()
  function csInfo(cs, depth = 0) {
    cs = L(cs); if (!cs || depth > 4) return 'other'
    if (cs instanceof PDFName) { const s = nm(cs)
      if (s === '/DeviceCMYK') return 'cmyk'; if (s === '/DeviceRGB' || s === '/CalRGB') return 'rgb'
      if (s === '/DeviceGray' || s === '/CalGray') return 'gray'; if (s === '/Pattern') return 'pattern'; return 'other' }
    if (cs instanceof PDFArray) { const fam = nm(L(cs.get(0)))
      if (fam === '/ICCBased') { const st = L(cs.get(1)); const n = st && st.dict ? dget(st.dict, 'N') : null; const v = n && n.asNumber ? n.asNumber() : 0; return v === 4 ? 'cmyk' : v === 3 ? 'rgb' : v === 1 ? 'gray' : 'other' }
      if (fam === '/Indexed') return csInfo(cs.get(1), depth + 1)
      if (fam === '/Separation' || fam === '/DeviceN') return 'spot'
      if (fam === '/CalRGB') return 'rgb'; if (fam === '/CalGray') return 'gray'; if (fam === '/Lab') return 'lab'; if (fam === '/Pattern') return 'pattern' }
    return 'other'
  }
  function fontEmbedded(fd) {
    let desc = dget(fd, 'FontDescriptor')
    if (!desc) { const dsc = dget(fd, 'DescendantFonts'); if (dsc instanceof PDFArray) desc = dget(L(dsc.get(0)), 'FontDescriptor') }
    if (nm(dget(fd, 'Subtype')) === '/Type3') return true
    if (!desc) return false
    return !!(dget(desc, 'FontFile') || dget(desc, 'FontFile2') || dget(desc, 'FontFile3'))
  }
  function decodeStream(st) {
    try { return new TextDecoder('latin1').decode(PDFLib.decodePDFRawStream(st).decode()) }
    catch { try { return new TextDecoder('latin1').decode(st.getContents ? st.getContents() : st.contents) } catch { return '' } }
  }
  function scanContent(txt, res) {
    const csd = dget(res, 'ColorSpace')
    const t = txt.replace(/\((?:\\.|[^\\)])*\)/g, '').replace(/<[0-9a-fA-F\s]*>/g, '')
    const cnt = re => (t.match(re) || []).length
    colors.rgb += cnt(/(?:^|\s)(?:rg|RG)(?=\s|$)/g)
    colors.cmyk += cnt(/(?:^|\s)(?:k|K)(?=\s|$)/g)
    colors.gray += cnt(/(?:^|\s)(?:g|G)(?=\s|$)/g)
    const re = /\/([^\s\/\[\]<>(){}%]+)\s+(?:cs|CS)(?=\s|$)/g; let m
    while ((m = re.exec(t))) {
      const n = '/' + m[1]; let kind
      if (n === '/DeviceRGB') kind = 'rgb'; else if (n === '/DeviceCMYK') kind = 'cmyk'; else if (n === '/DeviceGray') kind = 'gray'; else if (n === '/Pattern') kind = 'pattern'
      else kind = csd ? csInfo(csd.get(PDFName.of(m[1]))) : 'other'
      if (kind === 'pattern') continue
      colors[kind in colors ? kind : 'other']++
    }
  }
  function walk(res, depth) {
    if (!res || depth > 6) return
    const fd = dget(res, 'Font')
    if (fd instanceof PDFDict) for (const [k, v] of fd.entries()) { const f = L(v); if (f instanceof PDFDict) { const bn = nm(dget(f, 'BaseFont')).replace(/^\//, '').replace(/^[A-Z]{6}\+/, ''); fonts.set(bn || nm(k), fontEmbedded(f)) } }
    const xd = dget(res, 'XObject')
    if (xd instanceof PDFDict) for (const [k, v] of xd.entries()) {
      const key = (v instanceof PDFRef) ? v.toString() : nm(k) + depth; if (seen.has(key)) continue; seen.add(key)
      const x = L(v); if (!(x instanceof PDFStream)) continue
      const st = nm(dget(x.dict, 'Subtype'))
      if (st === '/Image') {
        const w = dget(x.dict, 'Width'), h = dget(x.dict, 'Height')
        const isMask = dget(x.dict, 'ImageMask'); if (isMask && isMask.toString() === 'true') continue
        images.push({ w: w ? w.asNumber() : 0, h: h ? h.asNumber() : 0, cs: csInfo(dget(x.dict, 'ColorSpace')) })
      } else if (st === '/Form') {
        const r2 = dget(x.dict, 'Resources'); scanContent(decodeStream(x), r2 || res); walk(r2, depth + 1)
      }
    }
  }
  const res = dget(pl.node, 'Resources') || pl.node.Resources()
  let contents = L(pl.node.Contents())
  const streams = []; if (contents instanceof PDFArray) for (let i = 0; i < contents.size(); i++) streams.push(L(contents.get(i))); else if (contents) streams.push(contents)
  for (const s of streams) if (s instanceof PDFStream) scanContent(decodeStream(s), res)
  walk(res, 0)

  // DPI efetivo
  const ops = await pj.getOperatorList(); const O = pdfjsLib.OPS
  const mul = (M, C) => [M[0]*C[0]+M[1]*C[2], M[0]*C[1]+M[1]*C[3], M[2]*C[0]+M[3]*C[2], M[2]*C[1]+M[3]*C[3], M[4]*C[0]+M[5]*C[2]+C[4], M[4]*C[1]+M[5]*C[3]+C[5]]
  let ctm = [1,0,0,1,0,0]; const stack = []; const placed = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i]
    if (fn === O.save) stack.push(ctm)
    else if (fn === O.restore) ctm = stack.pop() || [1,0,0,1,0,0]
    else if (fn === O.transform) ctm = mul(a, ctm)
    else if (fn === O.paintFormXObjectBegin) { stack.push(ctm); ctm = mul(a[0] || [1,0,0,1,0,0], ctm) }
    else if (fn === O.paintFormXObjectEnd) ctm = stack.pop() || ctm
    else if (fn === O.paintImageXObject || fn === O.paintImageXObjectRepeat || fn === O.paintInlineImageXObject) {
      let img = null; try { img = (fn === O.paintInlineImageXObject) ? a[0] : (pj.objs.has(a[0]) ? pj.objs.get(a[0]) : (pj.commonObjs.has(a[0]) ? pj.commonObjs.get(a[0]) : null)) } catch {}
      if (!img || !img.width) continue
      const wPt = Math.hypot(ctm[0], ctm[1]), hPt = Math.hypot(ctm[2], ctm[3]); if (wPt < 1 || hPt < 1) continue
      placed.push({ w: img.width, h: img.height, wmm: mm(wPt), hmm: mm(hPt), dpi: Math.min(img.width / (wPt / 72), img.height / (hPt / 72)) })
    }
  }
  for (const p of placed) { const m = images.find(im => im.w === p.w && im.h === p.h); p.cs = m ? m.cs : '?' }
  const dpiList = placed.filter(p => p.wmm > 3 && p.hmm > 3)

  // texto × margem de segurança
  const tc = await pj.getTextContent()
  const trimEff = trimBox || media
  const near = []; let textItems = 0
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue; textItems++
    const x = it.transform[4], y = it.transform[5], w = it.width || 0, h = it.height || 0
    const d = Math.min(x - trimEff.x, trimEff.x + trimEff.w - (x + w), y - trimEff.y, trimEff.y + trimEff.h - (y + h))
    if (mm(d) < safe) near.push({ str: it.str.trim().slice(0, 40), d: mm(d) })
  }
  near.sort((a, b) => a.d - b.d)

  const M = dims(media), T = trimBox ? dims(trimBox) : null
  const checks = []
  { // 1 formato e sangria
    let s = 'pass', msg = ''
    const outer = bleedBox || media
    const bleedPer = trimBox ? Math.min(mm(trimBox.x - outer.x), mm(outer.x + outer.w - trimBox.x - trimBox.w), mm(trimBox.y - outer.y), mm(outer.y + outer.h - trimBox.y - trimBox.h)) : null
    const close = (a, b) => Math.abs(a - b) <= 0.6
    const nearest = STD.map(([n, w, h]) => ({ n, d: Math.hypot(w - (T || M).w, h - (T || M).h) })).sort((a, b) => a.d - b.d)[0]
    if (trimBox) {
      msg = `Corte: ${fmt(T.w)} × ${fmt(T.h)} mm · página: ${fmt(M.w)} × ${fmt(M.h)} mm\nSangria: ${fmt(bleedPer)} mm por lado`
      if (bleedPer < 0.5) { s = 'fail'; msg += '\nSem sangria: fundos e imagens que encostam na borda vão gerar fio branco no corte.' }
      else if (bleedPer < bleedMin) { s = 'warn'; msg += `\nAbaixo do mínimo de ${bleedMin} mm.` }
      if (tw && th && !(close(T.w, tw) && close(T.h, th))) { s = 'fail'; msg += `\nTamanho de corte não bate com o pedido (${fmt(tw)} × ${fmt(th)} mm).` }
    } else {
      const gw = tw ? (M.w - tw) / 2 : null, gh = th ? (M.h - th) / 2 : null
      msg = `Página: ${fmt(M.w)} × ${fmt(M.h)} mm · sem TrimBox (o PDF não diz onde cortar)`
      if (tw && th) {
        if (close(M.w, tw) && close(M.h, th)) { s = 'fail'; msg += `\nA página tem exatamente o tamanho final: não há sangria. Reexporte com ${bleedMin} mm de sangria e marcas de corte.` }
        else if (gw >= 1 && gh >= 1 && Math.abs(gw - gh) < 0.6 && gw <= 8) { s = gw >= bleedMin ? 'warn' : 'fail'; msg += `\nParece haver ${fmt(gw)} mm de sangria por lado, mas sem marcas/TrimBox. Exporte com marcas de corte (Canva: "Marcas de corte e sangria"; Illustrator: "Usar sangria do documento").` }
        else { s = 'fail'; msg += `\nNão bate com ${fmt(tw)} × ${fmt(th)} mm nem com esse tamanho + sangria.` }
      } else { s = 'warn'; msg += `\nDemanda sem tamanho final cadastrado. Mais próximo de: ${nearest.n}.` }
    }
    if (nearest.d < 1.5) msg += `\nFormato reconhecido: ${nearest.n}.`
    checks.push({ t: 'Formato e sangria', s, msg })
  }
  { // 2 CMYK
    const rgbImgs = images.filter(i => i.cs === 'rgb').length, cmykImgs = images.filter(i => i.cs === 'cmyk').length, otherImgs = images.filter(i => !['rgb','cmyk','gray'].includes(i.cs)).length
    let s = 'pass', msg = `Imagens: ${cmykImgs} CMYK · ${rgbImgs} RGB · ${images.filter(i => i.cs === 'gray').length} cinza${otherImgs ? ` · ${otherImgs} outro` : ''}\nVetores/textos: ${colors.cmyk} CMYK · ${colors.rgb} RGB · ${colors.gray} cinza${colors.spot ? ` · ${colors.spot} cor especial` : ''}${colors.other ? ` · ${colors.other} outro` : ''}`
    if (rgbImgs || colors.rgb) { s = 'fail'; msg += '\nHá conteúdo em RGB: a gráfica vai converter e as cores podem sair diferentes.' }
    else if (colors.spot || colors.other || otherImgs) { s = 'warn'; msg += '\nHá cores especiais/ICC não identificadas. Confirme com a gráfica.' }
    if (!images.length && !colors.cmyk && !colors.rgb && !colors.gray) { s = 'warn'; msg = 'Nenhuma cor identificada no conteúdo.' }
    checks.push({ t: 'CMYK (imagens e vetores)', s, msg })
  }
  { // 3 resolução
    let s = 'pass', msg
    if (!dpiList.length) msg = 'Nenhuma imagem raster relevante (só vetores/texto).'
    else {
      const min = Math.min(...dpiList.map(p => p.dpi)), low = dpiList.filter(p => p.dpi < 300).length
      msg = `${dpiList.length} imagem(ns) · menor resolução efetiva: ${Math.round(min)} dpi`
      if (min < 200) { s = 'fail'; msg += `\n${low} imagem(ns) abaixo de 300 dpi — vão sair pixeladas.` }
      else if (min < 300) { s = 'warn'; msg += `\n${low} imagem(ns) entre 200 e 300 dpi: aceitável em cartaz, ruim em peça de mão.` }
    }
    checks.push({ t: 'Resolução (300 dpi mín.)', s, msg })
  }
  { // 4 curvas
    let s = 'pass', msg
    const list = [...fonts.entries()]
    if (!textItems && !list.length) msg = 'Nenhum texto vivo: todo o texto está em curvas.'
    else {
      const missing = list.filter(([, e]) => !e).map(([n]) => n)
      msg = `${textItems} bloco(s) de texto vivo · fontes: ${list.map(([n]) => n).join(', ') || '—'}`
      if (missing.length) { s = 'fail'; msg += `\nFontes NÃO incorporadas: ${missing.join(', ')}. Converta em curvas.` }
      else { s = 'warn'; msg += '\nFontes incorporadas. Aceito pela maioria das gráficas, mas o padrão é texto em curvas.' }
    }
    checks.push({ t: 'Textos em curvas', s, msg })
  }
  { // 5 margem
    let s = 'pass', msg
    if (!textItems) msg = 'Sem texto vivo para conferir — confira na prova.'
    else if (!near.length) msg = `Todo o texto está a mais de ${fmt(safe)} mm do corte.`
    else { s = 'fail'; msg = `${near.length} bloco(s) a menos de ${fmt(safe)} mm do corte:\n` + near.slice(0, 5).map(n => `• "${n.str}" (${fmt(Math.max(n.d, 0))} mm${n.d < 0 ? ', fora do corte' : ''})`).join('\n') }
    checks.push({ t: 'Margens de segurança', s, msg })
  }
  const order = { fail: 0, warn: 1, pass: 2 }
  const worst = checks.reduce((a, c) => order[c.s] < order[a] ? c.s : a, 'pass')
  const resultado = worst === 'pass' ? 'aprovado' : worst === 'warn' ? 'ressalvas' : 'reprovado'
  return { resultado, checks, images: dpiList.sort((a, b) => a.dpi - b.dpi), corte: T || M, pagina: pi + 1, paginas: pjDoc.numPages,
    _geo: { media, trimBox, bleedBox, trimEff, safe, rot } }
}

/** Renderiza a prova com marcas e devolve um Blob PNG. */
export async function renderProof(docs, report, label = '') {
  const { pjDoc } = docs
  const g = report._geo
  const pj = await pjDoc.getPage(report.pagina)
  const base = pj.getViewport({ scale: 1 })
  const scale = Math.min(4, Math.max(1.2, 1600 / Math.max(base.width, base.height)))
  const vp = pj.getViewport({ scale })
  const px = v => v * MM * scale
  const pad = px(14)
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width + 2 * pad); cv.height = Math.round(vp.height + 2 * pad + px(12))
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height)
  await pj.render({ canvasContext: c, viewport: vp, transform: [1,0,0,1,pad,pad] }).promise
  const rect = b => { const p1 = vp.convertToViewportPoint(b.x, b.y), p2 = vp.convertToViewportPoint(b.x + b.w, b.y + b.h)
    return { x: Math.min(p1[0], p2[0]) + pad, y: Math.min(p1[1], p2[1]) + pad, w: Math.abs(p2[0] - p1[0]), h: Math.abs(p2[1] - p1[1]) } }
  const media = rect(g.media), trim = rect(g.trimEff), outer = rect(g.bleedBox || g.media)
  c.save(); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.rect(media.x, media.y, media.w, media.h); c.rect(trim.x, trim.y, trim.w, trim.h); c.fill('evenodd'); c.restore()
  c.lineWidth = Math.max(1, px(0.15))
  c.strokeStyle = '#d6002a'; c.strokeRect(outer.x, outer.y, outer.w, outer.h)
  const sm = px(g.safe); c.setLineDash([px(1.2), px(0.8)]); c.strokeStyle = '#1e8e3e'; c.strokeRect(trim.x + sm, trim.y + sm, trim.w - 2 * sm, trim.h - 2 * sm); c.setLineDash([])
  c.strokeStyle = '#161616'; c.strokeRect(trim.x, trim.y, trim.w, trim.h)
  const off = Math.max(outer.x < trim.x ? trim.x - outer.x : 0, px(3)) + px(1.5), len = px(5)
  const mark = (x, y, dx, dy) => { c.beginPath(); c.moveTo(x + dx * off, y); c.lineTo(x + dx * (off + len), y); c.moveTo(x, y + dy * off); c.lineTo(x, y + dy * (off + len)); c.stroke() }
  mark(trim.x, trim.y, -1, -1); mark(trim.x + trim.w, trim.y, 1, -1); mark(trim.x, trim.y + trim.h, -1, 1); mark(trim.x + trim.w, trim.y + trim.h, 1, 1)
  const by = cv.height - px(10), sw = px(6)
  ;['#00a3e0','#e5007d','#ffd500','#161616','#7fd1ef','#f27fbd','#ffea7f','#8a8a8a'].forEach((k, i) => { c.fillStyle = k; c.fillRect(pad + i * sw, by, sw, px(5)) })
  c.fillStyle = '#161616'; c.font = `${Math.round(px(3.2))}px sans-serif`; c.textBaseline = 'top'
  c.fillText(`${label} · corte ${fmt(report.corte.w)} × ${fmt(report.corte.h)} mm · sangria ${fmt(Math.max(0, (outer.w - trim.w) / 2 / (MM * scale)))} mm · prova de tela, cores não calibradas`, pad + 8 * sw + px(3), by + px(0.8))
  return new Promise(r => cv.toBlob(r, 'image/png'))
}

/* ───────── Imagens (PNG / JPEG) ───────── */
function imgInfo(bytes) {
  const b = bytes
  if (b[0] === 0x89 && b[1] === 0x50) { // PNG
    const dv = new DataView(b.buffer, b.byteOffset)
    const w = dv.getUint32(16), h = dv.getUint32(20), ct = b[25]
    const cs = ct === 0 || ct === 4 ? 'gray' : ct === 3 ? 'indexed' : 'rgb'
    let dpi = null
    for (let p = 8; p + 8 < b.length;) { const len = dv.getUint32(p); const type = String.fromCharCode(b[p+4],b[p+5],b[p+6],b[p+7])
      if (type === 'pHYs') { const ppu = dv.getUint32(p + 8); if (b[p + 16] === 1) dpi = Math.round(ppu * 0.0254); break }
      if (type === 'IDAT') break; p += 12 + len }
    return { fmt: 'PNG', w, h, cs, alpha: ct === 4 || ct === 6, dpi }
  }
  if (b[0] === 0xFF && b[1] === 0xD8) { // JPEG
    let p = 2, w = 0, h = 0, comps = 0, adobe = false, transform = null, dpi = null
    while (p < b.length) {
      if (b[p] !== 0xFF) { p++; continue }
      const m = b[p + 1]; if (m === 0xD8 || (m >= 0xD0 && m <= 0xD7) || m === 0x01) { p += 2; continue }
      const len = (b[p + 2] << 8) | b[p + 3]
      if (m === 0xE0 && String.fromCharCode(b[p+4],b[p+5],b[p+6],b[p+7]) === 'JFIF') { const u = b[p + 11]; const x = (b[p+12] << 8) | b[p+13]; if (u === 1) dpi = x; if (u === 2) dpi = Math.round(x * 2.54) }
      if (m === 0xEE && String.fromCharCode(b[p+4],b[p+5],b[p+6],b[p+7],b[p+8]) === 'Adobe') { adobe = true; transform = b[p + 15] }
      if ((m >= 0xC0 && m <= 0xC3) || (m >= 0xC5 && m <= 0xC7) || (m >= 0xC9 && m <= 0xCB) || (m >= 0xCD && m <= 0xCF)) { h = (b[p+5] << 8) | b[p+6]; w = (b[p+7] << 8) | b[p+8]; comps = b[p + 9]; break }
      if (m === 0xDA) break
      p += 2 + len
    }
    const cs = comps === 4 ? 'cmyk' : comps === 1 ? 'gray' : 'rgb'
    return { fmt: 'JPEG', w, h, cs, alpha: false, dpi, adobe, transform }
  }
  return null
}

export async function analyzeImage(file, opts = {}) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const info = imgInfo(bytes)
  if (!info) throw new Error('Formato não reconhecido (use PDF, PNG ou JPEG).')
  const bleedMin = opts.bleedMin ?? 3, safe = opts.safe ?? 3, tw = opts.targetW, th = opts.targetH
  const checks = []
  const ratio = info.w / info.h
  let cutW = null, cutH = null, bleed = 0, assumed = ''
  if (tw && th) {
    const rTrim = tw / th, rBleed = (tw + 2 * bleedMin) / (th + 2 * bleedMin)
    const near = (a, b) => Math.abs(a / b - 1) < 0.01
    if (near(ratio, rBleed) && !near(ratio, rTrim)) { cutW = tw + 2 * bleedMin; cutH = th + 2 * bleedMin; bleed = bleedMin; assumed = `Proporção bate com ${tw} × ${th} mm + ${bleedMin} mm de sangria por lado.` }
    else if (near(ratio, rTrim)) { cutW = tw; cutH = th; bleed = 0; assumed = `Proporção bate com ${tw} × ${th} mm exatos (sem sangria).` }
  }
  { // formato e sangria
    let s = 'pass', msg = `${info.fmt} ${info.w} × ${info.h} px · proporção ${ratio.toFixed(3)}`
    if (!tw || !th) { s = 'warn'; msg += '\nDemanda sem tamanho final cadastrado — não dá para conferir proporção nem sangria.' }
    else if (cutW == null) { s = 'fail'; msg += `\nProporção não bate com ${tw} × ${th} mm (${(tw/th).toFixed(3)}) nem com tamanho + sangria (${((tw+2*bleedMin)/(th+2*bleedMin)).toFixed(3)}). A gráfica vai esticar ou cortar.` }
    else if (bleed === 0) { s = 'fail'; msg += `\n${assumed}\nImagem sem sangria: fundo ou foto que encosta na borda gera fio branco no corte. Exporte com ${bleedMin} mm a mais em cada lado (${Math.round((tw+2*bleedMin)/25.4*300)} × ${Math.round((th+2*bleedMin)/25.4*300)} px a 300 dpi).` }
    else msg += `\n${assumed}\nEm imagem não há marca de corte: avise a gráfica que a sangria é de ${bleedMin} mm.`
    checks.push({ t: 'Formato e sangria', s, msg })
  }
  { // cor
    let s = 'pass', msg = `Modo de cor: ${info.cs.toUpperCase()}${info.alpha ? ' com transparência' : ''}${info.adobe ? ' (Adobe JPEG)' : ''}`
    if (info.cs === 'rgb' || info.cs === 'indexed') { s = 'fail'; msg += '\nImagem em RGB: a gráfica vai converter e as cores podem sair diferentes. PNG é sempre RGB — para CMYK exporte JPEG ou PDF pelo Photoshop/Illustrator.' }
    if (info.alpha) { s = s === 'fail' ? 'fail' : 'warn'; msg += '\nTransparência não existe em impressão: o que for transparente vira branco (ou o fundo da chapa).' }
    checks.push({ t: 'CMYK (imagens e vetores)', s, msg })
  }
  { // resolução
    let s = 'pass', msg
    if (cutW) {
      const dpi = Math.min(info.w / (cutW / 25.4), info.h / (cutH / 25.4))
      msg = `${Math.round(dpi)} dpi efetivos no tamanho de ${cutW} × ${cutH} mm`
      if (info.dpi && Math.abs(info.dpi - dpi) > 20) msg += ` (o arquivo diz ${info.dpi} dpi, mas o que vale é o tamanho impresso)`
      if (dpi < 200) { s = 'fail'; msg += `\nVai sair pixelada. Mínimo para esse tamanho: ${Math.round(cutW/25.4*300)} × ${Math.round(cutH/25.4*300)} px.` }
      else if (dpi < 300) { s = 'warn'; msg += '\nEntre 200 e 300 dpi: aceitável em cartaz visto de longe, ruim em peça de mão.' }
    } else if (tw && th) {
      const dpi = Math.min(info.w / (tw / 25.4), info.h / (th / 25.4)); msg = `~${Math.round(dpi)} dpi se impressa em ${tw} × ${th} mm`; s = dpi < 200 ? 'fail' : dpi < 300 ? 'warn' : 'pass'
    } else { s = 'warn'; msg = info.dpi ? `Arquivo declara ${info.dpi} dpi; sem tamanho final não dá para calcular a resolução real.` : 'Sem tamanho final não dá para calcular a resolução real.' }
    checks.push({ t: 'Resolução (300 dpi mín.)', s, msg })
  }
  checks.push({ t: 'Textos em curvas', s: 'warn', msg: 'Arquivo de imagem: todo o texto já está rasterizado. Bordas de letras pequenas podem sair serrilhadas — confira na prova em 100%.' })
  checks.push({ t: 'Margens de segurança', s: 'warn', msg: `Não dá para medir automaticamente em imagem. Confira na prova se textos e logos estão dentro da linha verde (${safe} mm do corte).` })
  const order = { fail: 0, warn: 1, pass: 2 }
  const worst = checks.reduce((a, c) => order[c.s] < order[a] ? c.s : a, 'pass')
  const resultado = worst === 'pass' ? 'aprovado' : worst === 'warn' ? 'ressalvas' : 'reprovado'
  return { resultado, checks, images: [], corte: { w: cutW ? cutW - 2 * bleed : (tw || null), h: cutH ? cutH - 2 * bleed : (th || null) }, pagina: 1, paginas: 1, tipo: 'imagem',
    _geo: { file, info, cutW, cutH, bleed, safe } }
}

export async function renderProofImage(report, label = '') {
  const g = report._geo
  const bmp = await createImageBitmap(g.file)
  const maxSide = 1600, sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
  const iw = Math.round(bmp.width * sc), ih = Math.round(bmp.height * sc)
  const pxmm = g.cutW ? iw / g.cutW : iw / 100 // px por mm
  const px = v => v * pxmm
  const pad = px(14)
  const cv = document.createElement('canvas'); cv.width = Math.round(iw + 2 * pad); cv.height = Math.round(ih + 2 * pad + px(12))
  const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height)
  c.drawImage(bmp, pad, pad, iw, ih)
  const outer = { x: pad, y: pad, w: iw, h: ih }
  const bl = px(g.bleed)
  const trim = { x: pad + bl, y: pad + bl, w: iw - 2 * bl, h: ih - 2 * bl }
  if (g.bleed) { c.save(); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.rect(outer.x, outer.y, outer.w, outer.h); c.rect(trim.x, trim.y, trim.w, trim.h); c.fill('evenodd'); c.restore() }
  c.lineWidth = Math.max(1, px(0.15))
  c.strokeStyle = '#d6002a'; c.strokeRect(outer.x, outer.y, outer.w, outer.h)
  const sm = px(g.safe); c.setLineDash([px(1.2), px(0.8)]); c.strokeStyle = '#1e8e3e'; c.strokeRect(trim.x + sm, trim.y + sm, trim.w - 2 * sm, trim.h - 2 * sm); c.setLineDash([])
  c.strokeStyle = '#161616'; c.strokeRect(trim.x, trim.y, trim.w, trim.h)
  const off = Math.max(bl, px(3)) + px(1.5), len = px(5)
  const mark = (x, y, dx, dy) => { c.beginPath(); c.moveTo(x + dx * off, y); c.lineTo(x + dx * (off + len), y); c.moveTo(x, y + dy * off); c.lineTo(x, y + dy * (off + len)); c.stroke() }
  mark(trim.x, trim.y, -1, -1); mark(trim.x + trim.w, trim.y, 1, -1); mark(trim.x, trim.y + trim.h, -1, 1); mark(trim.x + trim.w, trim.y + trim.h, 1, 1)
  const by = cv.height - px(10), sw = px(6)
  ;['#00a3e0','#e5007d','#ffd500','#161616','#7fd1ef','#f27fbd','#ffea7f','#8a8a8a'].forEach((k, i) => { c.fillStyle = k; c.fillRect(pad + i * sw, by, sw, px(5)) })
  c.fillStyle = '#161616'; c.font = `${Math.round(px(3.2))}px sans-serif`; c.textBaseline = 'top'
  const corte = report.corte.w ? `corte ${fmt(report.corte.w)} × ${fmt(report.corte.h)} mm · sangria ${g.bleed} mm` : 'tamanho final não informado'
  c.fillText(`${label} · ${g.info.fmt} ${g.info.w}×${g.info.h} px · ${corte} · prova de tela, cores não calibradas`, pad + 8 * sw + px(3), by + px(0.8))
  return new Promise(r => cv.toBlob(r, 'image/png'))
}
