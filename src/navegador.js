// Navegador interno: abre un proyecto dentro de la página, en una ventana con
// apariencia de navegador, sin redirigir ni mostrar su dirección.
// Si el proyecto tiene galería (capturas de adentro de un sistema con inicio de
// sesión), se muestra primero la galería y un selector para pasar a "En vivo".
// Nota: la URL queda oculta a la vista, no es secreta (está en el código de la página).
import { icono } from "./iconos.js";

let dlg, iframe, titulo, cargando, aviso, temporizador;
let galeria, galImg, galPuntos, galContador;
let fotos = [], actual = 0, urlVivo = null;

function crear() {
  dlg = document.createElement("dialog");
  dlg.className = "navegador";
  dlg.setAttribute("aria-labelledby", "nav-titulo");
  dlg.innerHTML = `
    <div class="nav-barra">
      <div class="nav-luces" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="nav-direccion">
        ${icono("candado")}
        <span id="nav-titulo"></span>
      </div>
      <div class="nav-acciones">
        <div class="nav-vistas" role="group" aria-label="Qué ver">
          <button type="button" data-vista="galeria" aria-pressed="true">${icono("galeria")}<span>Capturas</span></button>
          <button type="button" data-vista="vivo" aria-pressed="false">${icono("ojo")}<span>En vivo</span></button>
        </div>
        <div class="nav-modos" role="group" aria-label="Tamaño de pantalla">
          <button type="button" data-modo="escritorio" aria-pressed="true" aria-label="Vista de escritorio">${icono("monitor")}</button>
          <button type="button" data-modo="celular" aria-pressed="false" aria-label="Vista de celular">${icono("celulares")}</button>
        </div>
        <button type="button" data-nav="recargar" aria-label="Recargar">${icono("recargar")}</button>
        <button type="button" data-nav="cerrar" aria-label="Cerrar vista">${icono("cerrar")}</button>
      </div>
    </div>
    <div class="nav-lienzo">
      <div class="nav-marco">
        <iframe title="Vista del proyecto" referrerpolicy="no-referrer" allow="fullscreen"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"></iframe>
        <div class="nav-cargando" role="status">
          <span class="nav-giro" aria-hidden="true"></span>
          <span>Cargando proyecto…</span>
        </div>
      </div>
      <div class="nav-galeria" hidden>
        <figure class="gal-foto"><img alt="" decoding="async" /></figure>
        <div class="gal-pie">
          <button type="button" class="gal-flecha gal-ant" data-gal="-1" aria-label="Captura anterior">${icono("izquierda")}</button>
          <div class="gal-puntos"></div>
          <span class="gal-contador" aria-live="polite"></span>
          <button type="button" class="gal-flecha gal-sig" data-gal="1" aria-label="Captura siguiente">${icono("derecha")}</button>
        </div>
      </div>
    </div>
    <p class="nav-aviso" hidden>Está tardando. Si el sitio no aparece, puede que no permita mostrarse dentro de otra página.</p>`;
  document.body.appendChild(dlg);

  iframe = dlg.querySelector("iframe");
  titulo = dlg.querySelector("#nav-titulo");
  cargando = dlg.querySelector(".nav-cargando");
  aviso = dlg.querySelector(".nav-aviso");
  galeria = dlg.querySelector(".nav-galeria");
  galImg = galeria.querySelector("img");
  galPuntos = galeria.querySelector(".gal-puntos");
  galContador = galeria.querySelector(".gal-contador");

  iframe.addEventListener("load", () => {
    if (iframe.src === "about:blank" || !dlg.open) return;
    cargando.hidden = true;
    aviso.hidden = true;
    clearTimeout(temporizador);
  });

  dlg.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (e.target === dlg) return dlg.close(); // clic en el fondo
    if (!b) return;
    if (b.dataset.nav === "cerrar") dlg.close();
    if (b.dataset.nav === "recargar") cargar(urlVivo);
    if (b.dataset.modo) modo(b.dataset.modo);
    if (b.dataset.vista) vista(b.dataset.vista);
    if (b.dataset.gal) mostrar(actual + Number(b.dataset.gal));
    if (b.dataset.punto) mostrar(Number(b.dataset.punto));
  });

  dlg.addEventListener("keydown", e => {
    if (galeria.hidden) return;
    if (e.key === "ArrowLeft") { e.preventDefault(); mostrar(actual - 1); }
    if (e.key === "ArrowRight") { e.preventDefault(); mostrar(actual + 1); }
  });

  // Deslizar con el dedo en celular
  let inicioX = null;
  galeria.addEventListener("pointerdown", e => { if (e.pointerType !== "mouse") inicioX = e.clientX; });
  galeria.addEventListener("pointerup", e => {
    if (inicioX === null) return;
    const dx = e.clientX - inicioX;
    inicioX = null;
    if (Math.abs(dx) > 40) mostrar(actual + (dx < 0 ? 1 : -1));
  });
  galeria.addEventListener("pointercancel", () => (inicioX = null));

  // Al cerrar se descarga el sitio (detiene videos, sonidos y consumo de datos)
  dlg.addEventListener("close", () => {
    clearTimeout(temporizador);
    iframe.src = "about:blank";
    document.documentElement.classList.remove("nav-abierto");
  });
}

