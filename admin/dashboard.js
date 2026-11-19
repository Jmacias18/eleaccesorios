// Dashboard: qué tan vendible y rentable es cada producto, a partir de los movimientos.
// Ventas = bajas con motivo "venta" (precio cobrado × cantidad). Utilidad = ventas − costo de lo vendido.
import { SECCIONES, subcategoriasDe, seccion, categoria, esc } from "../src/catalogo.js";
import { $ } from "./ui.js";
import {
  datos, alCambiar, PERIODOS, rangoDe, enRango, sumarDias, diasEntre, hoyISO,
  fecha, fechaCorta, pesos, entero,
} from "./datos.js";

const est = { periodo: "90", seccion: "todas", categoria: "todas", clase: "todas", orden: "ventas", desc: true };

const CLASES = [
  { id: "estrella", label: "Estrella" },
  { id: "margen", label: "Buen margen, lento" },
  { id: "volumen", label: "Vende, poco margen" },
  { id: "revisar", label: "Revisar" },
  { id: "sin-ventas", label: "Sin ventas" },
  { id: "sin-costo", label: "Falta costo" },
];
const claseLabel = id => CLASES.find(c => c.id === id)?.label || "";

const pct = n => (n == null || !Number.isFinite(n) ? "—" : Math.round(n * 100) + "%");
const mediana = arr => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ---------- Filtros ---------- */
function llenarSelects() {
  const sec = $("dash-seccion"), cat = $("dash-categoria");
  sec.innerHTML = `<option value="todas">Todas</option>` + SECCIONES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join("");
  sec.value = est.seccion;
  const subs = est.seccion === "todas"
    ? [...new Map(SECCIONES.flatMap(s => subcategoriasDe(s.id)).map(c => [c.id, c])).values()]
    : subcategoriasDe(est.seccion);
  if (!subs.some(c => c.id === est.categoria)) est.categoria = "todas";
  cat.innerHTML = `<option value="todas">Todas</option>` + subs.map(c => `<option value="${c.id}">${esc(c.label)}</option>`).join("");
  cat.value = est.categoria;
}

const pasaFiltro = x => (est.seccion === "todas" || x.seccion === est.seccion) && (est.categoria === "todas" || x.categoria === est.categoria);

