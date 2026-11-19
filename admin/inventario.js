// Inventario (existencias por sección), Movimientos (historial de altas y bajas) y el diálogo de alta/baja.
// La existencia la ajusta la base de datos al insertar o borrar un movimiento (ver supabase/inventario.sql).
import { supabase } from "../src/supabase.js";
import { SECCIONES, seccion, categoria, esc } from "../src/catalogo.js";
import { $, aviso, htmlError, setOcupado, confirmarEliminar } from "./ui.js";
import {
  datos, alCambiar, avisarCambio, refrescarEquipo,
  MOTIVOS, motivoLabel, PERIODOS, rangoDe, enRango,
  hoyISO, fecha, fechaCorta, pesos, entero, normalizar,
} from "./datos.js";

const vistaActiva = id => document.body.dataset.vista === id;
const nombreCompleto = e => [e.codigo, e.nombre].filter(Boolean).join(" · ");
const chips = (lista, activo, attr, cuenta) => lista
  .map(o => `<button type="button" class="filtro" data-${attr}="${o.id}" aria-pressed="${o.id === activo}">${esc(o.label)}${cuenta ? `<span class="n">${cuenta(o.id)}</span>` : ""}</button>`)
  .join("");

// Último movimiento por pieza (los movimientos vienen ordenados del más reciente al más viejo)
function ultimoPorEquipo() {
  const m = new Map();
  for (const mov of datos.movimientos) if (mov.equipo_id && !m.has(mov.equipo_id)) m.set(mov.equipo_id, mov);
  return m;
}

/* ==========================================================
   Inventario
   ========================================================== */
const inv = { seccion: "todas", filtro: "todos" };
const FILTROS_INV = [
  { id: "todos", label: "Todos", si: () => true },
  { id: "con", label: "Con stock", si: e => e.existencia > 0 },
  { id: "minimo", label: "Por resurtir", si: e => e.inv_minimo > 0 && e.existencia <= e.inv_minimo },
  { id: "sin", label: "Sin stock", si: e => !(e.existencia > 0) },
];

function renderInventario() {
  if (!vistaActiva("inventario")) return;
  const todos = datos.equipos;
  const enSeccion = e => inv.seccion === "todas" || e.seccion === inv.seccion;
  const f = FILTROS_INV.find(x => x.id === inv.filtro) || FILTROS_INV[0];

  $("inv-secciones").innerHTML = chips([{ id: "todas", label: "Todas" }, ...SECCIONES], inv.seccion, "seccion",
    id => todos.filter(e => id === "todas" || e.seccion === id).length);
  $("inv-filtros").innerHTML = chips(FILTROS_INV, inv.filtro, "filtro",
    id => todos.filter(e => enSeccion(e) && FILTROS_INV.find(x => x.id === id).si(e)).length);

  const piezas = todos.reduce((s, e) => s + (e.existencia || 0), 0);
  const valorCosto = todos.reduce((s, e) => s + (e.existencia || 0) * (e.costo || 0), 0);
  const valorVenta = todos.reduce((s, e) => s + (e.existencia || 0) * (e.precio || 0), 0);
  $("inv-resumen").textContent =
    `${entero(todos.length)} productos · ${entero(piezas)} piezas · valor ${pesos(valorVenta)} a precio de venta` +
    (valorCosto ? ` · ${pesos(valorCosto)} a costo` : "");

  const q = normalizar($("inv-buscar").value.trim());
  const visibles = todos
    .filter(e => enSeccion(e) && f.si(e) && (!q || normalizar(`${e.codigo ?? ""} ${e.nombre} ${e.descripcion ?? ""}`).includes(q)))
    .sort((a, b) => (a.codigo || a.nombre).localeCompare(b.codigo || b.nombre, "es", { numeric: true }));

  const ultimo = ultimoPorEquipo();
  const grupos = SECCIONES
    .map(s => ({ s, filas: visibles.filter(e => e.seccion === s.id) }))
    .filter(g => g.filas.length);

  $("inv-lista").innerHTML = grupos.map(({ s, filas }) => `
    <section class="inv-grupo" aria-label="${esc(s.label)}">
      <h2 class="inv-grupo-titulo">${esc(s.label)} <span>${filas.length} · ${entero(filas.reduce((n, e) => n + (e.existencia || 0), 0))} piezas</span></h2>
      <div class="inv-cabecera" aria-hidden="true"><span>Código</span><span>Descripción</span><span>Cantidad</span><span>Últ. movimiento</span><span></span></div>
      <ul class="inv-filas">${filas.map(e => filaInventario(e, ultimo.get(e.id))).join("")}</ul>
    </section>`).join("");
  $("inv-vacio").hidden = visibles.length > 0;
}

