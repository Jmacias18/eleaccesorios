// Vitrina 3D: piezas acomodadas en tres niveles de un mueble de cristal y mármol claro.
// Los datos vienen de la tabla "equipos" (o del catálogo de prueba en desarrollo).
// Cada pieza muestra su foto (foto_url). Si no tiene, se dibuja el soporte de exhibición de su tipo.
// Nunca inventa piezas ni cantidades: solo dibuja lo que recibe.
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { money, condicion, categoria, seccion, esc } from "./catalogo.js";

gsap.registerPlugin(ScrollTrigger);

// Página de Facebook a la que van los clientes al pedir una pieza.
// Facebook no prellena el mensaje, así que el cliente escribe qué pieza le interesa.
const FACEBOOK_URL = "https://www.facebook.com/share/1A7EQFPz1g/?mibextid=wwXIfr";

// Niveles de arriba hacia abajo, según el encargo.
// Una categoría que no esté en ningún nivel cae en el inferior.
const NIVELES = [
  { id: "superior", titulo: "Collares y cadenas", categorias: ["collares"] },
  { id: "medio", titulo: "Aretes y pulseras", categorias: ["aretes", "arracadas", "pulseras", "brazaletes", "brazaletes-italianos", "relojes"] },
  { id: "inferior", titulo: "Anillos y accesorios", categorias: ["anillos", "charms", "bolsas", "llaveros", "otros"] },
];

// Soporte de exhibición según la categoría (se usa cuando la pieza no tiene foto)
const SOPORTE = {
  collares: "busto",
  aretes: "exhibidor",
  arracadas: "exhibidor",
  anillos: "cojin",
  pulseras: "cilindro",
  brazaletes: "cilindro",
  "brazaletes-italianos": "cilindro",
  relojes: "base",
  charms: "exhibidor",
  bolsas: "base",
  llaveros: "exhibidor",
  otros: "base",
};

// Profundidad de cada plano (px): repisa al fondo, piezas al frente
const Z_PIEZA = 18;
const Z_INICIO = -36;

// Ancho mínimo de cada pieza (px) para decidir cuántas caben en una fila. Debe coincidir con vitrina.css.
const ANCHO_MIN = { escritorio: 170, celular: 118 };

const reducirMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const esCelular = window.matchMedia("(max-width: 899px)");

