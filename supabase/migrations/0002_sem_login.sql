-- Sem login: cada pessoa só escolhe/digita o nome. Acesso liberado para a chave anon.
alter table gr_perfis drop constraint if exists gr_perfis_id_fkey;
alter table gr_perfis alter column id set default gen_random_uuid();
alter table gr_perfis add constraint gr_perfis_nome_unique unique (nome);
drop trigger if exists gr_on_auth_user_created on auth.users;
drop function if exists gr_novo_perfil();

drop policy if exists gr_equipe_perfis on gr_perfis;
drop policy if exists gr_equipe_candidatos on gr_candidatos;
drop policy if exists gr_equipe_demandas on gr_demandas;
drop policy if exists gr_equipe_arquivos on gr_arquivos;
drop policy if exists gr_equipe_eventos on gr_eventos;
create policy gr_equipe_perfis on gr_perfis for all to anon, authenticated using (true) with check (true);
create policy gr_equipe_candidatos on gr_candidatos for all to anon, authenticated using (true) with check (true);
create policy gr_equipe_demandas on gr_demandas for all to anon, authenticated using (true) with check (true);
create policy gr_equipe_arquivos on gr_arquivos for all to anon, authenticated using (true) with check (true);
create policy gr_equipe_eventos on gr_eventos for all to anon, authenticated using (true) with check (true);

drop policy if exists gr_storage_r on storage.objects;
drop policy if exists gr_storage_w on storage.objects;
drop policy if exists gr_storage_u on storage.objects;
drop policy if exists gr_storage_d on storage.objects;
create policy gr_storage_r on storage.objects for select to anon, authenticated using (bucket_id = 'materiais');
create policy gr_storage_w on storage.objects for insert to anon, authenticated with check (bucket_id = 'materiais');
create policy gr_storage_u on storage.objects for update to anon, authenticated using (bucket_id = 'materiais');
create policy gr_storage_d on storage.objects for delete to anon, authenticated using (bucket_id = 'materiais');