function filaInventario(e, ult) {
  const n = e.existencia || 0;
  const bajo = e.inv_minimo > 0 && n <= e.inv_minimo;
  const clase = n === 0 ? "cero" : bajo ? "bajo" : "";
  const aviso = n === 0 ? "Sin stock" : bajo ? `Mínimo ${e.inv_minimo}` : "";
  return `
    <li class="inv-fila" data-id="${e.id}">
      <span class="inv-codigo">${esc(e.codigo || "—")}</span>
      <span class="inv-desc">
        <strong>${esc(e.nombre)}</strong>
        <small>${esc(categoria(e.categoria)?.label || e.categoria)}${e.estado === "vendido" ? " · oculta en la tienda" : ""}</small>
      </span>
      <span class="inv-cant ${clase}">
        <b>${entero(n)}</b>${aviso ? `<small>${esc(aviso)}</small>` : ""}
      </span>
      <span class="inv-fecha">${ult ? `${fecha(ult.fecha)}<small>${ult.tipo === "alta" ? "+" : "−"}${ult.cantidad} ${esc(motivoLabel(ult.tipo, ult.motivo).toLowerCase())}</small>` : `<small>Sin movimientos</small>`}</span>
      <span class="inv-acciones">
        <button type="button" class="btn btn-linea btn-sm" data-mov="alta" aria-label="Alta de ${esc(nombreCompleto(e))}">+ Alta</button>
        <button type="button" class="btn btn-linea btn-sm" data-mov="baja" aria-label="Baja de ${esc(nombreCompleto(e))}" ${n === 0 ? "disabled" : ""}>− Baja</button>
      </span>
    </li>`;
}

$("inv-secciones").addEventListener("click", e => {
  const b = e.target.closest("[data-seccion]");
  if (b) { inv.seccion = b.dataset.seccion; renderInventario(); }
});
$("inv-filtros").addEventListener("click", e => {
  const b = e.target.closest("[data-filtro]");
  if (b) { inv.filtro = b.dataset.filtro; renderInventario(); }
});
$("inv-buscar").addEventListener("input", renderInventario);
$("inv-lista").addEventListener("click", e => {
  const b = e.target.closest("[data-mov]");
  if (!b) return;
  const eq = datos.equipos.find(x => x.id === b.closest("[data-id]").dataset.id);
  if (eq) abrirMovimiento({ equipo: eq, tipo: b.dataset.mov });
});
$("inv-nuevo-mov").addEventListener("click", () => abrirMovimiento({}));

/* ==========================================================
   Movimientos (historial)
   ========================================================== */
const mov = { periodo: "30", tipo: "todos", seccion: "todas" };
const TIPOS = [
  { id: "todos", label: "Todos" },
  { id: "alta", label: "Altas" },
  { id: "baja", label: "Bajas" },
  { id: "venta", label: "Ventas" },
];