// Profundidad 3D (mueble girado y cámara): solo en escritorio con mouse y sin "reducir movimiento"
function profundidad() {
  return !reducirMovimiento && !esCelular.matches && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
let entradaHecha = false;
let waLinkActual = () => "#";
let turno = 0;               // evita que un cambio de filtro viejo pinte encima de uno nuevo
let niveles = [];            // { cont, n } de la vitrina actual, para repartir al cambiar el ancho

const nivelDe = p => NIVELES.find(n => n.categorias.includes(p.categoria)) || NIVELES[NIVELES.length - 1];
const precioTexto = p => p.precio == null ? "Consultar precio" : (p.desde ? "desde " : "") + money(p.precio);
const disponibilidad = p => p.estado === "apartado" ? "Apartado · consultar" : "Disponible";

// Soporte de exhibición (sin foto). Solo forma y material; no es un icono de producto.
const soporteHtml = p => `<span class="pieza-soporte soporte-${SOPORTE[p.categoria] || "base"}" aria-hidden="true"></span>`;

// Estado visible de "imagen pendiente": nunca se inventa una foto para una pieza sin fotografía
const pendienteHtml = () => `<span class="pieza-pendiente">Foto pendiente</span>`;

// Foto del producto; si no hay, el soporte de su tipo
function fotoHtml(p) {
  return p.foto_url
    ? `<img src="${esc(p.foto_url)}" alt="" loading="lazy" decoding="async" />`
    : soporteHtml(p);
}

// Una pieza sobre su soporte. El wrapper lo anima GSAP; el botón se eleva con CSS.
function crearPieza(p) {
  const wrap = document.createElement("div");
  wrap.className = "pieza";
  wrap.innerHTML = `
    <button type="button" class="pieza-btn" aria-label="${esc(p.nombre)}. Ver detalle">
      <span class="pieza-img">
        <span class="pieza-foto ${p.foto_url ? "con-foto" : "sin-foto"}">${fotoHtml(p)}</span>
        ${p.foto_url ? '<span class="pieza-sombra" aria-hidden="true"></span>' : pendienteHtml()}
      </span>
      <span class="pieza-nombre">${esc(p.nombre)}</span>
    </button>
    <div class="pieza-ficha" aria-hidden="true">
      <strong>${esc(p.nombre)}</strong>
      <span class="pieza-ficha-precio">${precioTexto(p)}</span>
      <span class="pieza-ficha-disp ${p.estado === "apartado" ? "apartado" : ""}">${disponibilidad(p)}</span>
    </div>`;
  wrap.querySelector(".pieza-btn").addEventListener("click", () => abrirDetalle(p));
  // Si la foto no carga, se muestra el soporte en su lugar
  wrap.querySelector("img")?.addEventListener("error", e => {
    const foto = e.target.closest(".pieza-foto");
    foto.className = "pieza-foto sin-foto";
    foto.innerHTML = soporteHtml(p);
    foto.parentElement.querySelector(".pieza-sombra")?.remove();
    foto.parentElement.insertAdjacentHTML("beforeend", pendienteHtml());
  }, { once: true });
  return wrap;
}

// Detalle: un solo <dialog> reutilizado.
let detalle = null;
function abrirDetalle(p) {
  if (!detalle) {
    detalle = document.createElement("dialog");
    detalle.className = "detalle";
    detalle.addEventListener("click", e => { if (e.target === detalle) detalle.close(); });
    document.body.appendChild(detalle);
  }
  const sec = seccion(p.seccion)?.label || "";
  const cat = categoria(p.categoria)?.label || p.categoria;
  const cond = p.condicion ? condicion(p.condicion)?.label : null;
  detalle.innerHTML = `
    <button type="button" class="detalle-cerrar" aria-label="Cerrar">×</button>
    <div class="detalle-foto ${p.foto_url ? "con-foto" : "sin-foto"}">${fotoHtml(p)}${p.foto_url ? "" : pendienteHtml()}</div>
    <div class="detalle-texto">
      <span class="micro">${esc([sec, cat].filter(Boolean).join(" · "))}</span>
      <h2>${esc(p.nombre)}</h2>
      <p class="detalle-precio">${precioTexto(p)}</p>
      <p class="detalle-disp">
        <span class="detalle-chip ${p.estado === "apartado" ? "apartado" : ""}">${disponibilidad(p)}</span>
        ${cond ? `<span>${esc(cond)}</span>` : ""}
      </p>
      ${p.descripcion ? `<p class="detalle-desc">${esc(p.descripcion)}</p>` : ""}
      <div class="detalle-acciones">
        <a class="btn btn-tinta" href="${esc(FACEBOOK_URL)}" target="_blank" rel="noopener">Pedir por Facebook</a>
        <p class="detalle-nota">Escribe el nombre de la pieza y te confirmamos la disponibilidad por Facebook.</p>
      </div>
    </div>`;
  detalle.querySelector(".detalle-cerrar").addEventListener("click", () => detalle.close());
  detalle.showModal();
}

// Reparte las piezas de un nivel en filas equilibradas (sin una pieza sola en una fila)
function repartir({ cont, n }) {
  const gap = parseFloat(getComputedStyle(cont).columnGap) || 0;
  const ancho = cont.clientWidth;
  if (!ancho) return;
  const min = esCelular.matches ? ANCHO_MIN.celular : ANCHO_MIN.escritorio;
  const cuantasCaben = minimo => Math.max(1, Math.floor((ancho + gap) / (minimo + gap)));

  const filas = Math.ceil(n / cuantasCaben(min));
  let cols = Math.ceil(n / filas);
  // Si quedaría una pieza sola en la última fila, se intenta una columna más (piezas un poco más chicas)
  if (filas > 1 && n % cols === 1 && cols + 1 <= cuantasCaben(Math.round(min * 0.75))) cols += 1;
  cont.style.setProperty("--cols", cols);
}

const repartirTodo = () => niveles.forEach(repartir);
let tiempoRedimension = 0;
window.addEventListener("resize", () => {
  clearTimeout(tiempoRedimension);
  tiempoRedimension = setTimeout(repartirTodo, 120);
});

// Cámara: el mueble llega girado y se endereza mientras aparece el resto
function activarProfundidad(vitrina) {
  const marco = vitrina.querySelector(".marco");
  const girarX = gsap.quickTo(marco, "rotateX", { duration: 1, ease: "power3.out" });
  const girarY = gsap.quickTo(marco, "rotateY", { duration: 1, ease: "power3.out" });
  vitrina.addEventListener("pointermove", e => {
    const r = vitrina.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    girarY(-2 + x * 3);
    girarX(3 - y * 2.5);
  });
  vitrina.addEventListener("pointerleave", () => { girarX(3); girarY(-2); });
}

// Estado inicial de la entrada: mueble oculto, repisas sin desplegar, luces apagadas, piezas atrás y ocultas
function prepararEntrada(vitrina) {
  const marco = vitrina.querySelector(".marco");
  if (profundidad()) gsap.set(marco, { rotateX: 10 });
  gsap.set(marco, { autoAlpha: 0, y: 28, scale: 0.98 });
  gsap.set(vitrina.querySelectorAll(".repisa"), { scaleX: 0 });
  gsap.set(vitrina.querySelectorAll(".luz, .led"), { opacity: 0 });
  gsap.set(vitrina.querySelectorAll(".pieza"), { autoAlpha: 0, y: -30, z: Z_INICIO });
}

// Secuencia: mueble → repisas → luces LED → piezas que se deslizan hasta su lugar
function reproducirEntrada(vitrina) {
  const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
  if (profundidad()) tl.to(vitrina.querySelector(".marco"), { rotateX: 3, duration: 1.8, ease: "power2.out" }, 0);
  tl.to(vitrina.querySelector(".marco"), { autoAlpha: 1, y: 0, scale: 1, duration: 1 })
    .to(vitrina.querySelectorAll(".repisa"), { scaleX: 1, duration: 0.8, stagger: 0.18 }, "-=0.5")
    .to(vitrina.querySelectorAll(".led"), { opacity: 1, duration: 0.7, stagger: 0.18 }, "-=0.4")
    .to(vitrina.querySelectorAll(".luz"), { opacity: 1, duration: 0.9, stagger: 0.18 }, "<")
    .to(vitrina.querySelectorAll(".pieza"), { autoAlpha: 1, y: 0, z: Z_PIEZA, duration: 0.9, stagger: 0.1, ease: "power3.out" }, "-=0.9");
}

// Dibuja la vitrina con las piezas nuevas (sin animar la salida)
function pintar(contenedor, piezas) {
  contenedor.innerHTML = "";
  niveles = [];
  if (!piezas.length) return;

  const vitrina = document.createElement("div");
  vitrina.className = "vitrina";
  const marco = document.createElement("div");
  marco.className = "marco";

  NIVELES.forEach(n => {
    const de = piezas.filter(p => nivelDe(p) === n);
    if (!de.length) return; // niveles sin piezas no se dibujan: la vitrina se adapta
    const disponibles = de.filter(p => p.estado === "disponible").length;
    const nivel = document.createElement("div");
    nivel.className = "nivel";
    nivel.dataset.nivel = n.id;
    nivel.innerHTML = `
      <div class="nivel-cab">
        <h3>${esc(n.titulo)}</h3>
        <span class="stock">${disponibles} disponible${disponibles === 1 ? "" : "s"} · ${de.length} en vitrina</span>
      </div>
      <div class="nivel-piezas"></div>
      <div class="repisa" aria-hidden="true"></div>
      <div class="led" aria-hidden="true"></div>
      <div class="luz" aria-hidden="true"></div>`;
    const cont = nivel.querySelector(".nivel-piezas");
    de.forEach(p => cont.appendChild(crearPieza(p)));
    niveles.push({ cont, n: de.length });
    marco.appendChild(nivel);
  });

  vitrina.appendChild(marco);
  contenedor.appendChild(vitrina);
  repartirTodo();
  if (profundidad()) {
    gsap.set(marco, { rotateX: 3, rotateY: -2 });
    activarProfundidad(vitrina);
  }

  if (reducirMovimiento) {
    gsap.set(vitrina.querySelectorAll(".pieza"), { z: Z_PIEZA });
    return;
  }

  if (!entradaHecha) {
    // Primera vez: el mueble se anima cuando llega al área visible
    prepararEntrada(vitrina);
    const disparar = () => {
      if (entradaHecha) return;
      entradaHecha = true;
      reproducirEntrada(vitrina);
      disparador?.kill();
    };
    const disparador = ScrollTrigger.create({ trigger: vitrina, start: "top 85%", once: true, onEnter: disparar });
    // Si la vitrina ya está a la vista al dibujarse, la entrada arranca sin esperar un scroll
    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
      if (vitrina.getBoundingClientRect().top < window.innerHeight * 0.85) disparar();
    });
  } else {
    // Cambio de filtro: las piezas nuevas se acomodan una a una en su soporte
    gsap.fromTo(vitrina.querySelectorAll(".pieza"),
      { autoAlpha: 0, y: -18, z: Z_INICIO },
      { autoAlpha: 1, y: 0, z: Z_PIEZA, duration: 0.7, stagger: 0.06, ease: "power3.out" });
  }
}

