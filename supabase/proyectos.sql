-- ==========================================================
-- Ele Accesorios: portafolio de proyectos (sección opcional del panel)
-- Pegar completo en Supabase → SQL Editor → Run.
-- Requiere schema.sql (usa public.es_admin() y el bucket "equipos").
-- Se puede volver a ejecutar sin romper nada.
-- ==========================================================

create table if not exists public.proyectos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) > 0),
  tipo        text not null default 'web'
              check (tipo in ('web','tienda','sistema')),
  descripcion text,
  url         text check (url is null or url ~* '^https://'),  -- se abre dentro de la página; null = solo captura
  imagen_url  text,                                            -- captura de portada (bucket equipos/proyectos/)
  orden       integer not null default 0,                      -- menor = aparece primero
  publicado   boolean not null default true,
  creado_en   timestamptz not null default now()
);

create index if not exists proyectos_orden_idx on public.proyectos (orden, creado_en);

alter table public.proyectos enable row level security;

grant select on public.proyectos to anon, authenticated;
grant insert, update, delete on public.proyectos to authenticated;

drop policy if exists "Público ve proyectos publicados" on public.proyectos;
create policy "Público ve proyectos publicados"
  on public.proyectos for select
  to anon, authenticated
  using (publicado);

drop policy if exists "Admin ve todos los proyectos" on public.proyectos;
create policy "Admin ve todos los proyectos"
  on public.proyectos for select
  to authenticated
  using (public.es_admin());

drop policy if exists "Admin inserta proyectos" on public.proyectos;
create policy "Admin inserta proyectos"
  on public.proyectos for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "Admin edita proyectos" on public.proyectos;
create policy "Admin edita proyectos"
  on public.proyectos for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "Admin elimina proyectos" on public.proyectos;
create policy "Admin elimina proyectos"
  on public.proyectos for delete
  to authenticated
  using (public.es_admin());

-- ---------- Pendiente del paso 3: permiso para borrar fotos viejas ----------
-- Sin SELECT, Storage no encuentra el archivo y remove() no borra nada (sin dar error).
drop policy if exists "Admin ve fotos" on storage.objects;
create policy "Admin ve fotos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'equipos' and public.es_admin());

-- ---------- Galería de capturas (también en galeria.sql) ----------
alter table public.proyectos
  add column if not exists galeria text[] not null default '{}';
