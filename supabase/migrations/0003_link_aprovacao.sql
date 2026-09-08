-- Link público de aprovação por demanda (sem cadastro para Flávio e candidatos)
alter table gr_demandas add column if not exists token text unique default encode(gen_random_bytes(9), 'base64');
update gr_demandas set token = encode(gen_random_bytes(9), 'base64') where token is null;
-- tokens sem caracteres ruins para URL
update gr_demandas set token = translate(token, '+/=', 'xyz');
alter table gr_demandas alter column token set default translate(encode(gen_random_bytes(9), 'base64'), '+/=', 'xyz');
