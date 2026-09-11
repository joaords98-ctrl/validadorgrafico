-- CNPJ contratante pode ser outro (ex.: governador Luiz França em materiais de coligação)
alter table gr_demandas add column if not exists contratante_id uuid references gr_candidatos(id);
