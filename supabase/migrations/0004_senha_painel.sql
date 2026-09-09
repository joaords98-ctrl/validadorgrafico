-- Senha única do painel (links de aprovação continuam abertos)
create table if not exists gr_config (chave text primary key, valor text not null);
alter table gr_config enable row level security;   -- sem policy: ninguém lê pela API
insert into gr_config (chave, valor) values ('senha_painel', 'missao2026') on conflict (chave) do nothing;

create or replace function gr_checar_senha(s text) returns boolean
language sql security definer stable as $$
  select exists (select 1 from gr_config where chave = 'senha_painel' and valor = s);
$$;
grant execute on function gr_checar_senha(text) to anon, authenticated;
