import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

export const ETAPAS = [
  ['entrada', 'Entrada de demandas'],
  ['arte', 'Desenvolvimento da arte'],
  ['aprovacao', 'Aprovação executiva e política'],
  ['fechamento', 'Envio para produção'],
  ['concluida', 'Concluídas'],
]
export const ORIGENS = { candidato: 'Candidato', partido: 'Partido', flavio: 'Flávio' }
export const PECAS = ['Santinho', 'Adesivo', 'Cartaz', 'Banner', 'Panfleto', 'Flyer', 'Faixa', 'Outro']

export async function registrar(demanda_id, tipo, detalhe, por) {
  await supabase.from('eventos').insert({ demanda_id, tipo, detalhe, por })
}
export const dataBR = d => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
export const horaBR = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'
