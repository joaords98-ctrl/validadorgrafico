import { createClient } from '@supabase/supabase-js'
const URL = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const configOk = !!(URL && KEY)
export const supabase = configOk ? createClient(URL, KEY) : null

export const ETAPAS = [
  ['entrada', 'Entrada de demandas'],
  ['arte', 'Desenvolvimento da arte'],
  ['aprovacao', 'Aprovação executiva e política'],
  ['fechamento', 'Envio para produção'],
  ['concluida', 'Concluídas'],
]
export const ORIGENS = { candidato: 'Candidato', partido: 'Partido', flavio: 'Coordenação' }
export const PECAS = ['Santinho', 'Adesivo', 'Cartaz', 'Banner', 'Panfleto', 'Flyer', 'Faixa', 'Outro']

export async function registrar(demanda_id, tipo, detalhe, por) {
  await supabase.from('gr_eventos').insert({ demanda_id, tipo, detalhe, por })
}
export const dataBR = d => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
export const horaBR = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'
