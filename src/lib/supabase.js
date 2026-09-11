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
export const ETAPAS_GRAFICA = [
  ['grafica_recebeu', 'Arquivo recebido', 'confirmou recebimento do arquivo'],
  ['grafica_producao', 'Em produção', 'iniciou a produção'],
  ['grafica_expedicao', 'Expedição', 'material pronto, em expedição'],
  ['grafica_transporte', 'Em transporte', 'material saiu para entrega'],
  ['grafica_entregou', 'Entregue', 'material entregue'],
]
export const ORIGENS = { candidato: 'Candidato', partido: 'Partido', flavio: 'Coordenação' }

export async function registrar(demanda_id, tipo, detalhe, por) {
  await supabase.from('gr_eventos').insert({ demanda_id, tipo, detalhe, por })
}
export const dataBR = d => d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'
export const horaBR = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'
