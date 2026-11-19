import { supabase, configurado } from "../src/supabase.js";
import { SECCIONES, CONDICIONES, subcategoriasDe, seccion, categoria, condicion, textoPrecio, esc } from "../src/catalogo.js";
import * as fotos from "../src/fotos.js";
import { icono } from "../src/iconos.js";
import { $, aviso, kb, htmlError, setOcupado, confirmarEliminar } from "./ui.js";
import { datos, avisarCambio, cargarMovimientos, cargarUbicaciones, refrescarEquipo, normalizar, entero } from "./datos.js";
import { abrirMovimiento } from "./inventario.js";
import "./dashboard.js";
import "./colectivos.js";

// <span data-ico="nombre"> → SVG
document.querySelectorAll("[data-ico]").forEach(el => (el.outerHTML = icono(el.dataset.ico, `ico ${el.className}`.trim())));

/* ==========================================================
   Vistas y sesión
   ========================================================== */
const vistas = {
  login: $("vista-login"),
  panel: $("vista-panel"),
  config: $("vista-config"),
};

function mostrar(nombre) {
  Object.entries(vistas).forEach(([k, el]) => (el.hidden = k !== nombre));
}

// Pestañas del panel: #piezas, #inventario, #colectivos, #movimientos, #dashboard
const VISTAS_PANEL = ["piezas", "inventario", "colectivos", "movimientos", "dashboard"];
function mostrarPestana() {
  const actual = VISTAS_PANEL.includes(location.hash.slice(1)) ? location.hash.slice(1) : "piezas";
  VISTAS_PANEL.forEach(v => ($("vista-" + v).hidden = v !== actual));
  document.querySelectorAll(".pestana").forEach(a => {
    if (a.dataset.vista === actual) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.body.dataset.vista = actual;
  avisarCambio();
}
addEventListener("hashchange", () => {
  mostrarPestana();
  scrollTo(0, 0);
});

function errorLogin(msg) {
  const el = $("error-login");
  el.textContent = msg || "";
  el.hidden = !msg;
}

const MENSAJES = {
  "Invalid login credentials": "Correo o contraseña incorrectos.",
  "Email not confirmed": "El correo no está confirmado en Supabase.",
};

// Solo el UID configurado en es_admin() puede usar el panel.
async function esAdmin() {
  const { data, error } = await supabase.rpc("es_admin");
  return !error && data === true;
}

async function entrarAlPanel(session) {
  if (!(await esAdmin())) {
    await supabase.auth.signOut();
    mostrar("login");
    errorLogin("Esta cuenta no tiene acceso al panel.");
    return;
  }
  $("correo-sesion").textContent = session.user.email;
  mostrar("panel");
  mostrarPestana();
  cargarEquipos();
  // Sin supabase/ubicaciones.sql el panel sigue funcionando, solo sin colectivos
  cargarUbicaciones().catch(err => console.warn("Ubicaciones no disponibles:", err.message));
  cargarMovimientos().catch(err => {
    console.error(err);
    aviso("No se pudieron cargar los movimientos. ¿Ya corriste supabase/inventario.sql?", true);
  });
}

async function iniciar() {
  if (!configurado) return mostrar("config");

  const { data: { session } } = await supabase.auth.getSession();
  if (session) await entrarAlPanel(session);
  else mostrar("login");

  supabase.auth.onAuthStateChange((evento) => {
    if (evento === "SIGNED_OUT") mostrar("login");
  });
}

$("form-login").addEventListener("submit", async e => {
  e.preventDefault();
  const form = e.currentTarget;
  const correo = form.correo.value.trim();
  const contrasena = form.contrasena.value;
  if (!correo || !contrasena) return errorLogin("Escribe tu correo y contraseña.");

  const btn = $("btn-entrar");
  btn.disabled = true;
  btn.textContent = "Entrando…";
  errorLogin("");

  const { data, error } = await supabase.auth.signInWithPassword({ email: correo, password: contrasena });

  btn.disabled = false;
  btn.textContent = "Entrar";

  if (error) return errorLogin(MENSAJES[error.message] || "No se pudo iniciar sesión. Intenta de nuevo.");
  form.contrasena.value = "";
  await entrarAlPanel(data.session);
});

$("ver-contrasena").addEventListener("click", e => {
  const input = $("form-login").contrasena;
  const ver = input.type === "password";
  input.type = ver ? "text" : "password";
  e.currentTarget.textContent = ver ? "Ocultar" : "Ver";
  e.currentTarget.setAttribute("aria-label", ver ? "Ocultar contraseña" : "Mostrar contraseña");
});

$("btn-salir").addEventListener("click", () => supabase.auth.signOut());

/* ==========================================================
   Lista de piezas
   ========================================================== */
let equipos = [];
let filtroEstado = "todos";

// Filtros de la lista de piezas
const FILTROS = [
  { id: "todos", label: "Todas", si: () => true },
  { id: "tienda", label: "En la tienda", si: e => e.estado !== "vendido" },
  { id: "sin-stock", label: "Sin stock", si: e => (e.existencia ?? 0) === 0 },
  { id: "ocultas", label: "Ocultas", si: e => e.estado === "vendido" },
];
const filtro = id => FILTROS.find(f => f.id === id) || FILTROS[0];

// "Mostrar en la tienda": estado = disponible (se muestra) o vendido (oculta). "apartado" ya no se usa.
const VISIBILIDAD = [
  { id: "disponible", label: "Sí, mostrar" },
  { id: "vendido", label: "No, ocultar" },
];

const ESQUELETO = `
  <li class="equipo cargando" aria-hidden="true">
    <div class="miniatura skeleton"></div>
    <div class="equipo-info">
      <span class="sk skeleton" style="width:70%"></span>
      <span class="sk skeleton" style="width:40%"></span>
      <span class="sk skeleton" style="width:30%"></span>
    </div>
  </li>`;

let accionVacio = null;
function mostrarVacio(titulo, texto, boton, accion) {
  $("vacio-titulo").textContent = titulo;
  $("vacio-texto").textContent = texto;
  $("vacio-accion").textContent = boton;
  accionVacio = accion;
  $("vacio").hidden = false;
}
$("vacio-accion").addEventListener("click", () => accionVacio?.());

async function cargarEquipos() {
  $("resumen").textContent = "Cargando piezas…";
  $("vacio").hidden = true;
  $("lista").setAttribute("aria-busy", "true");
  $("lista").innerHTML = ESQUELETO.repeat(4);

  const { data, error } = await supabase.from("equipos").select("*").order("creado_en", { ascending: false });
  $("lista").setAttribute("aria-busy", "false");
  if (error) {
    $("lista").innerHTML = "";
    $("resumen").textContent = "No se pudieron cargar las piezas.";
    return mostrarVacio("No se pudo conectar", "Revisa tu conexión a internet e inténtalo de nuevo.", "Reintentar", cargarEquipos);
  }
  equipos = data;
  render();
}
datos.reemplazarEquipo = fila => reemplazar(fila);

function render() {
  datos.equipos = equipos;
  avisarCambio();
  const cuenta = id => equipos.filter(filtro(id).si).length;
  $("filtros").innerHTML = FILTROS
    .map(f => `<button type="button" class="filtro" data-estado="${f.id}" aria-pressed="${f.id === filtroEstado}">${f.label}<span class="n">${cuenta(f.id)}</span></button>`)
    .join("");

  const enStock = equipos.filter(e => e.estado !== "vendido" && e.existencia > 0).length;
  $("resumen").textContent = `${equipos.length} en total · ${enStock} en stock en la tienda`;

  const texto = $("buscar").value.trim();
  const q = normalizar(texto);
  const visibles = equipos.filter(e =>
    filtro(filtroEstado).si(e) &&
    (!q || normalizar(`${e.codigo ?? ""} ${e.nombre} ${e.descripcion ?? ""}`).includes(q))
  );

  $("lista").innerHTML = visibles.map(itemHtml).join("");
  $("vacio").hidden = true;
  if (visibles.length) return;

  if (!equipos.length) {
    mostrarVacio("Aún no tienes piezas", "Agrega la primera y aparecerá en la tienda al instante.", "Agregar pieza", () => abrirFormulario());
  } else if (q) {
    mostrarVacio(`Sin resultados para “${texto}”`, "Prueba con otra palabra, como el tipo de pieza o su código.", "Limpiar búsqueda", () => {
      $("buscar").value = "";
      render();
      $("buscar").focus();
    });
  } else {
    mostrarVacio(`Ninguna pieza en “${filtro(filtroEstado).label}”`, "Prueba con otro filtro.", "Ver todas", () => {
      filtroEstado = "todos";
      render();
    });
  }
}

function etiquetaStock(e) {
  if (e.estado === "vendido") return `<span class="etiqueta vendido">Oculta</span>`;
  const n = e.existencia ?? 0;
  if (n === 0) return `<span class="etiqueta apartado">Sin stock</span>`;
  return `<span class="etiqueta disponible">${entero(n)} en stock</span>`;
}

function itemHtml(e) {
  const cat = categoria(e.categoria);
  const cond = condicion(e.condicion);
  const vendido = e.estado === "vendido";
  const img = e.foto_url
    ? `<img src="${esc(e.foto_url)}" alt="" loading="lazy" />`
    : icono(e.categoria);
  return `
    <li class="equipo${vendido ? " es-vendido" : ""}" data-id="${e.id}">
      <div class="miniatura">${img}</div>
      <div class="equipo-info">
        <h3>${e.codigo ? `<span class="codigo">${esc(e.codigo)}</span> ` : ""}${esc(e.nombre)}</h3>
        <div class="equipo-meta">${esc([seccion(e.seccion)?.label, cat?.label || e.categoria].filter(Boolean).join(" · "))}${cond ? " · " + cond.label : ""}</div>
        <div class="equipo-fila">
          <span class="equipo-precio${e.precio == null ? " consultar" : ""}">${esc(textoPrecio(e))}</span>
          ${etiquetaStock(e)}
        </div>
      </div>
      <div class="equipo-acciones">
        <button type="button" class="btn btn-ghost btn-sm" data-accion="editar">Editar</button>
        <button type="button" class="btn btn-ghost btn-sm" data-accion="movimiento">Alta / baja</button>
        <button type="button" class="btn btn-ghost btn-sm btn-eliminar" data-accion="eliminar">Eliminar</button>
      </div>
    </li>`;
}

$("buscar").addEventListener("input", render);

$("filtros").addEventListener("click", e => {
  const b = e.target.closest("[data-estado]");
  if (!b) return;
  filtroEstado = b.dataset.estado;
  render();
});

$("lista").addEventListener("click", e => {
  const b = e.target.closest("[data-accion]");
  if (!b) return;
  const eq = equipos.find(x => x.id === b.closest("[data-id]").dataset.id);
  if (!eq) return;
  if (b.dataset.accion === "editar") abrirFormulario(eq);
  if (b.dataset.accion === "movimiento") abrirMovimiento({ equipo: eq });
  if (b.dataset.accion === "eliminar") pedirEliminar(eq);
});

function reemplazar(fila) {
  const i = equipos.findIndex(x => x.id === fila.id);
  if (i >= 0) equipos[i] = fila;
  else equipos.unshift(fila);
  render();
}

/* ==========================================================
   Eliminar (con confirmación)
   ========================================================== */
function pedirEliminar(eq) {
  confirmarEliminar({
    nombre: eq.nombre,
    nota: "Si solo se acabó, registra la <b>baja</b>: la tienda mostrará “No disponible” y queda en tu historial. Sus movimientos se conservan aunque la elimines.",
    accion: async () => {
      const { error } = await supabase.from("equipos").delete().eq("id", eq.id);
      if (error) {
        aviso("No se pudo eliminar. Inténtalo de nuevo.", true);
        return false;
      }
      if (eq.foto_url) await fotos.borrar(eq.foto_url);
      equipos = equipos.filter(x => x.id !== eq.id);
      render();
      aviso(`“${eq.nombre}” eliminado.`);
    },
  });
}

/* ==========================================================
   Formulario nuevo / editar
   ========================================================== */
const dlg = $("dlg-equipo");
const form = $("form-equipo");
let editando = null;      // pieza que se edita (null = nuevo)
let fotoNueva = null;     // Blob comprimido listo para subir
let quitarFoto = false;
let previewUrl = null;
let guardando = false;

const opciones = lista => lista.map(o => `<option value="${o.id}">${o.label}</option>`).join("");
$("sel-seccion").innerHTML = opciones(SECCIONES);
$("sel-condicion").insertAdjacentHTML("beforeend", opciones(CONDICIONES));
$("sel-estado").innerHTML = opciones(VISIBILIDAD);

// Las subcategorías dependen de la sección elegida (Mujer, Hombre o Accesorios).
function llenarSubcategorias(seccionId, valor = null) {
  $("sel-categoria").innerHTML = opciones(subcategoriasDe(seccionId));
  if (valor) form.categoria.value = valor;
}
form.seccion.addEventListener("change", () => llenarSubcategorias(form.seccion.value));

function abrirFormulario(eq = null) {
  editando = eq;
  fotoNueva = null;
  quitarFoto = false;
  form.reset();
  errorForm("");
  $("titulo-form").textContent = eq ? "Editar pieza" : "Nueva pieza";

  form.nombre.value = eq?.nombre || "";
  form.codigo.value = eq?.codigo || "";
  form.costo.value = eq?.costo ?? "";
  form.precio_mayoreo.value = eq?.precio_mayoreo ?? "";
  form.inv_minimo.value = eq?.inv_minimo || "";
  form.existencia.value = "";
  // La existencia de una pieza ya creada solo cambia con altas y bajas (queda registro)
  $("campo-existencia").hidden = !!eq;
  $("ayuda-existencia").hidden = !eq;
  $("ayuda-existencia").textContent = eq ? `Existencia actual: ${entero(eq.existencia ?? 0)}. Para cambiarla usa “Alta / baja”.` : "";
  form.seccion.value = eq?.seccion || "mujer";
  llenarSubcategorias(form.seccion.value, eq?.categoria || subcategoriasDe(form.seccion.value)[0]?.id);
  form.condicion.value = eq?.condicion || "";
  form.descripcion.value = eq?.descripcion || "";
  form.precio.value = eq?.precio ?? "";
  form.consultar.checked = eq ? eq.precio == null : false;
  form.desde.checked = !!eq?.desde;
  form.estado.value = eq?.estado === "vendido" ? "vendido" : "disponible";
  sincronizarPrecio();
  liberarPreview();
  pintarFoto(eq?.foto_url || null);
  $("foto-info").textContent = AYUDA_FOTO;

  dlg.showModal();
  if (!eq) form.nombre.focus({ preventScroll: true });
}

const AYUDA_FOTO = "Se comprime automáticamente.";

function errorForm(msg) {
  const el = $("error-form");
  el.innerHTML = htmlError(msg);
  el.hidden = !msg;
  ["nombre", "codigo", "precio"].forEach(n => errorCampo(n, ""));
}

// Error junto al campo, con ícono (no solo color) y aria-invalid.
function errorCampo(nombre, msg) {
  const el = $("err-" + nombre);
  el.innerHTML = htmlError(msg);
  el.hidden = !msg;
  form[nombre].setAttribute("aria-invalid", msg ? "true" : "false");
  if (msg) form[nombre].focus();
}
form.nombre.addEventListener("input", () => errorCampo("nombre", ""));
form.codigo.addEventListener("input", () => errorCampo("codigo", ""));
form.precio.addEventListener("input", () => errorCampo("precio", ""));

function sincronizarPrecio() {
  const consultar = form.consultar.checked;
  form.precio.disabled = consultar;
  form.desde.disabled = consultar;
  if (consultar) {
    form.desde.checked = false;
    errorCampo("precio", "");
  }
}
form.consultar.addEventListener("change", sincronizarPrecio);

function liberarPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
}

function pintarFoto(src) {
  $("foto-preview").innerHTML = src ? `<img src="${esc(src)}" alt="Vista previa de la foto" />` : icono("camara");
  $("foto-btn-texto").textContent = src ? "Cambiar foto" : "Agregar foto";
  $("foto-quitar").hidden = !src;
}

$("foto-input").addEventListener("change", async e => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  $("foto-info").textContent = "Comprimiendo…";
  try {
    fotoNueva = await fotos.comprimir(archivo);
    quitarFoto = false;
    liberarPreview();
    previewUrl = URL.createObjectURL(fotoNueva);
    pintarFoto(previewUrl);
    $("foto-info").textContent = `${kb(archivo.size)} → ${kb(fotoNueva.size)}`;
  } catch (err) {
    $("foto-info").textContent = AYUDA_FOTO;
    errorForm(err.message || "No se pudo leer la foto. Prueba con otra imagen.");
  }
});

