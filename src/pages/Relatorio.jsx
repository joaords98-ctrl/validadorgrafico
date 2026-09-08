import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, ETAPAS, dataBR, horaBR } from '../lib/supabase'

export default function Relatorio() {
  const [itens, setItens] = useState([])
  const [so, setSo] = useState('concluida')
  const [de, setDe] = useState(''), [ate, setAte] = useState('')
  useEffect(() => {
    supabase.from('gr_demandas').select('*, candidato:gr_candidatos(nome,nome_completo,cargo,numero,cnpj_campanha,cnpj_grafica), designer:gr_perfis!gr_demandas_designer_id_fkey(nome), gr_arquivos(versao,final,resultado)')
      .order('enviado_grafica_em', { ascending: false, nullsFirst: false }).then(({ data }) => setItens(data || []))
  }, [])
  const etapaNome = Object.fromEntries(ETAPAS)
  const lista = itens.filter(d => (so === 'todas' || d.etapa === so) && (!de || (d.enviado_grafica_em || d.criado_em) >= de) && (!ate || (d.enviado_grafica_em || d.criado_em).slice(0, 10) <= ate))
  const totalUn = lista.reduce((a, d) => a + (d.quantidade || 0), 0)
  const versaoFinal = d => { const a = [...(d.gr_arquivos || [])].sort((x, y) => y.versao - x.versao); return (a.find(x => x.final) || a[0])?.versao }

  const cols = ['Nº', 'Candidato', 'Cargo', 'Número', 'Peça', 'Tamanho (mm)', 'Quantidade', 'Etapa', 'Designer', 'Gráfica', 'Enviado em', 'Versão', 'CNPJ campanha', 'CNPJ gráfica', 'Prazo']
  const linha = d => [d.numero, d.candidato?.nome || (d.origem === 'partido' ? 'Partido' : 'Coordenação'), d.candidato?.cargo || '', d.candidato?.numero || '', d.peca, d.largura_mm ? `${d.largura_mm}×${d.altura_mm}` : '', d.quantidade || '', etapaNome[d.etapa], d.designer?.nome || '', d.grafica || '', d.enviado_grafica_em ? horaBR(d.enviado_grafica_em) : '', versaoFinal(d) ? 'v' + versaoFinal(d) : '', d.candidato?.cnpj_campanha || '', d.candidato?.cnpj_grafica || '', d.prazo ? dataBR(d.prazo) : '']

  function csv() {
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const txt = '\uFEFF' + [cols, ...lista.map(linha)].map(r => r.map(esc).join(';')).join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = `materiais-${so}-${new Date().toISOString().slice(0, 10)}.csv`; a.click()
  }

  return (
    <main className="form wide">
      <div className="card">
        <h1>Relatório de materiais</h1>
        <div className="row">
          <label>Mostrar<select value={so} onChange={e => setSo(e.target.value)}><option value="concluida">Enviadas para gráfica</option>{ETAPAS.filter(e => e[0] !== 'concluida').map(([k, n]) => <option key={k} value={k}>{n}</option>)}<option value="todas">Todas</option></select></label>
          <label>De<input type="date" value={de} onChange={e => setDe(e.target.value)} /></label>
          <label>Até<input type="date" value={ate} onChange={e => setAte(e.target.value)} /></label>
          <button className="btn" onClick={csv} disabled={!lista.length}>Exportar CSV</button>
          <button className="btn ghost" onClick={() => window.print()}>Imprimir</button>
        </div>
        <p className="muted">{lista.length} demanda{lista.length !== 1 ? 's' : ''} · {totalUn.toLocaleString('pt-BR')} unidades</p>
        <div className="tablewrap">
          <table className="rel">
            <thead><tr>{cols.map(c => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{lista.map(d => <tr key={d.id}>{linha(d).map((v, i) => <td key={i}>{i === 0 ? <Link to={'/d/' + d.id}>#{v}</Link> : v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
