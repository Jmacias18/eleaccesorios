-- ==========================================================
-- Migración: inventario (código, existencia, costo) + movimientos (altas y bajas).
-- Ejecutar UNA vez en Supabase → SQL Editor → Run, DESPUÉS de schema.sql y secciones.sql.
-- Es seguro volver a ejecutarlo (las existencias iniciales solo se cargan una vez).
--
-- Qué hace:
--   1. Agrega a cada pieza: codigo, existencia, costo, precio_mayoreo, inv_minimo y en_stock.
--   2. Crea la tabla movimientos. Cada alta suma y cada baja resta la existencia (lo hace la base,
--      no el navegador), y no deja que quede en negativo.
--   3. La tienda (anon) solo puede leer en_stock (sí/no): nunca la cantidad ni el costo.
--   4. Separa el código del nombre ("Collar C80" → nombre "Collar", codigo "C80")
--      y carga las existencias de ele.xlsx como movimiento "inicial".
-- ==========================================================

-- ---------- 1. Columnas nuevas en equipos ----------
alter table public.equipos add column if not exists codigo         text;
alter table public.equipos add column if not exists existencia     integer not null default 0;
alter table public.equipos add column if not exists costo          numeric(10,2);
alter table public.equipos add column if not exists precio_mayoreo numeric(10,2);
alter table public.equipos add column if not exists inv_minimo     integer not null default 0;
alter table public.equipos add column if not exists en_stock       boolean generated always as (existencia > 0) stored;

alter table public.equipos drop constraint if exists equipos_existencia_check;
alter table public.equipos add constraint equipos_existencia_check check (existencia >= 0);
alter table public.equipos drop constraint if exists equipos_costo_check;
alter table public.equipos add constraint equipos_costo_check check (costo is null or costo >= 0);
alter table public.equipos drop constraint if exists equipos_mayoreo_check;
alter table public.equipos add constraint equipos_mayoreo_check check (precio_mayoreo is null or precio_mayoreo >= 0);
alter table public.equipos drop constraint if exists equipos_minimo_check;
alter table public.equipos add constraint equipos_minimo_check check (inv_minimo >= 0);

-- Código único (sin distinguir mayúsculas); puede quedar vacío.
create unique index if not exists equipos_codigo_uidx on public.equipos (upper(codigo)) where codigo is not null;

-- ---------- 2. La tienda no ve cantidades ni costos ----------
-- Permisos por columna: anon solo lee lo que muestra la tienda. El panel (authenticated) ve todo.
revoke select on public.equipos from anon;
grant select (id, nombre, codigo, seccion, categoria, descripcion, precio, desde, condicion,
              estado, foto_url, creado_en, en_stock)
  on public.equipos to anon;

-- ---------- 3. Movimientos ----------
create table if not exists public.movimientos (
  id              uuid primary key default gen_random_uuid(),
  equipo_id       uuid references public.equipos(id) on delete set null,
  -- Copia de la pieza al momento del movimiento (el historial sobrevive si la pieza se elimina)
  codigo          text,
  nombre          text,
  seccion         text,
  categoria       text,
  tipo            text not null check (tipo in ('alta','baja')),
  motivo          text not null check (motivo in ('inicial','compra','devolucion','venta','merma','ajuste')),
  cantidad        integer not null check (cantidad > 0),
  precio_unitario numeric(10,2) check (precio_unitario is null or precio_unitario >= 0), -- venta: lo cobrado
  costo_unitario  numeric(10,2) check (costo_unitario is null or costo_unitario >= 0),   -- lo que costó cada pieza
  nota            text,
  fecha           date not null default current_date,
  creado_en       timestamptz not null default now(),
  constraint movimientos_motivo_tipo check (
    (tipo = 'alta' and motivo in ('inicial','compra','devolucion','ajuste')) or
    (tipo = 'baja' and motivo in ('venta','merma','ajuste'))
  )
);

create index if not exists movimientos_fecha_idx  on public.movimientos (fecha desc, creado_en desc);
create index if not exists movimientos_equipo_idx on public.movimientos (equipo_id);

-- Al registrar: copia los datos de la pieza, completa el costo y ajusta la existencia.
create or replace function public.movimiento_registrar()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p public.equipos%rowtype;
  delta integer := case when new.tipo = 'alta' then new.cantidad else -new.cantidad end;