function renderMovimientos() {
  if (!vistaActiva("movimientos")) return;
  $("mov-periodos").innerHTML = chips(PERIODOS, mov.periodo, "periodo");
  $("mov-tipos").innerHTML = chips(TIPOS, mov.tipo, "tipo");
  $("mov-secciones").innerHTML = chips([{ id: "todas", label: "Todas" }, ...SECCIONES], mov.seccion, "seccion");
  $("mov-rango").hidden = mov.periodo !== "rango";

  if (!datos.movimientosCargados) {
    $("mov-resumen").textContent = "Cargando movimientos…";
    $("mov-lista").innerHTML = "";
    return;
  }

  const rango = rangoDe(mov.periodo, $("mov-desde").value, $("mov-hasta").value);
  const q = normalizar($("mov-buscar").value.trim());
  const lista = datos.movimientos.filter(m =>
    enRango(m.fecha, rango) &&
    (mov.tipo === "todos" || (mov.tipo === "venta" ? m.motivo === "venta" : m.tipo === mov.tipo)) &&
    (mov.seccion === "todas" || m.seccion === mov.seccion) &&
    (!q || normalizar(`${m.codigo ?? ""} ${m.nombre ?? ""} ${m.nota ?? ""}`).includes(q))
  );

  const entradas = lista.filter(m => m.tipo === "alta").reduce((s, m) => s + m.cantidad, 0);
  const salidas = lista.filter(m => m.tipo === "baja").reduce((s, m) => s + m.cantidad, 0);
  const vendido = lista.filter(m => m.motivo === "venta").reduce((s, m) => s + m.cantidad * (m.precio_unitario || 0), 0);
  $("mov-resumen").textContent =
    `${entero(lista.length)} movimientos · +${entero(entradas)} entradas · −${entero(salidas)} salidas · ${pesos(vendido)} vendido`;

  $("mov-lista").innerHTML = lista.slice(0, 500).map(filaMovimiento).join("");
  $("mov-vacio").hidden = lista.length > 0;
}

function filaMovimiento(m) {
  const alta = m.tipo === "alta";
  const importe = m.motivo === "venta" && m.precio_unitario != null
    ? `${pesos(m.cantidad * m.precio_unitario)}<small>${pesos(m.precio_unitario)} c/u</small>`
    : m.motivo === "compra" && m.costo_unitario != null
      ? `${pesos(m.cantidad * m.costo_unitario)}<small>costo ${pesos(m.costo_unitario)} c/u</small>`
      : "";
  return `
    <li class="mov" data-id="${m.id}">
      <span class="mov-fecha">${fechaCorta(m.fecha)}<small>${m.fecha.slice(0, 4)}</small></span>
      <span class="mov-desc">
        <strong>${esc([m.codigo, m.nombre].filter(Boolean).join(" · ") || "Pieza eliminada")}</strong>
        <small><span class="mov-motivo ${m.tipo}">${esc(motivoLabel(m.tipo, m.motivo))}</span>${m.nota ? " · " + esc(m.nota) : ""}</small>
      </span>
      <span class="mov-cant ${m.tipo}">${alta ? "+" : "−"}${entero(m.cantidad)}</span>
      <span class="mov-importe">${importe}</span>
      <button type="button" class="btn-texto mov-borrar" data-borrar aria-label="Borrar movimiento de ${esc(m.nombre || "")}">Borrar</button>
    </li>`;
}

$("mov-periodos").addEventListener("click", e => {
  const b = e.target.closest("[data-periodo]");
  if (b) { mov.periodo = b.dataset.periodo; renderMovimientos(); }
});
$("mov-tipos").addEventListener("click", e => {
  const b = e.target.closest("[data-tipo]");
  if (b) { mov.tipo = b.dataset.tipo; renderMovimientos(); }
});
$("mov-secciones").addEventListener("click", e => {
  const b = e.target.closest("[data-seccion]");
  if (b) { mov.seccion = b.dataset.seccion; renderMovimientos(); }
});
["mov-buscar", "mov-desde", "mov-hasta"].forEach(id => $(id).addEventListener("input", renderMovimientos));
$("mov-nuevo").addEventListener("click", () => abrirMovimiento({}));

