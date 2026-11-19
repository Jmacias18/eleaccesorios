// Colectivos: qué mercancía hay en cada ubicación, cuánto se vende ahí y lo que cobra (comisión / renta).
import { supabase } from "../src/supabase.js";
import { categoria, esc } from "../src/catalogo.js";
import { $, aviso, htmlError, setOcupado } from "./ui.js";
import { abrirMovimiento } from "./inventario.js";
import {
  datos, alCambiar, cargarUbicaciones, PERIODOS, rangoDe, enRango, diasEntre, hoyISO,
  pesos, entero, cantidadEn, casaId,
} from "./datos.js";

const est = { periodo: "30" };
const PERIODOS_COL = PERIODOS.filter(p => ["7", "30", "90", "mes", "anio", "todo"].includes(p.id));

function render() {
  if (document.body.dataset.vista !== "colectivos") return;
  $("col-periodos").innerHTML = PERIODOS_COL
    .map(o => `<button type="button" class="filtro" data-periodo="${o.id}" aria-pressed="${o.id === est.periodo}">Ventas: ${esc(o.label)}</button>`).join("");

  const hay = datos.ubicaciones.length > 0;
  $("col-falta").hidden = hay;
  $("col-nuevo").hidden = !hay;
  if (!hay) { $("col-lista").innerHTML = ""; $("col-resumen").textContent = ""; return; }

  let [desde, hasta] = rangoDe(est.periodo);
  if (!desde) desde = datos.movimientos.reduce((min, m) => (m.fecha < min ? m.fecha : min), hoyISO());
  const dias = Math.max(1, diasEntre(desde, hasta) + 1);
  const porId = new Map(datos.equipos.map(e => [e.id, e]));

  const tarjetas = [...datos.ubicaciones].sort((a, b) => (b.activa - a.activa) || a.orden - b.orden).map(u => {
    const piezas = datos.existencias
      .filter(x => x.ubicacion_id === u.id && x.cantidad > 0)
      .map(x => ({ e: porId.get(x.equipo_id), n: x.cantidad }))
      .filter(r => r.e)
      .sort((a, b) => (a.e.codigo || a.e.nombre).localeCompare(b.e.codigo || b.e.nombre, "es", { numeric: true }));
    const total = piezas.reduce((s, r) => s + r.n, 0);
    const valor = piezas.reduce((s, r) => s + r.n * (r.e.precio || 0), 0);

    const ventas = datos.movimientos.filter(m => m.motivo === "venta" && m.ubicacion_id === u.id && enRango(m.fecha, [desde, hasta]));
    const vendido = ventas.reduce((s, m) => s + m.cantidad * (m.precio_unitario ?? porId.get(m.equipo_id)?.precio ?? 0), 0);
    const vendidas = ventas.reduce((s, m) => s + m.cantidad, 0);
    const comision = ventas.reduce((s, m) => s + m.cantidad * (m.comision_unitaria || 0), 0);
    const costo = ventas.reduce((s, m) => s + m.cantidad * (m.costo_unitario ?? porId.get(m.equipo_id)?.costo ?? 0), 0);
    const renta = u.renta_mensual * dias / 30.4;
    const neta = vendido - costo - comision - renta;
    const cobros = [
      u.comision_pct > 0 && `Comisión ${Number(u.comision_pct)}%`,
      u.renta_mensual > 0 && `Renta ${pesos(u.renta_mensual)}/mes`,
    ].filter(Boolean).join(" · ") || (u.tipo === "casa" ? "Tu mercancía en casa" : "Sin cobro registrado");

    return `
      <article class="col-tarjeta ${u.activa ? "" : "inactiva"}" data-id="${u.id}">
        <header class="col-cab">
          <div>
            <h2>${esc(u.nombre)}</h2>
            ${u.direccion ? `<p class="muted">${esc(u.direccion)}</p>` : ""}
            <p class="col-chips">
              <span>${esc(cobros)}</span>
              ${u.tipo !== "casa" ? `<span>${u.publica ? "Se muestra en la tienda" : "No se muestra en la tienda"}</span>` : ""}
              ${u.activa ? "" : "<span>Desactivada</span>"}
            </p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" data-editar>Editar</button>
        </header>
        <dl class="col-datos">
          <div><dt>Piezas aquí</dt><dd>${entero(total)}</dd><dd class="sub">${pesos(valor)} a precio</dd></div>
          <div><dt>Vendido</dt><dd>${pesos(vendido)}</dd><dd class="sub">${entero(vendidas)} pieza${vendidas === 1 ? "" : "s"}</dd></div>
          ${u.tipo !== "casa" ? `<div><dt>Comisión + renta</dt><dd>${pesos(comision + renta)}</dd><dd class="sub">${pesos(comision)} + ${pesos(renta)} renta</dd></div>` : ""}
          <div><dt>Te deja</dt><dd>${pesos(neta)}</dd><dd class="sub">después de costo${u.tipo !== "casa" ? ", comisión y renta" : ""}</dd></div>
        </dl>
        ${u.activa ? `<div class="col-acciones">
          ${u.tipo !== "casa" ? `<button type="button" class="btn btn-tinta btn-sm" data-llevar>Llevar mercancía aquí</button>` : ""}
          ${total ? `<button type="button" class="btn btn-linea btn-sm" data-vender>Registrar venta aquí</button>` : ""}
          ${total && u.tipo !== "casa" ? `<button type="button" class="btn btn-linea btn-sm" data-recoger>Regresar a casa</button>` : ""}
        </div>` : ""}
        ${piezas.length ? `<details class="col-piezas">
          <summary>Ver las ${entero(piezas.length)} piezas que hay aquí</summary>
          <ul>${piezas.map(r => `<li><span class="codigo">${esc(r.e.codigo || "—")}</span><span>${esc(r.e.nombre)} <small>${esc(categoria(r.e.categoria)?.label || "")}</small></span><b>${entero(r.n)}</b></li>`).join("")}</ul>
        </details>` : `<p class="muted col-vacio">No hay mercancía aquí.</p>`}
      </article>`;
  });

  const enColectivos = datos.existencias
    .filter(x => datos.ubicaciones.find(u => u.id === x.ubicacion_id)?.tipo === "colectivo")
    .reduce((s, x) => s + x.cantidad, 0);
  $("col-resumen").textContent = `${entero(enColectivos)} piezas en colectivos · ${entero(cantidadTotal() - enColectivos)} en casa`;
  $("col-lista").innerHTML = tarjetas.join("");
}

