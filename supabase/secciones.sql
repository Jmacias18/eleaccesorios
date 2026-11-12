-- ==========================================================
-- Migración: secciones (Mujer / Hombre / Accesorios) + subcategorías del manual.
-- Ejecutar UNA vez en Supabase → SQL Editor → Run, DESPUÉS de haber corrido schema.sql.
-- Es seguro volver a ejecutarlo.
--
-- Antes de ejecutar, revisa el paso de "otros" más abajo.
-- ==========================================================

-- 1. Columna de sección. Las piezas existentes quedan en "mujer" por defecto.
alter table public.equipos
  add column if not exists seccion text not null default 'mujer';

-- 2. Reemplazar el CHECK viejo de categoría por el nuevo (subcategorías del manual).
alter table public.equipos drop constraint if exists equipos_categoria_check;
alter table public.equipos
  add constraint equipos_categoria_check
  check (categoria in ('relojes','aretes','arracadas','collares','pulseras','brazaletes',
                       'brazaletes-italianos','anillos','charms','bolsas','llaveros','otros'));

alter table public.equipos drop constraint if exists equipos_seccion_check;
alter table public.equipos
  add constraint equipos_seccion_check
  check (seccion in ('mujer','hombre','accesorios'));

-- 3. Piezas que estaban en "otros": el manual no tiene esa categoría.
--    Se pasan a Accesorios > Otros. Si alguna pertenece a otra sección,
--    corrígela desde el panel después de la migración.
update public.equipos
  set seccion = 'accesorios', categoria = 'otros'
  where categoria = 'otros';

-- Las demás (relojes, aretes, collares, pulseras, anillos) quedan en "mujer",
-- que es donde el manual las pone. Revisa en el panel si alguna es de hombre.
