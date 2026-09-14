insert into gr_config (chave, valor) values ('senha_comite', 'comite2026') on conflict (chave) do nothing;
create or replace function gr_checar_senha(s text) returns text
language sql security definer stable as $$
  select case
    when exists (select 1 from gr_config where chave = 'senha_painel'  and valor = s) then 'equipe'
    when exists (select 1 from gr_config where chave = 'senha_partido' and valor = s) then 'partido'
    when exists (select 1 from gr_config where chave = 'senha_grafica' and valor = s) then 'grafica'
    when exists (select 1 from gr_config where chave = 'senha_comite'  and valor = s) then 'comite'
  end;
$$;
