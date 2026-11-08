-- Permissões por usuário (configuráveis pelo administrador na tela de cadastro).
-- Se "permissoes" for nulo, valem as permissões padrão do perfil (papel).
-- O papel "admin" sempre tem todas as permissões (evita perder o acesso ao sistema).

alter table public.perfis add column if not exists permissoes jsonb;
alter table public.perfis add constraint perfis_permissoes_array check (permissoes is null or jsonb_typeof(permissoes) = 'array');

create function public.permissoes_padrao(p text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p
    when 'admin'  then '["registrar_visitas","ver_painel","ver_visitas","exportar","imprimir","excluir_visitas","gerenciar_unidades","gerenciar_usuarios"]'::jsonb
    when 'gestor' then '["ver_painel","ver_visitas","exportar","imprimir"]'::jsonb
    else '["registrar_visitas"]'::jsonb
  end
$$;

create function public.tem_permissao(p text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.perfis
    where id = auth.uid() and ativo
      and (papel = 'admin' or coalesce(permissoes, public.permissoes_padrao(papel)) ? p))
$$;
revoke execute on function public.tem_permissao(text) from anon;

-- Ver todas as visitas e fotos: quem pode ver o painel ou a lista de visitas
create or replace function public.pode_ver_tudo() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tem_permissao('ver_painel') or public.tem_permissao('ver_visitas')
$$;

-- Regras de gravação conforme as permissões
alter policy "vigilante envia visita" on public.visitas
  with check (autor = auth.uid() and public.tem_permissao('registrar_visitas'));
alter policy "admin apaga visitas" on public.visitas
  using (public.tem_permissao('excluir_visitas'));
alter policy "gestor insere unidades" on public.unidades
  with check (public.tem_permissao('gerenciar_unidades'));
alter policy "gestor altera unidades" on public.unidades
  using (public.tem_permissao('gerenciar_unidades')) with check (public.tem_permissao('gerenciar_unidades'));
alter policy "gestor apaga unidades" on public.unidades
  using (public.tem_permissao('gerenciar_unidades'));
alter policy "ver perfis" on public.perfis
  using (id = auth.uid() or public.tem_permissao('gerenciar_usuarios'));
alter policy "gestor apaga fotos" on storage.objects
  using (bucket_id = 'fotos' and public.tem_permissao('excluir_visitas'));
alter policy "somente logados ativos enviam fotos" on storage.objects
  with check ((bucket_id <> 'fotos') or (((storage.foldername(name))[1] = (auth.uid())::text) and public.tem_permissao('registrar_visitas')));
