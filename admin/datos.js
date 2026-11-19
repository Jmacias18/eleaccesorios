// Estado compartido entre las vistas del panel (Piezas, Inventario, Movimientos, Dashboard).
// main.js es dueño de la lista de piezas; inventario.js de los movimientos.
import { supabase } from "../src/supabase.js";

export const datos = {
  equipos: [],
  movimientos: [],
  movimientosCargados: false,
  ubicaciones: [],      // Casa + colectivos (todas, también inactivas)
  existencias: [],      // { equipo_id, ubicacion_id, cantidad }
  // main.js lo reemplaza: actualiza una pieza en su lista y vuelve a pintar
  reemplazarEquipo: () => {},
};

const oyentes = new Set();
export const alCambiar = fn => oyentes.add(fn);
export const avisarCambio = () => oyentes.forEach(fn => fn());

export async function cargarMovimientos() {
  const { data, error } = await supabase
    .from("movimientos")
    .select("*")
    .order("fecha", { ascending: false })
    .order("creado_en", { ascending: false })
    .limit(10000);
  if (error) throw error;
  datos.movimientos = data;
  datos.movimientosCargados = true;
  avisarCambio();
}

export async function cargarUbicaciones() {
  const [u, x] = await Promise.all([
    supabase.from("ubicaciones").select("*").order("orden").order("creado_en"),
    supabase.from("existencias").select("*"),
  ]);
  if (u.error) throw u.error;
  if (x.error) throw x.error;
  datos.ubicaciones = u.data;
  datos.existencias = x.data;
  avisarCambio();
}

// Vuelve a leer una pieza y sus existencias (las cambia la base al registrar movimientos)
export async function refrescarEquipo(id) {
  const [e, x] = await Promise.all([
    supabase.from("equipos").select("*").eq("id", id).single(),
    supabase.from("existencias").select("*").eq("equipo_id", id),
  ]);
  if (!x.error && x.data) datos.existencias = [...datos.existencias.filter(r => r.equipo_id !== id), ...x.data];
  if (!e.error && e.data) datos.reemplazarEquipo(e.data);
  else avisarCambio();
}

/* ---------- Ubicaciones ---------- */
export const ubicacion = id => datos.ubicaciones.find(u => u.id === id);
export const ubicacionesActivas = () => datos.ubicaciones.filter(u => u.activa);
export const hayUbicaciones = () => datos.ubicaciones.length > 0;
export const cantidadEn = (equipoId, ubicId) =>
  datos.existencias.find(r => r.equipo_id === equipoId && r.ubicacion_id === ubicId)?.cantidad || 0;
// [{ u, n }] de una pieza, solo donde hay
export const repartoDe = equipoId => ubicacionesActivas()
  .map(u => ({ u, n: cantidadEn(equipoId, u.id) }))
  .filter(r => r.n > 0);
export const casaId = () => datos.ubicaciones.find(u => u.tipo === "casa")?.id;

/* ---------- Utilidades de fechas y formato ---------- */
export const hoyISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const sumarDias = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
export const diasEntre = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);

const fmtFecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });
const fmtFechaCorta = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" });
export const fecha = iso => (iso ? fmtFecha.format(new Date(iso + "T12:00:00")) : "—");
export const fechaCorta = iso => (iso ? fmtFechaCorta.format(new Date(iso + "T12:00:00")) : "—");

export const pesos = n =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);
export const entero = n => new Intl.NumberFormat("es-MX").format(n || 0);

export const MOTIVOS = {
  alta: [
    { id: "compra", label: "Compra / llegó mercancía" },
    { id: "devolucion", label: "Devolución de cliente" },
    { id: "ajuste", label: "Ajuste (conteo)" },
    { id: "inicial", label: "Inventario inicial" },
  ],
  baja: [
    { id: "venta", label: "Venta" },
    { id: "merma", label: "Merma / dañada / perdida" },
    { id: "ajuste", label: "Ajuste (conteo)" },
  ],
  traspaso: [
    { id: "traspaso", label: "Traspaso" },
  ],
};
export const motivoLabel = (tipo, id) => MOTIVOS[tipo]?.find(m => m.id === id)?.label.split(" /")[0].split(" (")[0] || id;

// Rango de fechas por periodo: devuelve [desde, hasta] en ISO (desde = null → sin límite)
export const PERIODOS = [
  { id: "7", label: "7 días" },
  { id: "30", label: "30 días" },
  { id: "90", label: "90 días" },
  { id: "mes", label: "Este mes" },
  { id: "anio", label: "Este año" },
  { id: "todo", label: "Todo" },
  { id: "rango", label: "Fechas…" },
];
export function rangoDe(periodo, desde, hasta) {
  const hoy = hoyISO();
  if (periodo === "todo") return [null, hoy];
  if (periodo === "mes") return [hoy.slice(0, 8) + "01", hoy];
  if (periodo === "anio") return [hoy.slice(0, 5) + "01-01", hoy];
  if (periodo === "rango") return [desde || null, hasta || hoy];
  return [sumarDias(hoy, -(Number(periodo) - 1)), hoy];
}
export const enRango = (iso, [desde, hasta]) => (!desde || iso >= desde) && (!hasta || iso <= hasta);

export const normalizar = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