$("foto-quitar").addEventListener("click", () => {
  fotoNueva = null;
  quitarFoto = true;
  liberarPreview();
  pintarFoto(null);
  $("foto-info").textContent = AYUDA_FOTO;
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  errorForm("");

  const nombre = form.nombre.value.trim();
  if (!nombre) return errorCampo("nombre", "Escribe el nombre de la pieza, por ejemplo “Collar corazón”.");
  const codigo = form.codigo.value.trim().toUpperCase() || null;
  if (codigo && equipos.some(x => x.id !== editando?.id && (x.codigo || "").toUpperCase() === codigo)) {
    return errorCampo("codigo", `El código ${codigo} ya lo tiene otra pieza.`);
  }
  const numero = v => (v === "" ? null : Math.max(0, Number(v)));
  const existenciaInicial = editando ? 0 : Math.floor(numero(form.existencia.value) || 0);

  let precio = null;
  if (!form.consultar.checked) {
    precio = form.precio.value === "" ? NaN : Number(form.precio.value);
    if (!Number.isFinite(precio) || precio < 0) {
      return errorCampo("precio", "Escribe el precio en pesos, o marca “Sin precio”.");
    }
  }

  const fila = {
    nombre,
    codigo,
    costo: numero(form.costo.value),
    precio_mayoreo: numero(form.precio_mayoreo.value),
    inv_minimo: Math.floor(numero(form.inv_minimo.value) || 0),
    seccion: form.seccion.value,
    categoria: form.categoria.value,
    condicion: form.condicion.value || null,
    descripcion: form.descripcion.value.trim() || null,
    precio,
    desde: precio != null && form.desde.checked,
    estado: form.estado.value,
  };

  ocupado(true);
  const fotoAnterior = editando?.foto_url || null;
  let fotoSubida = null;

  try {
    if (fotoNueva) {
      fotoSubida = await fotos.subir(fotoNueva);
      fila.foto_url = fotoSubida;
    } else if (quitarFoto) {
      fila.foto_url = null;
    }

    const consulta = editando
      ? supabase.from("equipos").update(fila).eq("id", editando.id)
      : supabase.from("equipos").insert(fila);
    const { data, error } = await consulta.select().single();
    if (error) throw error;

    // La foto vieja se borra solo cuando el cambio ya quedó guardado.
    if (fotoAnterior && (fotoSubida || quitarFoto)) await fotos.borrar(fotoAnterior);

    reemplazar(data);
    // Pieza nueva con existencia: se registra como alta "inicial" (la base suma la existencia)
    if (existenciaInicial > 0) {
      const { error: errMov } = await supabase.from("movimientos").insert({
        equipo_id: data.id, tipo: "alta", motivo: "inicial", cantidad: existenciaInicial, nota: "Existencia inicial",
      });
      if (errMov) aviso("La pieza se guardó, pero no su existencia inicial. Regístrala con “Alta / baja”.", true);
      await Promise.all([refrescarEquipo(data.id), cargarMovimientos().catch(() => {})]);
    }
    guardando = false;
    dlg.close();
    aviso(editando ? "Cambios guardados." : `“${data.nombre}” agregado.`);
  } catch (err) {
    if (fotoSubida) await fotos.borrar(fotoSubida);
    if (err.code === "23505") errorCampo("codigo", `El código ${codigo} ya lo tiene otra pieza.`);
    else errorForm("No se guardó. Revisa tu conexión e inténtalo de nuevo. (" + (err.message || err) + ")");
  } finally {
    ocupado(false);
  }
});

function ocupado(si) {
  guardando = si;
  setOcupado(si);
  const btn = $("btn-guardar");
  btn.disabled = si;
  btn.textContent = si ? "Guardando…" : "Guardar";
}

$("btn-nuevo").addEventListener("click", () => abrirFormulario());

dlg.addEventListener("close", liberarPreview);

iniciar();