/* ---------- Cálculo ---------- */
function calcular() {
  const hoy = hoyISO();
  const movs = datos.movimientos.filter(pasaFiltro);
  let [desde, hasta] = rangoDe(est.periodo, $("dash-desde").value, $("dash-hasta").value);
  if (!desde) desde = datos.movimientos.reduce((min, m) => (m.fecha < min ? m.fecha : min), hoy);
  const dias = Math.max(1, diasEntre(desde, hasta) + 1);
  const rango = [desde, hasta];
  const anterior = [sumarDias(desde, -dias), sumarDias(desde, -1)];

  const porId = new Map(datos.equipos.map(e => [e.id, e]));
  const productos = new Map();
  // Todas las piezas que pasan el filtro aparecen, aunque no tengan ventas
  datos.equipos.filter(pasaFiltro).forEach(e => productos.set(e.id, nuevo(e.id, e)));

  let ventasAnt = 0;
  const totales = { ventas: 0, piezas: 0, costoVendido: 0, ventasConCosto: 0, lineasSinCosto: 0, merma: 0, mermaCosto: 0 };

  for (const m of movs) {
    const eq = porId.get(m.equipo_id);
    const precio = m.precio_unitario ?? eq?.precio ?? 0;
    const costo = m.costo_unitario ?? eq?.costo ?? null;
    if (m.motivo === "venta" && enRango(m.fecha, anterior)) ventasAnt += m.cantidad * precio;
    if (!enRango(m.fecha, rango)) continue;

    const clave = m.equipo_id || "x:" + (m.codigo || m.nombre);
    if (!productos.has(clave)) productos.set(clave, nuevo(clave, eq || m));
    const p = productos.get(clave);

    if (m.motivo === "venta") {
      const imp = m.cantidad * precio;
      p.vendidas += m.cantidad;
      p.ventas += imp;
      totales.ventas += imp;
      totales.piezas += m.cantidad;
      if (costo != null) {
        p.costoVendido += m.cantidad * costo;
        p.ventasConCosto += imp;
        totales.costoVendido += m.cantidad * costo;
        totales.ventasConCosto += imp;
      } else {
        p.sinCosto = true;
        totales.lineasSinCosto++;
      }
      if (!p.ultimaVenta || m.fecha > p.ultimaVenta) p.ultimaVenta = m.fecha;
    } else if (m.motivo === "merma") {
      p.merma += m.cantidad;
      totales.merma += m.cantidad;
      totales.mermaCosto += m.cantidad * (costo || 0);
    } else if (m.tipo === "alta" && m.motivo !== "inicial") {
      p.entradas += m.cantidad;
    }
  }

  const lista = [...productos.values()];
  lista.forEach(p => {
    p.utilidad = p.ventasConCosto ? p.ventasConCosto - p.costoVendido : null;
    p.margen = p.ventasConCosto ? p.utilidad / p.ventasConCosto : null;
    // Si nunca se vendió, el margen esperado sale del precio y el costo de la pieza
    p.margenEsperado = p.precio && p.costo != null ? (p.precio - p.costo) / p.precio : null;
    p.porMes = p.vendidas / dias * 30;
    p.diasInv = p.vendidas ? p.existencia / (p.vendidas / dias) : null;
    p.resurtir = p.vivo && ((p.inv_minimo > 0 && p.existencia <= p.inv_minimo) || (p.existencia === 0 && p.vendidas > 0));
  });

  // Clasificación contra la mediana de los productos que sí vendieron en el periodo
  const conVentas = lista.filter(p => p.vendidas > 0 && p.margen != null);
  const medVendidas = mediana(conVentas.map(p => p.vendidas));
  const medMargen = mediana(conVentas.map(p => p.margen));
  lista.forEach(p => {
    if (!p.vendidas) p.clase = "sin-ventas";
    else if (p.margen == null) p.clase = "sin-costo";
    else {
      const mucho = p.vendidas >= medVendidas, buen = p.margen >= medMargen;
      p.clase = mucho && buen ? "estrella" : buen ? "margen" : mucho ? "volumen" : "revisar";
    }
  });

  return { lista, totales, ventasAnt, rango, dias, desde, hasta };
}

function nuevo(clave, e) {
  return {
    clave,
    vivo: !String(clave).startsWith("x:"),
    codigo: e.codigo || "",
    nombre: e.nombre || "Pieza eliminada",
    seccion: e.seccion,
    categoria: e.categoria,
    existencia: e.existencia ?? 0,
    inv_minimo: e.inv_minimo ?? 0,
    precio: e.precio ?? null,
    costo: e.costo ?? null,
    vendidas: 0, ventas: 0, costoVendido: 0, ventasConCosto: 0, merma: 0, entradas: 0,
    sinCosto: false, ultimaVenta: null,
  };
}