// Lo comparte la vitrina WebGL (src/vitrina3d.js)
export { NIVELES, SOPORTE, nivelDe, precioTexto, disponibilidad, abrirDetalle };

// ----- Elección de vitrina: WebGL (Three.js, cargado bajo demanda) o la versión CSS como respaldo -----
// ?vitrina=css fuerza la versión CSS (útil para comparar o en equipos con problemas).
function soporta3d() {
  if (new URLSearchParams(location.search).get("vitrina") === "css") return false;
  if (navigator.connection?.saveData) return false;
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch { return false; }
}

let modo = null;          // "3d" | "css"
let vitrina3d = null;     // controlador de la escena cuando ya cargó
let cargando3d = null;
let pendiente = null;     // última petición mientras carga Three.js

function usarCss(contenedor, piezas) {
  modo = "css";
  vitrina3d = null;
  montarVitrinaCss(contenedor, piezas);
}

/**
 * Dibuja la vitrina dentro de `contenedor` con las piezas `piezas`.
 * `waLink(mensaje)` debe devolver el enlace de WhatsApp.
 */
export function montarVitrina(contenedor, piezas, waLink) {
  waLinkActual = waLink;
  if (modo === null) modo = soporta3d() ? "3d" : "css";
  if (modo === "css") return montarVitrinaCss(contenedor, piezas);
  if (vitrina3d) return vitrina3d.mostrar(piezas);

  pendiente = piezas;
  if (cargando3d) return;
  contenedor.innerHTML = `<div class="v3d-cargando" role="status">Encendiendo la vitrina…</div>`;
  cargando3d = import("./vitrina3d.js")
    .then(m => {
      vitrina3d = m.crearVitrina3D(contenedor, {
        // Si el navegador pierde WebGL, se vuelve a la vitrina CSS con las mismas piezas
        alFallar: actuales => usarCss(contenedor, actuales),
      });
      vitrina3d.mostrar(pendiente);
    })
    .catch(err => {
      console.error("Vitrina 3D no disponible; se usa la versión CSS", err);
      usarCss(contenedor, pendiente);
    });
}

function montarVitrinaCss(contenedor, piezas) {
  const mio = ++turno;
  const previa = contenedor.querySelectorAll(".vitrina .pieza");

  // Con la vitrina ya vista, las piezas anteriores se retiran antes de acomodar las nuevas
  if (previa.length && entradaHecha && !reducirMovimiento) {
    gsap.to(previa, {
      autoAlpha: 0, y: 12, duration: 0.18, stagger: 0.015, ease: "power1.in",
      onComplete: () => { if (mio === turno) pintar(contenedor, piezas); },
    });
  } else {
    pintar(contenedor, piezas);
  }
}
