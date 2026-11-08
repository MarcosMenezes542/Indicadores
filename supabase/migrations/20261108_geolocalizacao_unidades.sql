-- Geolocalização das visitas (dupla verificação) e coordenadas das unidades.

-- Posição registrada pelo celular do VMO: {lat, lng, precisao, em, distancia_m} ou {erro, em}
alter table public.visitas
  add column if not exists geo_chegada jsonb,
  add column if not exists geo_saida jsonb;
alter table public.visitas
  add constraint visitas_geo_chegada_obj check (geo_chegada is null or jsonb_typeof(geo_chegada) = 'object'),
  add constraint visitas_geo_saida_obj check (geo_saida is null or jsonb_typeof(geo_saida) = 'object');

-- Coordenadas de referência de cada unidade
alter table public.unidades
  add column if not exists latitude double precision check (latitude between -90 and 90),
  add column if not exists longitude double precision check (longitude between -180 and 180);

-- O administrador pode editar as coordenadas das unidades
create policy "gestor altera unidades" on public.unidades for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
