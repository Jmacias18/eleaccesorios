-- ==========================================================
-- Ele Accesorios: tabla equipos + RLS + Storage
-- Pegar completo en Supabase → SQL Editor → Run.
-- Se puede volver a ejecutar sin romper nada.
--
-- ANTES DE EJECUTAR:
--   1. Authentication → Sign In / Providers → desactiva "Allow new users to sign up".
--   2. Authentication → Users → "Add user" → crea tu usuario (correo + contraseña,
--      marca "Auto Confirm User").
--   3. Copia el UID de ese usuario y pégalo abajo, en es_admin().
-- ==========================================================

-- ---------- Quién es el administrador ----------
-- Un solo lugar para cambiar el UID. Las políticas de la tabla y del bucket lo usan.
create or replace function public.es_admin()
returns boolean
language sql
stable
as $$
  select auth.uid() = '0a58c59f-b1ee-4279-b3d2-d4fc520d5cbc'::uuid
$$;

-- ---------- Tabla ----------
create table if not exists public.equipos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null check (length(trim(nombre)) > 0),
  seccion     text not null default 'mujer'
              check (seccion in ('mujer','hombre','accesorios')),
  categoria   text not null default 'otros'
              check (categoria in ('relojes','aretes','arracadas','collares','pulseras','brazaletes',
                                   'brazaletes-italianos','anillos','charms','bolsas','llaveros','otros')),
  descripcion text,
  precio      numeric(10,2) check (precio is null or precio >= 0),  -- null = "Consultar precio"
  desde       boolean not null default false,                       -- muestra "desde $X"
  condicion   text check (condicion is null or condicion in ('nuevo','seminuevo','usado')),
  estado      text not null default 'disponible'
              check (estado in ('disponible','apartado','vendido')),
  foto_url    text,                                                 -- null = icono por defecto
  creado_en   timestamptz not null default now()
);

create index if not exists equipos_creado_en_idx on public.equipos (creado_en desc);

-- ---------- Row Level Security ----------
alter table public.equipos enable row level security;

grant select on public.equipos to anon, authenticated;
grant insert, update, delete on public.equipos to authenticated;

drop policy if exists "Público ve equipos no vendidos" on public.equipos;
create policy "Público ve equipos no vendidos"
  on public.equipos for select
  to anon, authenticated
  using (estado <> 'vendido');

drop policy if exists "Admin ve todos" on public.equipos;
create policy "Admin ve todos"
  on public.equipos for select
  to authenticated
  using (public.es_admin());

drop policy if exists "Admin inserta" on public.equipos;
create policy "Admin inserta"
  on public.equipos for insert
  to authenticated
  with check (public.es_admin());

drop policy if exists "Admin edita" on public.equipos;
create policy "Admin edita"
  on public.equipos for update
  to authenticated
  using (public.es_admin())
  with check (public.es_admin());

drop policy if exists "Admin elimina" on public.equipos;
create policy "Admin elimina"
  on public.equipos for delete
  to authenticated
  using (public.es_admin());

-- ---------- Storage: bucket de fotos ----------
-- Público para lectura (las fotos se ven en la tienda), máx. 2 MB, solo imágenes.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('equipos', 'equipos', true, 2097152, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sin SELECT, Storage no encuentra el archivo y remove() no borra nada (sin dar error).
drop policy if exists "Admin ve fotos" on storage.objects;
create policy "Admin ve fotos"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'equipos' and public.es_admin());

drop policy if exists "Admin sube fotos" on storage.objects;
create policy "Admin sube fotos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'equipos' and public.es_admin());

drop policy if exists "Admin actualiza fotos" on storage.objects;
create policy "Admin actualiza fotos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'equipos' and public.es_admin());

drop policy if exists "Admin borra fotos" on storage.objects;
create policy "Admin borra fotos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'equipos' and public.es_admin());
