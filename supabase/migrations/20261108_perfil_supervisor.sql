-- Novo perfil "supervisor" (permissões ajustáveis pelo administrador).
alter table public.perfis drop constraint perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('admin', 'vigilante', 'gestor', 'supervisor'));

create or replace function public.permissoes_padrao(p text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p
    when 'admin'      then '["registrar_visitas","ver_painel","ver_visitas","exportar","imprimir","excluir_visitas","gerenciar_unidades","gerenciar_usuarios"]'::jsonb
    when 'gestor'     then '["ver_painel","ver_visitas","exportar","imprimir"]'::jsonb
    when 'supervisor' then '["registrar_visitas","ver_painel","ver_visitas","exportar","imprimir"]'::jsonb
    else '["registrar_visitas"]'::jsonb
  end
$$;

-- novo_usuario(): passa a aceitar 'supervisor' (mesmo corpo da versão anterior, com o novo papel)
