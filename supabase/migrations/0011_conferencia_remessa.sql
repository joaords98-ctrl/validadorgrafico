alter type gr_etapa add value if not exists 'conferencia' before 'concluida';
alter table gr_demandas
  add column if not exists conferido_por text, add column if not exists conferido_em timestamptz, add column if not exists conferido_obs text,
  add column if not exists retirado_por text, add column if not exists retirado_em timestamptz, add column if not exists retirado_obs text;