/* ---------- Pintar ---------- */
function render() {
  if (document.body.dataset.vista !== "dashboard") return;
  $("dash-periodos").innerHTML = PERIODOS
    .map(o => `<button type="button" class="filtro" data-periodo="${o.id}" aria-pressed="${o.id === est.periodo}">${esc(o.label)}</button>`).join("");
  $("dash-rango").hidden = est.periodo !== "rango";
  llenarSelects();

  if (!datos.movimientosCargados) {
    $("dash-resumen").textContent = "Cargando movimientos…";
    return;
  }

  const r = calcular();
  const { lista, totales: t } = r;
  $("dash-resumen").textContent = `${fecha(r.desde)} – ${fecha(r.hasta)} · ${entero(r.dias)} días`;

  // Aviso de costos faltantes (sin costo no hay utilidad)
  const sinCosto = datos.equipos.filter(e => pasaFiltro(e) && e.costo == null).length;
  $("dash-sin-costo").hidden = !sinCosto;
  $("dash-sin-costo").textContent = sinCosto
    ? `${sinCosto} producto${sinCosto === 1 ? " no tiene" : "s no tienen"} costo capturado: su utilidad y margen no se pueden calcular. Agrégalo en Piezas → Editar → Costo por pieza, o al registrar una compra.`
    : "";

  // KPIs
  const piezasInv = lista.filter(p => p.vivo).reduce((s, p) => s + p.existencia, 0);
  const valorVenta = lista.filter(p => p.vivo).reduce((s, p) => s + p.existencia * (p.precio || 0), 0);
  const valorCosto = lista.filter(p => p.vivo).reduce((s, p) => s + p.existencia * (p.costo || 0), 0);
  const utilidad = t.ventasConCosto ? t.ventasConCosto - t.costoVendido : null;
  const margen = t.ventasConCosto ? utilidad / t.ventasConCosto : null;
  const cambio = est.periodo !== "todo" && r.ventasAnt > 0 ? (t.ventas - r.ventasAnt) / r.ventasAnt : null;
  const resurtir = lista.filter(p => p.resurtir).length;
  const quietos = lista.filter(p => p.vivo && p.existencia > 0 && !p.vendidas).length;

  const kpi = (titulo, valor, sub = "") =>
    `<div class="kpi"><span class="kpi-titulo">${titulo}</span><strong class="kpi-valor">${valor}</strong><span class="kpi-sub">${sub}</span></div>`;
  $("dash-kpis").innerHTML = [
    kpi("Ventas", pesos(t.ventas),
      `${entero(t.piezas)} pieza${t.piezas === 1 ? "" : "s"}` +
      (cambio != null ? ` · ${cambio >= 0 ? "▲" : "▼"} ${pct(Math.abs(cambio))} vs. periodo anterior` : "")),
    kpi("Utilidad bruta", utilidad == null ? "—" : pesos(utilidad),
      utilidad == null ? "Falta capturar costos" : `Margen ${pct(margen)}${t.lineasSinCosto ? " · sin contar ventas sin costo" : ""}`),
    kpi("Inventario actual", `${entero(piezasInv)} piezas`, `${pesos(valorVenta)} a precio${valorCosto ? ` · ${pesos(valorCosto)} a costo` : ""}`),
    kpi("Por resurtir", entero(resurtir), "Sin stock con ventas, o en su mínimo"),
    kpi("Sin ventas", entero(quietos), "Productos con stock que no se vendieron en el periodo"),
    kpi("Mermas", entero(t.merma), t.mermaCosto ? `${pesos(t.mermaCosto)} a costo` : "Piezas dañadas o perdidas"),
  ].join("");

  renderSerie(r);
  renderCategorias(lista);
  renderTabla(lista);
}

// Ventas en el tiempo: por día (≤ 31 días), por semana (≤ 6 meses) o por mes
function renderSerie(r) {
  const ventas = datos.movimientos.filter(m => m.motivo === "venta" && pasaFiltro(m) && enRango(m.fecha, [r.desde, r.hasta]));
  const porId = new Map(datos.equipos.map(e => [e.id, e]));
  const paso = r.dias <= 31 ? "dia" : r.dias <= 190 ? "semana" : "mes";
  const claveDe = iso => {
    if (paso === "dia") return iso;
    if (paso === "mes") return iso.slice(0, 7) + "-01";
    const d = new Date(iso + "T12:00:00");
    return sumarDias(iso, -((d.getDay() + 6) % 7)); // lunes de esa semana
  };
  const cubetas = new Map();
  for (let d = claveDe(r.desde); d <= r.hasta;) {
    cubetas.set(d, { ventas: 0, piezas: 0 });
    if (paso === "dia") d = sumarDias(d, 1);
    else if (paso === "semana") d = sumarDias(d, 7);
    else { const x = new Date(d + "T12:00:00"); x.setMonth(x.getMonth() + 1); d = x.toISOString().slice(0, 8) + "01"; }
  }
  ventas.forEach(m => {
    const c = cubetas.get(claveDe(m.fecha));
    if (!c) return;
    c.ventas += m.cantidad * (m.precio_unitario ?? porId.get(m.equipo_id)?.precio ?? 0);
    c.piezas += m.cantidad;
  });

  $("dash-serie-sub").textContent = { dia: "Por día", semana: "Por semana (desde el lunes)", mes: "Por mes" }[paso];
  const filas = [...cubetas.entries()];
  const max = Math.max(...filas.map(([, c]) => c.ventas), 0);
  if (!max) {
    $("dash-serie").innerHTML = `<p class="grafica-vacia">Aún no hay ventas en este periodo. Se registran como <b>Baja · Venta</b> en Inventario.</p>`;
    return;
  }
  const mesCorto = new Intl.DateTimeFormat("es-MX", { month: "short", year: "2-digit" });
  const etiqueta = iso => paso === "mes" ? mesCorto.format(new Date(iso + "T12:00:00")) : fechaCorta(iso);
  const cada = Math.ceil(filas.length / 6); // ~6 etiquetas en el eje
  $("dash-serie").innerHTML = `
    <div class="barras-v" style="--n:${filas.length}">
      <span class="eje-max">${pesos(max)}</span>
      ${filas.map(([iso, c], i) => `
        <span class="barra-v" tabindex="0" style="--h:${(c.ventas / max * 100).toFixed(1)}%"
          aria-label="${esc(etiqueta(iso))}: ${esc(pesos(c.ventas))}, ${c.piezas} piezas">
          <i></i>
          <span class="tip" role="presentation"><b>${esc(pesos(c.ventas))}</b>${c.piezas} pieza${c.piezas === 1 ? "" : "s"}<br>${paso === "semana" ? "Semana del " : ""}${esc(etiqueta(iso))}</span>
          ${i % cada === 0 ? `<small>${esc(etiqueta(iso))}</small>` : ""}
        </span>`).join("")}
    </div>`;
}

