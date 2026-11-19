-- ==========================================================
-- Migración: ubicaciones (Casa + colectivos), existencia por ubicación y traspasos.
-- Ejecutar en Supabase → SQL Editor → Run, DESPUÉS de inventario.sql.
-- Es seguro volver a ejecutarlo. No toca fotos, precios ni nombres.
--
-- Qué hace:
--   1. Tabla ubicaciones: Casa y los colectivos, con dirección, comisión % y renta mensual.
--   2. Tabla existencias: cuántas piezas hay de cada producto en cada ubicación.
--      equipos.existencia sigue siendo el total (la suma) y la base lo mantiene sola.
--   3. Movimientos con ubicación; nuevo tipo "traspaso" (de una ubicación a otra).
--      Las ventas guardan la comisión del colectivo al momento de vender.
--   4. La tienda puede leer en qué colectivos hay stock (disponible_en), nunca cantidades.
--   5. Lo que ya existe se queda en "Casa".
--   6. Cierra el permiso que dejaba a la tienda leer existencia y costo.
-- ==========================================================

-- ---------- 1. Ubicaciones ----------
create table if not exists public.ubicaciones (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null check (length(trim(nombre)) > 0),
  direccion     text,
  tipo          text not null default 'colectivo' check (tipo in ('casa','colectivo')),
  comision_pct  numeric(5,2) not null default 0 check (comision_pct >= 0 and comision_pct <= 100),
  renta_mensual numeric(10,2) not null default 0 check (renta_mensual >= 0),
  publica       boolean not null default true,   -- la tienda dice "Encuéntrala en …"
  activa        boolean not null default true,
  orden         integer not null default 0,
  creado_en     timestamptz not null default now()
);
create unique index if not exists ubicaciones_nombre_uidx on public.ubicaciones (lower(nombre));

insert into public.ubicaciones (nombre, direccion, tipo, publica, orden) values
  ('Casa', null, 'casa', false, 0),
  ('Koy Colectivo', 'Callejón Ley de Alfabetización, entre calles 12 y 13', 'colectivo', true, 1),
  ('Mini Colectivo Melisa Rivera', 'Entre Callejón Zacatecas y Av. Quintana Roo, calle 34', 'colectivo', true, 2),
  ('Esmeralda Colectivo', 'Av. 20 de Noviembre y calle 22', 'colectivo', true, 3)
on conflict do nothing;

-- La ubicación "casa" (la primera) es la de siempre por defecto
create or replace function public.ubicacion_casa()
returns uuid
language sql
stable
set search_path = public
as $$
  select id from public.ubicaciones where tipo = 'casa' order by orden, creado_en limit 1
$$;

-- ---------- 2. Existencias por ubicación ----------
create table if not exists public.existencias (
  equipo_id    uuid not null references public.equipos(id) on delete cascade,
  ubicacion_id uuid not null references public.ubicaciones(id) on delete restrict,
  cantidad     integer not null default 0 check (cantidad >= 0),
  primary key (equipo_id, ubicacion_id)
);

-- En qué ubicaciones públicas hay stock (para la tienda; sin cantidades)
alter table public.equipos add column if not exists disponible_en uuid[] not null default '{}';

-- Recalcula el total y disponible_en de una pieza a partir de existencias
create or replace function public.equipo_recalcular(p_equipo uuid)
returns void
language sql
set search_path = public
as $$
  update public.equipos e
     set existencia = coalesce((select sum(x.cantidad) from public.existencias x where x.equipo_id = e.id), 0),
         disponible_en = coalesce((
           select array_agg(x.ubicacion_id order by u.orden)
             from public.existencias x join public.ubicaciones u on u.id = x.ubicacion_id
            where x.equipo_id = e.id and x.cantidad > 0 and u.publica and u.activa), '{}')
   where e.id = p_equipo;
$$;

-- Suma (o resta) piezas en una ubicación; falla si quedaría negativa
create or replace function public.existencia_mover(p_equipo uuid, p_ubic uuid, p_delta integer, p_etiqueta text)
returns void
language plpgsql
set search_path = public
as $$
declare
  actual integer;
begin
  insert into public.existencias (equipo_id, ubicacion_id, cantidad) values (p_equipo, p_ubic, 0)
  on conflict do nothing;
  select cantidad into actual from public.existencias
   where equipo_id = p_equipo and ubicacion_id = p_ubic for update;
  if actual + p_delta < 0 then
    raise exception 'Solo hay % pieza(s) de % en %.', actual, p_etiqueta,
      (select nombre from public.ubicaciones where id = p_ubic)
      using errcode = 'check_violation';
  end if;
  update public.existencias set cantidad = cantidad + p_delta
   where equipo_id = p_equipo and ubicacion_id = p_ubic;
