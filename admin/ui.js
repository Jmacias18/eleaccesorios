// Piezas de interfaz compartidas por las secciones del panel (equipos y proyectos).
import { icono } from "../src/iconos.js";
import { esc } from "../src/catalogo.js";

export const $ = id => document.getElementById(id);

export const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB";

// Mensaje de error con ícono (no depende solo del color)
export const htmlError = msg => (msg ? icono("alerta") + `<span>${esc(msg)}</span>` : "");

/* ---------- Aviso flotante ---------- */
let avisoTimer;
export function aviso(msg, esError = false) {
  const el = $("aviso");
  el.textContent = msg;
  el.classList.toggle("error-aviso", esError);
  el.classList.add("visible");
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => el.classList.remove("visible"), esError ? 7000 : 4000);
}

/* ---------- Guardando: mientras haya una operación en curso, los diálogos no se cierran ---------- */
let ocupado = false;
export const setOcupado = v => (ocupado = v);

/* ---------- Confirmación de eliminar (reutilizable) ---------- */
const dlgEliminar = $("dlg-eliminar");
let accionEliminar = null;

// accion: async () => false si falló (el diálogo queda abierto)
export function confirmarEliminar({ nombre, nota = "", accion }) {
  accionEliminar = accion;
  $("eliminar-nombre").textContent = nombre;
  $("eliminar-nota").innerHTML = nota; // texto fijo del código, no del usuario
  $("eliminar-nota").hidden = !nota;
  dlgEliminar.showModal();
}

$("btn-confirmar-eliminar").addEventListener("click", async e => {
  const btn = e.currentTarget;
  btn.disabled = true;
  btn.textContent = "Eliminando…";
  setOcupado(true);
  try {
    if ((await accionEliminar()) !== false) dlgEliminar.close();
  } finally {
    setOcupado(false);
    btn.disabled = false;
    btn.textContent = "Eliminar";
  }
});

/* ---------- Cierre de diálogos ---------- */
// Botones [data-cerrar] y Escape (nativo). Clic en el fondo solo cierra la confirmación,
// para no perder lo escrito en un formulario por un toque accidental.
document.querySelectorAll("dialog").forEach(d => {
  d.addEventListener("click", e => {
    if (ocupado) return;
    if (e.target.closest("[data-cerrar]") || (e.target === d && d === dlgEliminar)) d.close();
  });
  d.addEventListener("cancel", e => ocupado && e.preventDefault());
});