function modo(m) {
  dlg.dataset.modo = m;
  dlg.querySelectorAll("[data-modo]").forEach(b => b.setAttribute("aria-pressed", b.dataset.modo === m));
}

function vista(v) {
  dlg.dataset.vista = v;
  dlg.querySelectorAll("[data-vista]").forEach(b => b.setAttribute("aria-pressed", b.dataset.vista === v));
  galeria.hidden = v !== "galeria";
  if (v === "galeria") {
    clearTimeout(temporizador);
    aviso.hidden = true;
    galeria.querySelector(".gal-sig").focus({ preventScroll: true });
  } else if (iframe.dataset.url !== urlVivo) {
    cargar(urlVivo); // el sitio en vivo se carga solo cuando se pide
  }
}

function mostrar(i) {
  if (!fotos.length) return;
  actual = (i + fotos.length) % fotos.length;
  galImg.src = fotos[actual];
  galImg.alt = `${titulo.textContent}: captura ${actual + 1} de ${fotos.length}`;
  galContador.textContent = `${actual + 1} / ${fotos.length}`;
  galPuntos.querySelectorAll("button").forEach((b, j) => b.setAttribute("aria-current", j === actual));
  new Image().src = fotos[(actual + 1) % fotos.length]; // precarga la siguiente
}

function cargar(url) {
  cargando.hidden = false;
  aviso.hidden = true;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => (aviso.hidden = false), 12000);
  iframe.dataset.url = url;
  iframe.src = url;
}

export function abrirNavegador({ nombre, url, galeria: capturas = [] }) {
  if (!url && !capturas.length) return;
  if (!dlg) crear();
  titulo.textContent = nombre;
  iframe.title = `Vista de ${nombre}`;
  iframe.dataset.url = "";
  urlVivo = url || null;
  fotos = capturas;
  actual = 0;

  galPuntos.innerHTML = fotos.map((_, j) =>
    `<button type="button" data-punto="${j}" aria-label="Captura ${j + 1}"></button>`).join("");
  dlg.classList.toggle("con-galeria", fotos.length > 0);
  dlg.classList.toggle("con-vivo", !!urlVivo);
  galeria.classList.toggle("una", fotos.length < 2);

  modo(matchMedia("(max-width: 720px)").matches ? "celular" : "escritorio");
  document.documentElement.classList.add("nav-abierto");
  dlg.showModal();
  if (fotos.length) {
    mostrar(0);
    vista("galeria");
  } else {
    vista("vivo");
  }
}