function renderCategorias(lista) {
  const grupos = new Map();
  lista.filter(p => p.ventas > 0).forEach(p => {
    const k = `${p.seccion}|${p.categoria}`;
    const g = grupos.get(k) || { seccion: p.seccion, categoria: p.categoria, ventas: 0, utilidad: 0, conCosto: 0 };
    g.ventas += p.ventas;
    if (p.utilidad != null) { g.utilidad += p.utilidad; g.conCosto += p.ventasConCosto; }
    grupos.set(k, g);
  });
  const filas = [...grupos.values()].sort((a, b) => b.ventas - a.ventas);
  if (!filas.length) {
    $("dash-categorias").innerHTML = `<p class="grafica-vacia">Sin ventas en este periodo.</p>`;
    return;
  }
  const max = filas[0].ventas;
  const variasSecciones = new Set(filas.map(f => f.seccion)).size > 1;
  $("dash-categorias").innerHTML = `<ul class="barras-h">${filas.map(g => {
    const nombre = (categoria(g.categoria)?.label || g.categoria) + (variasSecciones ? ` · ${seccion(g.seccion)?.label || ""}` : "");
    const margen = g.conCosto ? ` · margen ${pct(g.utilidad / g.conCosto)}` : "";
    return `<li>
      <span class="barra-h-nombre">${esc(nombre)}</span>
      <span class="barra-h-pista"><i style="--w:${(g.ventas / max * 100).toFixed(1)}%"></i></span>
      <span class="barra-h-valor">${pesos(g.ventas)}<small>${g.conCosto ? `utilidad ${pesos(g.utilidad)}${margen}` : "sin costo"}</small></span>
    </li>`;
  }).join("")}</ul>`;
}

const COLUMNAS = [
  { id: "codigo", label: "Código", txt: true },
  { id: "nombre", label: "Producto", txt: true },
  { id: "existencia", label: "Existencia" },
  { id: "vendidas", label: "Vendidas" },
  { id: "ventas", label: "Ventas" },
  { id: "utilidad", label: "Utilidad" },
  { id: "margen", label: "Margen" },
  { id: "porMes", label: "Rotación", ayuda: "Piezas vendidas por mes" },
  { id: "diasInv", label: "Días stock", ayuda: "Cuántos días alcanza la existencia al ritmo de venta actual" },
  { id: "ultimaVenta", label: "Última venta", txt: true },
  { id: "clase", label: "Clasificación", txt: true },
];