end;
$$;

-- ---------- 3. Movimientos con ubicación y traspasos ----------
alter table public.movimientos add column if not exists ubicacion_id uuid references public.ubicaciones(id) on delete set null;
alter table public.movimientos add column if not exists destino_id   uuid references public.ubicaciones(id) on delete set null;
alter table public.movimientos add column if not exists ubicacion    text;  -- copia del nombre
alter table public.movimientos add column if not exists destino      text;  -- copia del nombre (traspasos)
alter table public.movimientos add column if not exists comision_unitaria numeric(10,2) check (comision_unitaria is null or comision_unitaria >= 0);

alter table public.movimientos drop constraint if exists movimientos_tipo_check;
alter table public.movimientos add constraint movimientos_tipo_check check (tipo in ('alta','baja','traspaso'));
alter table public.movimientos drop constraint if exists movimientos_motivo_check;
alter table public.movimientos add constraint movimientos_motivo_check
  check (motivo in ('inicial','compra','devolucion','venta','merma','ajuste','traspaso'));
alter table public.movimientos drop constraint if exists movimientos_motivo_tipo;
alter table public.movimientos add constraint movimientos_motivo_tipo check (
  (tipo = 'alta' and motivo in ('inicial','compra','devolucion','ajuste')) or
  (tipo = 'baja' and motivo in ('venta','merma','ajuste')) or
  (tipo = 'traspaso' and motivo = 'traspaso')
);

create index if not exists movimientos_ubicacion_idx on public.movimientos (ubicacion_id);

-- Al registrar: copia datos, valida y mueve existencias por ubicación
create or replace function public.movimiento_registrar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p public.equipos%rowtype;
  u public.ubicaciones%rowtype;
  etiqueta text;
begin
  select * into p from public.equipos where id = new.equipo_id for update;
  if not found then
    raise exception 'La pieza no existe.';
  end if;
  etiqueta := coalesce(p.codigo, p.nombre);

  new.ubicacion_id := coalesce(new.ubicacion_id, public.ubicacion_casa());
  select * into u from public.ubicaciones where id = new.ubicacion_id;
  if not found then
    raise exception 'La ubicación no existe.';
  end if;

  new.codigo    := p.codigo;
  new.nombre    := p.nombre;
  new.seccion   := p.seccion;
  new.categoria := p.categoria;
  new.ubicacion := u.nombre;
  new.costo_unitario := coalesce(new.costo_unitario, p.costo);

  if new.tipo = 'alta' then
    perform public.existencia_mover(p.id, new.ubicacion_id, new.cantidad, etiqueta);
    new.destino_id := null;
  elsif new.tipo = 'baja' then
    perform public.existencia_mover(p.id, new.ubicacion_id, -new.cantidad, etiqueta);
    new.destino_id := null;
    -- La comisión se guarda al vender: si después cambia el %, el historial no se mueve
    if new.motivo = 'venta' and new.precio_unitario is not null and u.comision_pct > 0 then
      new.comision_unitaria := round(new.precio_unitario * u.comision_pct / 100, 2);
    end if;
  else
    if new.destino_id is null or new.destino_id = new.ubicacion_id then
      raise exception 'Elige a dónde se lleva la mercancía (otra ubicación).';
    end if;
    perform public.existencia_mover(p.id, new.ubicacion_id, -new.cantidad, etiqueta);
    perform public.existencia_mover(p.id, new.destino_id, new.cantidad, etiqueta);
    new.destino := (select nombre from public.ubicaciones where id = new.destino_id);
  end if;

  if new.motivo = 'compra' and new.costo_unitario is not null then
    update public.equipos set costo = new.costo_unitario where id = p.id;
  end if;
  perform public.equipo_recalcular(p.id);
  return new;
end;
$$;

-- Al borrar un movimiento: se deshace su efecto (si la existencia lo permite)
create or replace function public.movimiento_deshacer()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  etiqueta text := coalesce(old.codigo, old.nombre, 'la pieza');
  ubic uuid := coalesce(old.ubicacion_id, public.ubicacion_casa());