begin
  select * into p from public.equipos where id = new.equipo_id for update;
  if not found then
    raise exception 'La pieza no existe.';
  end if;
  if p.existencia + delta < 0 then
    raise exception 'Solo hay % pieza(s) de %; no se puede dar de baja %.', p.existencia, coalesce(p.codigo, p.nombre), new.cantidad
      using errcode = 'check_violation';
  end if;

  new.codigo    := p.codigo;
  new.nombre    := p.nombre;
  new.seccion   := p.seccion;
  new.categoria := p.categoria;
  -- Si no se indica, el costo es el de la pieza (sirve para calcular la utilidad de cada venta)
  new.costo_unitario := coalesce(new.costo_unitario, p.costo);

  update public.equipos
     set existencia = existencia + delta,
         -- Una compra con costo actualiza el costo de la pieza (último costo)
         costo = case when new.motivo = 'compra' and new.costo_unitario is not null then new.costo_unitario else costo end
   where id = p.id;
  return new;
end;
$$;

drop trigger if exists movimientos_registrar on public.movimientos;
create trigger movimientos_registrar
  before insert on public.movimientos
  for each row execute function public.movimiento_registrar();

-- Al borrar un movimiento (por error de captura): se deshace su efecto en la existencia.
create or replace function public.movimiento_deshacer()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  delta integer := case when old.tipo = 'alta' then -old.cantidad else old.cantidad end;
  actual integer;
begin
  if old.equipo_id is null then return old; end if;
  select existencia into actual from public.equipos where id = old.equipo_id for update;
  if not found then return old; end if;
  if actual + delta < 0 then
    raise exception 'No se puede borrar: la existencia quedaría en negativo (hay %).', actual
      using errcode = 'check_violation';
  end if;
  update public.equipos set existencia = existencia + delta where id = old.equipo_id;
  return old;
end;
$$;

drop trigger if exists movimientos_deshacer on public.movimientos;
create trigger movimientos_deshacer
  before delete on public.movimientos
  for each row execute function public.movimiento_deshacer();

-- No se editan: si hay un error, se borra el movimiento y se captura de nuevo.
alter table public.movimientos enable row level security;
revoke all on public.movimientos from anon;
grant select, insert, delete on public.movimientos to authenticated;

drop policy if exists "Admin ve movimientos" on public.movimientos;
create policy "Admin ve movimientos" on public.movimientos for select
  to authenticated using (public.es_admin());

drop policy if exists "Admin registra movimientos" on public.movimientos;
create policy "Admin registra movimientos" on public.movimientos for insert
  to authenticated with check (public.es_admin());

drop policy if exists "Admin borra movimientos" on public.movimientos;
create policy "Admin borra movimientos" on public.movimientos for delete
  to authenticated using (public.es_admin());

-- ---------- 4. Datos actuales ----------
-- Separar el código del final del nombre: "Collar Hombre CC99" → "Collar Hombre" + "CC99".
update public.equipos
   set codigo = upper(substring(nombre from '\s([A-Za-z]{1,3}\d+)$')),
       nombre = trim(regexp_replace(nombre, '\s+[A-Za-z]{1,3}\d+$', ''))
 where codigo is null
   and nombre ~ '\s[A-Za-z]{1,3}\d+$';

-- Existencias de ele.xlsx (columna "Existencia"), solo si la pieza aún no tiene movimientos.
-- AR25, AR69 y R550 están en el Excel pero no en la tienda: se omiten (agrégalas desde el panel).
insert into public.movimientos (equipo_id, tipo, motivo, cantidad, nota, fecha)
select e.id, 'alta', 'inicial', x.cantidad, 'Inventario inicial (ele.xlsx)', current_date
  from (values
    ('AR109', 1), ('AR55', 1), ('AR80', 18), ('B380', 2), ('P180', 5),
    ('C80', 1), ('C99', 1), ('C129', 2), ('C149', 6), ('C150', 1),
    ('CC150', 4), ('C160', 5), ('CC199', 2), ('CC99', 3), ('P080', 13),
    ('P99', 1), ('P149', 6), ('P80', 2), ('R260', 1)
  ) as x(codigo, cantidad)
  join public.equipos e on upper(e.codigo) = x.codigo
 where not exists (select 1 from public.movimientos m where m.equipo_id = e.id);
