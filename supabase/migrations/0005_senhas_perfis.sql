-- Três senhas: equipe (painel completo), partido (aprovações) e gráfica (arquivos finais)
insert into gr_config (chave, valor) values ('senha_partido', 'partido2026'), ('senha_grafica', 'grafica2026') on conflict (chave) do nothing;
drop function if exists gr_checar_senha(text);
create or replace function gr_checar_senha(s text) returns text
language sql security definer stable as $$
  select case
    when exists (select 1 from gr_config where chave = 'senha_painel'  and valor = s) then 'equipe'
    when exists (select 1 from gr_config where chave = 'senha_partido' and valor = s) then 'partido'
    when exists (select 1 from gr_config where chave = 'senha_grafica' and valor = s) then 'grafica'
  end;
$$;
grant execute on function gr_checar_senha(text) to anon, authenticated;
