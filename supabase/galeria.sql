-- ==========================================================
-- Ele Accesorios: galería de capturas por proyecto
-- Para proyectos con inicio de sesión:
-- capturas de adentro que el visitante puede ver sin entrar.
-- Pegar completo en Supabase → SQL Editor → Run. Se puede repetir.
-- Requiere proyectos.sql.
-- ==========================================================

alter table public.proyectos
  add column if not exists galeria text[] not null default '{}';  -- URLs en orden (bucket equipos/proyectos/)
