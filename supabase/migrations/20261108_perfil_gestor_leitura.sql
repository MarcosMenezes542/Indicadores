-- Perfil "gestor": visualiza todas as visitas e fotos, mas não cria, altera nem exclui nada.

-- 1) Novo papel permitido
alter table public.perfis drop constraint perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('admin', 'vigilante', 'gestor'));

-- 2) Funções auxiliares
create or replace function public.pode_ver_tudo()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfis where id = auth.uid() and papel in ('admin', 'gestor') and ativo)
$$;

create or replace function public.somente_leitura()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.perfis where id = auth.uid() and papel = 'gestor')
$$;

revoke execute on function public.pode_ver_tudo() from anon;
revoke execute on function public.somente_leitura() from anon;

-- 3) Leitura: admin e gestor veem todas as visitas; o VMO vê só as próprias
drop policy "ver visitas" on public.visitas;
create policy "ver visitas" on public.visitas for select to authenticated
  using (autor = auth.uid() or public.pode_ver_tudo());

-- 4) Escrita: o gestor não pode registrar visitas
drop policy "vigilante envia visita" on public.visitas;
create policy "vigilante envia visita" on public.visitas for insert to authenticated
  with check (autor = auth.uid() and public.is_ativo() and not public.somente_leitura());

-- 5) Fotos: gestor pode ver; não pode enviar
create policy "leitor le fotos" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.pode_ver_tudo());

alter policy "somente logados ativos enviam fotos" on storage.objects
  with check ((bucket_id <> 'fotos') or (((storage.foldername(name))[1] = (auth.uid())::text) and public.is_ativo() and not public.somente_leitura()));

-- 6) Criação de usuários aceita o novo papel
create or replace function public.novo_usuario()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  d text := 'vigilancia.local';
  lg text := case when new.email like '%@'||d then split_part(new.email,'@',1) else new.email end;
  p text := new.raw_app_meta_data->>'papel';
begin
  insert into public.perfis(id, nome, login, papel, ativo)
  values (new.id, coalesce(nullif(new.raw_app_meta_data->>'nome',''), lg), lg,
          case when p in ('admin','vigilante','gestor') then p else 'vigilante' end,
          coalesce(p in ('admin','vigilante','gestor'), false));
  return new;
end $function$;