function renderTabla(lista) {
  const cuenta = id => lista.filter(p => p.clase === id).length;
  $("dash-clases").innerHTML = [{ id: "todas", label: "Todas" }, { id: "resurtir", label: "Por resurtir" }, ...CLASES]
    .map(c => {
      const n = c.id === "todas" ? lista.length : c.id === "resurtir" ? lista.filter(p => p.resurtir).length : cuenta(c.id);
      return n || c.id === "todas" || c.id === est.clase
        ? `<button type="button" class="filtro" data-clase="${c.id}" aria-pressed="${c.id === est.clase}">${esc(c.label)}<span class="n">${n}</span></button>`
        : "";
    }).join("");

  const filas = lista
    .filter(p => est.clase === "todas" || (est.clase === "resurtir" ? p.resurtir : p.clase === est.clase))
    .sort((a, b) => {
      const col = COLUMNAS.find(c => c.id === est.orden);
      let x = a[est.orden], y = b[est.orden];
      if (x == null && y == null) return 0;
      if (x == null) return 1;   // vacíos siempre al final
      if (y == null) return -1;
      const r = col?.txt ? String(x).localeCompare(String(y), "es", { numeric: true }) : x - y;
      return est.desc ? -r : r;
    });

  const flecha = id => (id === est.orden ? (est.desc ? " ↓" : " ↑") : "");
  const aria = id => (id === est.orden ? `aria-sort="${est.desc ? "descending" : "ascending"}"` : "");
  const num = (v, f) => (v == null ? `<span class="tenue">—</span>` : f(v));

  $("dash-tabla").innerHTML = `
    <thead><tr>${COLUMNAS.map(c => `<th scope="col" ${aria(c.id)} class="${c.txt ? "" : "num"}"><button type="button" data-orden="${c.id}" ${c.ayuda ? `title="${esc(c.ayuda)}"` : ""}>${esc(c.label)}${flecha(c.id)}</button></th>`).join("")}</tr></thead>
    <tbody>${filas.map(p => `
      <tr>
        <td class="codigo">${esc(p.codigo || "—")}</td>
        <td><strong>${esc(p.nombre)}</strong><small>${esc(categoria(p.categoria)?.label || p.categoria || "")}${p.vivo ? "" : " · eliminada"}</small></td>
        <td class="num">${p.vivo ? entero(p.existencia) : "—"}${p.resurtir ? `<small class="alerta-txt">Resurtir</small>` : ""}</td>
        <td class="num">${entero(p.vendidas)}</td>
        <td class="num">${pesos(p.ventas)}</td>
        <td class="num">${num(p.utilidad, pesos)}</td>
        <td class="num">${p.margen != null ? pct(p.margen) : p.margenEsperado != null ? `<span class="tenue" title="Margen según precio y costo; aún sin ventas">${pct(p.margenEsperado)}*</span>` : `<span class="tenue">—</span>`}</td>
        <td class="num">${p.vendidas ? (p.porMes < 10 ? p.porMes.toFixed(1) : entero(Math.round(p.porMes))) + "/mes" : `<span class="tenue">0</span>`}</td>
        <td class="num">${num(p.diasInv, d => entero(Math.round(d)))}</td>
        <td>${p.ultimaVenta ? fechaCorta(p.ultimaVenta) : `<span class="tenue">—</span>`}</td>
        <td><span class="clase clase-${p.clase}">${esc(claseLabel(p.clase))}</span></td>
      </tr>`).join("")}
    </tbody>`;
  if (!filas.length) $("dash-tabla").innerHTML += `<tbody><tr><td colspan="${COLUMNAS.length}" class="tenue">Ningún producto con este filtro.</td></tr></tbody>`;
}

/* ---------- Eventos ---------- */
$("dash-periodos").addEventListener("click", e => {
  const b = e.target.closest("[data-periodo]");
  if (b) { est.periodo = b.dataset.periodo; render(); }
});
["dash-desde", "dash-hasta"].forEach(id => $(id).addEventListener("input", render));
$("dash-seccion").addEventListener("change", e => { est.seccion = e.target.value; render(); });
$("dash-categoria").addEventListener("change", e => { est.categoria = e.target.value; render(); });
$("dash-clases").addEventListener("click", e => {
  const b = e.target.closest("[data-clase]");
  if (b) { est.clase = b.dataset.clase; render(); }
});
$("dash-tabla").addEventListener("click", e => {
  const b = e.target.closest("[data-orden]");
  if (!b) return;
  const id = b.dataset.orden;
  if (est.orden === id) est.desc = !est.desc;
  else { est.orden = id; est.desc = !COLUMNAS.find(c => c.id === id)?.txt; }
  render();
});

alCambiar(render);