begin
  if old.equipo_id is null or not exists (select 1 from public.equipos where id = old.equipo_id) then
    return old;
  end if;
  perform 1 from public.equipos where id = old.equipo_id for update;
  if old.tipo = 'alta' then
    perform public.existencia_mover(old.equipo_id, ubic, -old.cantidad, etiqueta);
  elsif old.tipo = 'baja' then
    perform public.existencia_mover(old.equipo_id, ubic, old.cantidad, etiqueta);
  elsif old.destino_id is not null then
    perform public.existencia_mover(old.equipo_id, old.destino_id, -old.cantidad, etiqueta);
    perform public.existencia_mover(old.equipo_id, ubic, old.cantidad, etiqueta);
  end if;
  perform public.equipo_recalcular(old.equipo_id);
  return old;
end;
$$;

-- Si se cambia una ubicación (nombre, pública, activa), se recalcula disponible_en de sus piezas
create or replace function public.ubicacion_cambio()
returns trigger
language plpgsql
set search_path = public
as $$
declare r record;
begin
  for r in select distinct equipo_id from public.existencias where ubicacion_id = new.id loop
    perform public.equipo_recalcular(r.equipo_id);
  end loop;
  return new;
end;
$$;
drop trigger if exists ubicaciones_cambio on public.ubicaciones;
create trigger ubicaciones_cambio
  after update of publica, activa, orden on public.ubicaciones
  for each row execute function public.ubicacion_cambio();

-- ---------- 4. Lo que ya existe queda en Casa ----------
update public.movimientos
   set ubicacion_id = public.ubicacion_casa(), ubicacion = 'Casa'
 where ubicacion_id is null;

insert into public.existencias (equipo_id, ubicacion_id, cantidad)
select e.id, public.ubicacion_casa(), e.existencia
  from public.equipos e
 where e.existencia > 0
   and not exists (select 1 from public.existencias x where x.equipo_id = e.id);

-- ---------- 5. Permisos ----------
alter table public.ubicaciones enable row level security;
alter table public.existencias enable row level security;

-- Tienda (anon): solo columnas públicas. Se quita TODO y se vuelve a dar por columna.
revoke all on table public.equipos from anon;
revoke all on table public.equipos from public;
revoke select (existencia, costo, precio_mayoreo, inv_minimo) on public.equipos from anon, public;
grant select (id, nombre, codigo, seccion, categoria, descripcion, precio, desde, condicion,
              estado, foto_url, creado_en, en_stock, disponible_en)
  on public.equipos to anon;

revoke all on table public.ubicaciones from anon;
revoke all on table public.ubicaciones from public;
grant select (id, nombre, direccion, tipo, publica, activa, orden) on public.ubicaciones to anon;
grant select, insert, update, delete on public.ubicaciones to authenticated;

revoke all on table public.existencias from anon;
revoke all on table public.existencias from public;
grant select on public.existencias to authenticated;   -- solo la base las cambia (triggers)

drop policy if exists "Público ve ubicaciones" on public.ubicaciones;
create policy "Público ve ubicaciones" on public.ubicaciones for select
  to anon, authenticated using (publica and activa);
drop policy if exists "Admin ve ubicaciones" on public.ubicaciones;
create policy "Admin ve ubicaciones" on public.ubicaciones for select
  to authenticated using (public.es_admin());
drop policy if exists "Admin crea ubicaciones" on public.ubicaciones;
create policy "Admin crea ubicaciones" on public.ubicaciones for insert
  to authenticated with check (public.es_admin());
drop policy if exists "Admin edita ubicaciones" on public.ubicaciones;
create policy "Admin edita ubicaciones" on public.ubicaciones for update
  to authenticated using (public.es_admin()) with check (public.es_admin());
drop policy if exists "Admin borra ubicaciones" on public.ubicaciones;
create policy "Admin borra ubicaciones" on public.ubicaciones for delete
  to authenticated using (public.es_admin());

drop policy if exists "Admin ve existencias" on public.existencias;
create policy "Admin ve existencias" on public.existencias for select
  to authenticated using (public.es_admin());

-- Las funciones que escriben existencias corren con permisos del dueño de la tabla
-- (el panel no puede escribir existencias directo, solo a través de movimientos).
alter function public.existencia_mover(uuid, uuid, integer, text) security definer;
alter function public.equipo_recalcular(uuid) security definer;
-- La tienda no puede ejecutarlas; el panel sí (las usan los triggers de movimientos).
revoke execute on function public.existencia_mover(uuid, uuid, integer, text) from public, anon;
revoke execute on function public.equipo_recalcular(uuid) from public, anon;
grant execute on function public.existencia_mover(uuid, uuid, integer, text) to authenticated;
grant execute on function public.equipo_recalcular(uuid) to authenticated;