$("mov-lista").addEventListener("click", e => {
  if (!e.target.closest("[data-borrar]")) return;
  const m = datos.movimientos.find(x => x.id === e.target.closest("[data-id]").dataset.id);
  if (!m) return;
  const signo = m.tipo === "alta" ? "+" : "−";
  confirmarEliminar({
    nombre: `${motivoLabel(m.tipo, m.motivo)} ${signo}${m.cantidad} de ${m.codigo || m.nombre || "la pieza"} (${fecha(m.fecha)})`,
    extra: "",
    nota: m.tipo === "alta"
      ? "La existencia de la pieza bajará en " + m.cantidad + "."
      : "La existencia de la pieza subirá en " + m.cantidad + ".",
    accion: async () => {
      const { error } = await supabase.from("movimientos").delete().eq("id", m.id);
      if (error) {
        aviso(error.message?.startsWith("No se puede") ? error.message : "No se pudo borrar. Inténtalo de nuevo.", true);
        return false;
      }
      datos.movimientos = datos.movimientos.filter(x => x.id !== m.id);
      if (m.equipo_id) await refrescarEquipo(m.equipo_id);
      else avisarCambio();
      aviso("Movimiento borrado. La existencia se ajustó.");
    },
  });
});

/* ==========================================================
   Diálogo: registrar alta o baja
   ========================================================== */
const dlg = $("dlg-mov");
const form = $("form-mov");
let guardando = false;

const tipoActual = () => form.tipo.value;
const equipoActual = () => datos.equipos.find(e => e.id === form.equipo.value);

function errorMov(msg) {
  $("error-mov").innerHTML = htmlError(msg);
  $("error-mov").hidden = !msg;
}
function errorCantidad(msg) {
  $("err-cantidad").innerHTML = htmlError(msg);
  $("err-cantidad").hidden = !msg;
  form.cantidad.setAttribute("aria-invalid", msg ? "true" : "false");
  if (msg) form.cantidad.focus();
}

export function abrirMovimiento({ equipo = null, tipo = "alta" } = {}) {
  if (!datos.equipos.length) return aviso("Primero agrega una pieza.", true);
  form.reset();
  errorMov("");
  errorCantidad("");
  form.tipo.value = tipo;
  const orden = [...datos.equipos].sort((a, b) => (a.codigo || a.nombre).localeCompare(b.codigo || b.nombre, "es", { numeric: true }));
  form.equipo.innerHTML = SECCIONES.map(s => {
    const de = orden.filter(e => e.seccion === s.id);
    return de.length ? `<optgroup label="${esc(s.label)}">${de.map(e => `<option value="${e.id}">${esc(nombreCompleto(e))}</option>`).join("")}</optgroup>` : "";
  }).join("");
  form.equipo.value = (equipo || orden[0]).id;
  form.cantidad.value = 1;
  form.fecha.value = hoyISO();
  form.fecha.max = hoyISO();
  sincronizar(true);
  dlg.showModal();
  if (equipo) form.cantidad.focus({ preventScroll: true });
}

