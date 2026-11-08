-- Permissões padrão de cada perfil, editáveis pelo administrador (botão "Salvar" na aba Usuários).
-- Usuários com permissoes = null seguem o padrão do perfil (e acompanham as mudanças salvas).

create table public.perfis_permissoes (
  papel text primary key check (papel in ('vigilante', 'supervisor', 'gestor')),
  permissoes jsonb not null check (jsonb_typeof(permissoes) = 'array'),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users(id) on delete set null
);
alter table public.perfis_permissoes enable row level security;
create policy "todos leem padroes" on public.perfis_permissoes for select to authenticated using (true);
create policy "gestor de usuarios cria padroes" on public.perfis_permissoes for insert to authenticated
  with check (public.tem_permissao('gerenciar_usuarios'));
create policy "gestor de usuarios altera padroes" on public.perfis_permissoes for update to authenticated
  using (public.tem_permissao('gerenciar_usuarios')) with check (public.tem_permissao('gerenciar_usuarios'));
revoke all on public.perfis_permissoes from anon;

-- O padrão passa a vir da tabela (se existir), senão do padrão original do sistema
create or replace function public.permissoes_padrao(p text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select permissoes from public.perfis_permissoes where papel = p),
    case p
      when 'admin'      then '["registrar_visitas","ver_painel","ver_visitas","exportar","imprimir","excluir_visitas","gerenciar_unidades","gerenciar_usuarios"]'::jsonb
      when 'gestor'     then '["ver_painel","ver_visitas","exportar","imprimir"]'::jsonb
      when 'supervisor' then '["registrar_visitas","ver_painel","ver_visitas","exportar","imprimir"]'::jsonb
      else '["registrar_visitas"]'::jsonb
    end)
$$;
