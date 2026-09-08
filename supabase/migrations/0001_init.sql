-- Fluxo de materiais impressos — Missão Paraná
-- Etapas seguem o diagrama: entrada → arte → validacao (automática) → aprovacao → fechamento → concluida

create type etapa as enum ('entrada','arte','aprovacao','fechamento','concluida');
create type papel as enum ('coordenacao','designer');

-- Perfil de quem usa o sistema (Flávio = coordenacao, demais = designer)
create table perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  papel papel not null default 'designer',
  criado_em timestamptz default now()
);

create table candidatos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cargo text,            -- 'deputado estadual' | 'deputado federal' | 'partido'
  numero text,
  telefone text,
  ativo boolean default true
);

create table demandas (
  id uuid primary key default gen_random_uuid(),
  numero serial,
  titulo text not null,
  candidato_id uuid references candidatos(id),
  origem text not null check (origem in ('candidato','partido','flavio')),
  peca text not null,                      -- santinho, adesivo, cartaz, banner…
  largura_mm numeric, altura_mm numeric,
  quantidade integer,
  prazo date,
  briefing text,
  etapa etapa not null default 'entrada',
  designer_id uuid references perfis(id),
  aprov_coordenacao boolean default false,
  aprov_candidato boolean default false,
  grafica text,
  enviado_grafica_em timestamptz,
  criado_por uuid references perfis(id),
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

-- Cada upload de PDF é uma versão; guarda o relatório da validação e a prova
create table arquivos (
  id uuid primary key default gen_random_uuid(),
  demanda_id uuid not null references demandas(id) on delete cascade,
  versao integer not null,
  path text not null,            -- storage: materiais/<demanda>/v<versao>.pdf
  prova_path text,               -- storage: materiais/<demanda>/v<versao>-prova.png
  relatorio jsonb,
  resultado text check (resultado in ('aprovado','ressalvas','reprovado')),
  final boolean default false,   -- PDF/X-1a enviado à gráfica
  enviado_por uuid references perfis(id),
  criado_em timestamptz default now(),
  unique (demanda_id, versao)
);

-- Linha do tempo: tudo que aconteceu com a demanda
create table eventos (
  id bigserial primary key,
  demanda_id uuid not null references demandas(id) on delete cascade,
  tipo text not null,            -- criada, assumida, upload, validacao, aprovacao, ajustes, fechamento…
  detalhe text,
  por uuid references perfis(id),
  em timestamptz default now()
);

create index on demandas (etapa);
create index on eventos (demanda_id, em desc);

create or replace function touch_atualizado() returns trigger language plpgsql as $$
begin new.atualizado_em = now(); return new; end $$;
create trigger demandas_touch before update on demandas for each row execute function touch_atualizado();

-- Cria o perfil automaticamente ao cadastrar usuário no Auth
create or replace function novo_perfil() returns trigger language plpgsql security definer as $$
begin
  insert into perfis (id, nome) values (new.id, coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function novo_perfil();

-- RLS: app interno, todo usuário autenticado vê e edita tudo
alter table perfis enable row level security;
alter table candidatos enable row level security;
alter table demandas enable row level security;
alter table arquivos enable row level security;
alter table eventos enable row level security;
create policy equipe_perfis on perfis for all to authenticated using (true) with check (true);
create policy equipe_candidatos on candidatos for all to authenticated using (true) with check (true);
create policy equipe_demandas on demandas for all to authenticated using (true) with check (true);
create policy equipe_arquivos on arquivos for all to authenticated using (true) with check (true);
create policy equipe_eventos on eventos for all to authenticated using (true) with check (true);

-- Storage privado para PDFs e provas
insert into storage.buckets (id, name, public) values ('materiais','materiais', false)
  on conflict (id) do nothing;
create policy equipe_storage_r on storage.objects for select to authenticated using (bucket_id = 'materiais');
create policy equipe_storage_w on storage.objects for insert to authenticated with check (bucket_id = 'materiais');
create policy equipe_storage_u on storage.objects for update to authenticated using (bucket_id = 'materiais');
create policy equipe_storage_d on storage.objects for delete to authenticated using (bucket_id = 'materiais');