// Ajusta motivos, campos de precio/costo y ayudas según tipo, motivo y pieza
function sincronizar(reiniciarMotivo = false) {
  const tipo = tipoActual();
  const eq = equipoActual();
  if (reiniciarMotivo) {
    // "Inicial" solo existe para la carga del Excel; no se ofrece al capturar
    form.motivo.innerHTML = MOTIVOS[tipo].filter(m => m.id !== "inicial").map(m => `<option value="${m.id}">${esc(m.label)}</option>`).join("");
    form.motivo.value = tipo === "alta" ? "compra" : "venta";
  }
  const motivo = form.motivo.value;
  $("titulo-mov").textContent = tipo === "alta" ? "Registrar alta" : "Registrar baja";

  const n = eq?.existencia ?? 0;
  $("mov-existencia").textContent = eq
    ? `${seccion(eq.seccion)?.label || ""} · ${categoria(eq.categoria)?.label || eq.categoria} · hay ${entero(n)} en existencia`
    : "";
  form.cantidad.max = tipo === "baja" ? n : "";

  const esVenta = tipo === "baja" && motivo === "venta";
  const esCompra = tipo === "alta" && motivo === "compra";
  $("mov-campo-precio").hidden = !esVenta;
  $("mov-campo-costo").hidden = !esCompra;
  if (esVenta) {
    form.precio.value = eq?.precio ?? "";
    $("mov-atajos").innerHTML = [
      eq?.precio != null && `<button type="button" class="atajo" data-precio="${eq.precio}">Menudeo ${pesos(eq.precio)}</button>`,
      eq?.precio_mayoreo != null && `<button type="button" class="atajo" data-precio="${eq.precio_mayoreo}">Mayoreo ${pesos(eq.precio_mayoreo)}</button>`,
    ].filter(Boolean).join("");
  }
  if (esCompra) form.costo.value = eq?.costo ?? "";
}

form.addEventListener("change", e => {
  if (e.target.name === "tipo") sincronizar(true);
  if (e.target.name === "equipo") { errorCantidad(""); sincronizar(true); }
  if (e.target.name === "motivo") sincronizar(false);
});
form.cantidad.addEventListener("input", () => errorCantidad(""));
$("mov-atajos").addEventListener("click", e => {
  const b = e.target.closest("[data-precio]");
  if (b) form.precio.value = b.dataset.precio;
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (guardando) return;
  errorMov("");
  const eq = equipoActual();
  const tipo = tipoActual();
  const motivo = form.motivo.value;
  const cantidad = Number(form.cantidad.value);
  if (!eq) return errorMov("Elige el producto.");
  if (!Number.isInteger(cantidad) || cantidad < 1) return errorCantidad("Escribe una cantidad entera, mínimo 1.");
  if (tipo === "baja" && cantidad > (eq.existencia || 0)) {
    return errorCantidad(`Solo hay ${eq.existencia || 0} en existencia.`);
  }
  if (!form.fecha.value) return errorMov("Elige la fecha.");

  const num = v => (v === "" || v == null ? null : Math.max(0, Number(v)));
  const fila = {
    equipo_id: eq.id,
    tipo,
    motivo,
    cantidad,
    fecha: form.fecha.value,
    nota: form.nota.value.trim() || null,
    precio_unitario: tipo === "baja" && motivo === "venta" ? num(form.precio.value) : null,
    costo_unitario: tipo === "alta" && motivo === "compra" ? num(form.costo.value) : null,
  };

  guardando = true;
  setOcupado(true);
  const btn = $("btn-guardar-mov");
  btn.disabled = true;
  btn.textContent = "Guardando…";
  try {
    const { data, error } = await supabase.from("movimientos").insert(fila).select().single();
    if (error) throw error;
    datos.movimientos = [data, ...datos.movimientos].sort((a, b) =>
      b.fecha.localeCompare(a.fecha) || b.creado_en.localeCompare(a.creado_en));
    await refrescarEquipo(eq.id);
    guardando = false;
    setOcupado(false);
    dlg.close();
    const signo = tipo === "alta" ? "+" : "−";
    aviso(`${motivoLabel(tipo, motivo)} registrada: ${signo}${cantidad} ${eq.codigo || eq.nombre}.`);
  } catch (err) {
    const msg = err.message || String(err);
    errorMov(msg.startsWith("Solo hay") ? msg : `No se guardó. Revisa tu conexión e inténtalo de nuevo. (${msg})`);
  } finally {
    guardando = false;
    setOcupado(false);
    btn.disabled = false;
    btn.textContent = "Guardar";
  }
});

/* ---------- Repintar cuando cambian los datos o la pestaña ---------- */
alCambiar(() => {
  renderInventario();
  renderMovimientos();
});