const cantidadTotal = () => datos.existencias.reduce((s, x) => s + x.cantidad, 0);

$("col-periodos").addEventListener("click", e => {
  const b = e.target.closest("[data-periodo]");
  if (b) { est.periodo = b.dataset.periodo; render(); }
});

$("col-lista").addEventListener("click", e => {
  const tarjeta = e.target.closest("[data-id]");
  if (!tarjeta) return;
  const u = datos.ubicaciones.find(x => x.id === tarjeta.dataset.id);
  if (!u) return;
  // Pieza sugerida: la primera que tenga stock en el origen
  const conStock = ubic => datos.equipos.find(eq => cantidadEn(eq.id, ubic) > 0) || null;
  if (e.target.closest("[data-editar]")) abrirUbicacion(u);
  if (e.target.closest("[data-llevar]")) abrirMovimiento({ tipo: "traspaso", equipo: conStock(casaId()), ubicacion: casaId(), destino: u.id });
  if (e.target.closest("[data-vender]")) abrirMovimiento({ tipo: "baja", equipo: conStock(u.id), ubicacion: u.id });
  if (e.target.closest("[data-recoger]")) abrirMovimiento({ tipo: "traspaso", equipo: conStock(u.id), ubicacion: u.id, destino: casaId() });
});

/* ---------- Diálogo de ubicación ---------- */
const dlg = $("dlg-ubic");
const form = $("form-ubic");
let editando = null;

function errorU(msg) {
  $("error-ubic").innerHTML = htmlError(msg);
  $("error-ubic").hidden = !msg;
}
function errorNombre(msg) {
  $("err-u-nombre").innerHTML = htmlError(msg);
  $("err-u-nombre").hidden = !msg;
  form.nombre.setAttribute("aria-invalid", msg ? "true" : "false");
  if (msg) form.nombre.focus();
}

function abrirUbicacion(u = null) {
  editando = u;
  form.reset();
  errorU("");
  errorNombre("");
  $("titulo-ubic").textContent = u ? "Editar ubicación" : "Nueva ubicación";
  form.nombre.value = u?.nombre || "";
  form.direccion.value = u?.direccion || "";
  form.comision_pct.value = u?.comision_pct ? Number(u.comision_pct) : "";
  form.renta_mensual.value = u?.renta_mensual ? Number(u.renta_mensual) : "";
  form.publica.checked = u ? u.publica : true;
  form.activa.checked = u ? u.activa : true;
  const casa = u?.tipo === "casa";
  $("u-cobros").hidden = casa;
  $("u-ayuda-cobros").hidden = casa;
  form.publica.closest("label").hidden = casa;
  dlg.showModal();
  if (!u) form.nombre.focus({ preventScroll: true });
}

$("col-nuevo").addEventListener("click", () => abrirUbicacion());
form.nombre.addEventListener("input", () => errorNombre(""));

form.addEventListener("submit", async e => {
  e.preventDefault();
  errorU("");
  const nombre = form.nombre.value.trim();
  if (!nombre) return errorNombre("Escribe el nombre, por ejemplo “Koy Colectivo”.");
  if (datos.ubicaciones.some(x => x.id !== editando?.id && x.nombre.toLowerCase() === nombre.toLowerCase())) {
    return errorNombre("Ya hay una ubicación con ese nombre.");
  }
  const num = v => (v === "" ? 0 : Math.max(0, Number(v)));
  const fila = {
    nombre,
    direccion: form.direccion.value.trim() || null,
    comision_pct: Math.min(100, num(form.comision_pct.value)),
    renta_mensual: num(form.renta_mensual.value),
    publica: editando?.tipo === "casa" ? false : form.publica.checked,
    activa: form.activa.checked,
  };
  if (!editando) fila.orden = Math.max(0, ...datos.ubicaciones.map(u => u.orden)) + 1;
  if (editando && !fila.activa && datos.existencias.some(x => x.ubicacion_id === editando.id && x.cantidad > 0)) {
    return errorU("Todavía hay mercancía aquí. Regrésala a casa (o regístrala como vendida) antes de desactivarla.");
  }

  const btn = $("btn-guardar-ubic");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  setOcupado(true);
  try {
    const consulta = editando
      ? supabase.from("ubicaciones").update(fila).eq("id", editando.id)
      : supabase.from("ubicaciones").insert(fila);
    const { error } = await consulta;
    if (error) throw error;
    await cargarUbicaciones();
    setOcupado(false);
    dlg.close();
    aviso(editando ? "Ubicación guardada." : `“${nombre}” agregada.`);
  } catch (err) {
    errorU("No se guardó. Revisa tu conexión e inténtalo de nuevo. (" + (err.message || err) + ")");
  } finally {
    setOcupado(false);
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
});

alCambiar(render);
