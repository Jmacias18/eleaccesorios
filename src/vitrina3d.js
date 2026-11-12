// Vitrina WebGL (Three.js): mueble de mármol con perfiles de latón, repisas de cristal,
// fondo de terciopelo y soportes 3D por tipo de joya. Las fotos reales del inventario (foto_url)
// se montan en placas enmarcadas sobre cada soporte. Sin foto: placa "Foto pendiente" (nunca se inventa).
//
// Arquitectura (pensada para no castigar el rendimiento):
// - Este módulo y Three.js se cargan bajo demanda desde vitrina.js (chunk aparte).
// - Un solo <canvas> "sticky" del alto de la pantalla; la cámara recorre el mueble con el scroll.
//   El costo de dibujo no crece con el número de piezas visibles fuera de pantalla.
// - Se dibuja solo cuando algo cambia (scroll, puntero, animación) y nunca fuera de pantalla.
// - Luz: entorno PBR (RoomEnvironment) + una luz direccional con sombras que sigue a la cámara
//   + un foco que acompaña a la pieza señalada. Los "focos" de cada pieza y las sombras de contacto
//   son texturas suaves (truco de visualización arquitectónica, sin costo de luces extra).
// - Nombres, precios y disponibilidad son HTML encima del canvas: accesibles, nítidos y con foco de teclado.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { gsap } from "gsap";
import { NIVELES, SOPORTE, nivelDe, precioTexto, disponibilidad, abrirDetalle } from "./vitrina.js";
import { esc } from "./catalogo.js";
import "./styles/vitrina3d.css";

// ---------- Medidas del mueble (unidades = metros aproximados) ----------
const HUECO = 0.36;        // ancho de cada lugar en la repisa
const ALTO_PIEZA = 0.33;    // alto máximo de un soporte
// El alto de fila y la banda de título dependen del tamaño en pantalla de las etiquetas (ver construir)
const CORNISA = 0.12;
const ZOCALO = 0.16;
const PILAR = 0.07;
const VIDRIO = 0.02;       // grosor de la repisa de cristal
const FONDO_Z = -0.30;     // panel de terciopelo
const REPISA_Z0 = -0.31, REPISA_Z1 = 0.05;
const PIEZA_Z = -0.11;
const FRENTE_Z = 0.06;     // plano de referencia para convertir píxeles a metros
const MARGEN = 0.06;       // aire arriba y abajo del mueble
const FOV = 30;

const reducir = matchMedia("(prefers-reduced-motion: reduce)").matches;
const celular = () => matchMedia("(max-width: 899px)").matches;
const punteroFino = matchMedia("(hover: hover) and (pointer: fine)").matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- Texturas generadas (sin descargar imágenes) ----------
function lienzo(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}

// Ruido de valor periódico (repite sin costuras) para las vetas del mármol
function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function ruido(x, y, per) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const m = n => ((n % per) + per) % per;
  const a = hash(m(xi), m(yi)), b = hash(m(xi + 1), m(yi));
  const c = hash(m(xi), m(yi + 1)), d = hash(m(xi + 1), m(yi + 1));
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, per) {
  let t = 0, amp = 0.5, f = 1;
  for (let o = 0; o < 5; o++) { t += amp * ruido(x * f, y * f, per * f); amp *= 0.5; f *= 2; }
  return t;
}

function texturaMarmol() {
  const T = 512;
  const [c, ctx] = lienzo(T);
  const img = ctx.createImageData(T, T);
  const d = img.data;
  for (let y = 0; y < T; y++) {
    for (let x = 0; x < T; x++) {
      const u = x / T, v = y / T;
      const t = fbm(u * 4, v * 4, 4);
      const vena = Math.abs(Math.sin((u * 2 + v + t * 1.9) * Math.PI));
      const k = Math.pow(1 - vena, 9) * 0.5 + Math.pow(1 - vena, 48) * 0.45;
      const nube = (t - 0.5) * 14;
      const i = (y * T + x) * 4;
      d[i] = 247 + nube - k * 70;
      d[i + 1] = 242 + nube - k * 80;
      d[i + 2] = 232 + nube - k * 92;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Degradado radial: foco sobre el terciopelo y sombra de contacto bajo cada soporte
function texturaRadial(centro, borde) {
  const [c, ctx] = lienzo(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, centro);
  g.addColorStop(0.45, centro.replace(/[\d.]+\)$/, m => String(parseFloat(m) * 0.45) + ")"));
  g.addColorStop(1, borde);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Placa honesta para piezas sin fotografía
function texturaPendiente() {
  const [c, ctx] = lienzo(512, 400);
  ctx.fillStyle = "#f7f0e3";
  ctx.fillRect(0, 0, 512, 400);
  ctx.strokeStyle = "#b8955a";
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 22, 468, 356);
  ctx.fillStyle = "#7d6234";
  ctx.textAlign = "center";
  ctx.font = "italic 400 56px Georgia, 'Times New Roman', serif";
  ctx.fillText("Foto", 256, 186);
  ctx.fillText("pendiente", 256, 250);
  ctx.font = "400 22px Georgia, serif";
  ctx.fillStyle = "#9a8358";
  ctx.fillText("ELE ACCESORIOS", 256, 318);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- Materiales PBR (compartidos) ----------
function crearMateriales(alta) {
  const marmol = texturaMarmol();
  return {
    marmol: new THREE.MeshPhysicalMaterial({ map: marmol, roughness: 0.2, clearcoat: 0.55, clearcoatRoughness: 0.15 }),
    marmolBase: new THREE.MeshPhysicalMaterial({ map: marmol, color: 0xe6dccb, roughness: 0.3, clearcoat: 0.3 }),
    laton: new THREE.MeshStandardMaterial({ color: 0xd4ae68, metalness: 1, roughness: 0.27 }),
    terciopeloFondo: new THREE.MeshPhysicalMaterial({
      color: 0xb59a6e, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(0xf6e8c8), sheenRoughness: 0.4,
    }),
    terciopelo: new THREE.MeshPhysicalMaterial({
      color: 0xe6d6b8, roughness: 0.92, sheen: 1, sheenColor: new THREE.Color(0xfff6e2), sheenRoughness: 0.35,
    }),
    vidrio: alta
      ? new THREE.MeshPhysicalMaterial({
          color: 0xffffff, roughness: 0.03, metalness: 0, transmission: 1, thickness: VIDRIO, ior: 1.5,
          attenuationColor: new THREE.Color(0xcfe6da), attenuationDistance: 0.5, specularIntensity: 1,
        })
      : new THREE.MeshPhysicalMaterial({
          color: 0xeaf4ef, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false,
        }),
    cantoVidrio: new THREE.MeshStandardMaterial({ color: 0x9cc6b2, roughness: 0.1, transparent: true, opacity: 0.75 }),
    pendiente: new THREE.MeshStandardMaterial({ map: texturaPendiente(), roughness: 0.7 }),
    cargandoFoto: new THREE.MeshStandardMaterial({ color: 0xece2cf, roughness: 0.9 }),
  };
}

// ---------- Geometrías de los soportes (se crean una sola vez y se reutilizan) ----------
function crearGeometrias() {
  const busto = new THREE.Shape();
  busto.moveTo(-0.115, 0);
  busto.lineTo(-0.115, 0.085);
  busto.bezierCurveTo(-0.115, 0.15, -0.075, 0.165, -0.04, 0.175);
  busto.lineTo(-0.03, 0.235);
  busto.bezierCurveTo(-0.03, 0.264, 0.03, 0.264, 0.03, 0.235);
  busto.lineTo(0.04, 0.175);
  busto.bezierCurveTo(0.075, 0.165, 0.115, 0.15, 0.115, 0.085);
  busto.lineTo(0.115, 0);
  busto.lineTo(-0.115, 0);
  const bustoGeo = new THREE.ExtrudeGeometry(busto, {
    depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 4, curveSegments: 20,
  });
  bustoGeo.translate(0, 0, -0.015);

  const cil = (r, h, seg = 32) => new THREE.CylinderGeometry(r, r, h, seg);
  const horizontal = g => g.rotateZ(Math.PI / 2);

  return {
    busto: bustoGeo,
    bustoBase: new RoundedBoxGeometry(0.24, 0.022, 0.1, 2, 0.006),
    discoBase: new THREE.CylinderGeometry(0.055, 0.062, 0.016, 48),
    poste: cil(0.0045, 0.25, 16),
    barra: horizontal(cil(0.004, 0.25, 16)),
    remate: new THREE.SphereGeometry(0.0075, 16, 12),
    tarjeta: new RoundedBoxGeometry(0.22, 0.2, 0.008, 2, 0.003),
    gancho: new THREE.TorusGeometry(0.006, 0.0012, 8, 20),
    caja: new RoundedBoxGeometry(0.24, 0.06, 0.16, 3, 0.012),
    rodillo: horizontal(cil(0.02, 0.215, 28)),
    tapa: new RoundedBoxGeometry(0.24, 0.012, 0.16, 2, 0.005),
    baseLarga: new RoundedBoxGeometry(0.24, 0.02, 0.09, 2, 0.006),
    posteCorto: cil(0.005, 0.08, 16),
    cilindro: horizontal(cil(0.032, 0.2, 40)),
    tapon: horizontal(cil(0.034, 0.006, 40)),
    plinto: new RoundedBoxGeometry(0.2, 0.06, 0.13, 2, 0.008),
    banda: new THREE.BoxGeometry(0.202, 0.006, 0.132),
    almohada: horizontal(new THREE.CapsuleGeometry(0.03, 0.09, 8, 24)),
    pata: new THREE.BoxGeometry(0.008, 0.14, 0.004),
    plano: new THREE.PlaneGeometry(1, 1),
    marcoPlaca: new THREE.BoxGeometry(1, 1, 0.006),
  };
}

export function crearVitrina3D(contenedor, { alFallar }) {
  const alta = !celular() && punteroFino;
  const M = crearMateriales(alta);
  const G = crearGeometrias();
  const texFoco = texturaRadial("rgba(255,232,190,0.95)", "rgba(255,232,190,0)");
  const texSombra = texturaRadial("rgba(40,28,14,0.85)", "rgba(40,28,14,0)");

  // ----- DOM -----
  const raiz = document.createElement("div");
  raiz.className = "v3d";
  raiz.innerHTML = `
    <div class="v3d-escena">
      <canvas class="v3d-lienzo" aria-hidden="true"></canvas>
      <div class="v3d-capa"></div>
    </div>`;
  const escenaEl = raiz.querySelector(".v3d-escena");
  const canvas = raiz.querySelector("canvas");
  const capa = raiz.querySelector(".v3d-capa");

  // ----- Three.js -----
  // En celular: sin antialias por hardware, menos píxeles y sin mapa de sombras (las sombras de contacto ya son planos)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: alta, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, alta ? 2 : 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = alta;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const anisotropia = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const escena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  escena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  const ENTORNO = 0.6;
  escena.environmentIntensity = ENTORNO;

  const camara = new THREE.PerspectiveCamera(FOV, 1, 0.05, 30);

  const hemi = new THREE.HemisphereLight(0xfff6e8, 0xb39b74, 0.35);
  escena.add(hemi);

  // Luz principal cálida desde arriba y al frente; su sombra sigue a la cámara
  const SOL = 2.4;
  const sol = new THREE.DirectionalLight(0xfff0d8, SOL);
  const solDir = new THREE.Vector3(0.4, 1.5, 2.4).normalize().multiplyScalar(3);
  sol.castShadow = alta;
  sol.shadow.mapSize.set(2048, 2048);
  sol.shadow.bias = -0.0004;
  sol.shadow.normalBias = 0.015;
  sol.shadow.radius = 6;
  escena.add(sol, sol.target);

  // Foco que acompaña a la pieza señalada
  const FOCO = 6;
  const foco = new THREE.SpotLight(0xfff1d6, 0, 1.8, 0.3, 0.75, 1.6);
  escena.add(foco, foco.target);

  // ----- Estado -----
  const cam = { dolly: 1, alza: 0.04 };        // entrada de cámara
  const par = { x: 0, y: 0, tx: 0, ty: 0 };     // deriva con el puntero
  let contenido = null;                         // grupo del mueble y piezas actuales
  let desechables = [];                         // geometrías y materiales a liberar al reconstruir
  let lugares = [];                             // { p, x, piso, grupo, sombra, boton }
  let titulos = [];                             // { el, x, y }
  let luces = [];                               // por nivel: { led, foco } materiales
  let piezasActuales = [];
  let cols = 0, anchoInt = 0, anchoExt = 0, altoMueble = 0;
  let FILA = 0.46, BANDA = 0.2, tituloY = 0.14;
  let u = 0.002;                                // metros por píxel en el plano frontal
  let anchoPx = 0, altoEscena = 0, altoTotal = 0, cabecera = 0;
  let visible = false, sucio = true, animandoHasta = 0;
  let entradaHecha = reducir, entradaLista = false;
  let turno = 0;
  let perdido = false;

  const marcar = () => { sucio = true; };
  const extender = ms => { animandoHasta = Math.max(animandoHasta, performance.now() + ms); };

  // ----- Fotos (caché por URL) -----
  const cargador = new THREE.TextureLoader().setCrossOrigin("anonymous");
  const fotos = new Map();
  function foto(url) {
    if (!fotos.has(url)) {
      fotos.set(url, new Promise((ok, mal) => cargador.load(url, tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = anisotropia;
        ok(tex);
      }, undefined, mal)));
    }
    return fotos.get(url);
  }

  // Placa enmarcada en latón; la cara muestra la foto o "Foto pendiente"
  function placa(w, h, p) {
    const g = new THREE.Group();
    const marco = new THREE.Mesh(G.marcoPlaca, M.laton);
    marco.scale.set(w + 0.012, h + 0.012, 1);
    const cara = new THREE.Mesh(G.plano, p.foto_url ? M.cargandoFoto : M.pendiente);
    cara.scale.set(w, h, 1);
    cara.position.z = 0.0032;
    g.add(marco, cara);
    if (p.foto_url) {
      // La foto llena la placa con un recorte centrado (en el detalle se ve completa)
      foto(p.foto_url).then(base => {
        const tex = base.clone();
        const a = base.image.width / base.image.height, A = w / h;
        if (a > A) { tex.repeat.set(A / a, 1); tex.offset.set((1 - A / a) / 2, 0); }
        else { tex.repeat.set(1, a / A); tex.offset.set(0, (1 - a / A) / 2); }
        tex.needsUpdate = true;
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.22 });
        desechables.push(mat, tex);
        cara.material = mat;
        marcar();
      }).catch(() => { cara.material = M.pendiente; marcar(); });
    }
    return g;
  }

  // Placa inclinada con pata trasera (atril)
  function atril(w, h, p, y, z) {
    const g = new THREE.Group();
    const pl = placa(w, h, p);
    g.add(pl);
    const pata = new THREE.Mesh(G.pata, M.laton);
    pata.scale.y = h / 0.14;
    pata.position.set(0, -0.01, -0.03);
    pata.rotation.x = 0.35;
    g.add(pata);
    g.position.set(0, y, z);
    g.rotation.x = -0.14;
    return g;
  }

  const malla = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };

  // Soporte 3D según el tipo de joya
  function soporte(p) {
    const g = new THREE.Group();
    const tipo = SOPORTE[p.categoria] || "base";
    if (tipo === "busto") {
      g.add(malla(G.bustoBase, M.marmol, 0, 0.011, 0));
      const b = malla(G.busto, M.terciopelo, 0, 0.022, 0);
      b.rotation.x = -0.1;
      const pl = placa(0.155, 0.118, p);
      pl.position.set(0, 0.1, 0.0215);
      b.add(pl);
      g.add(b);
    } else if (tipo === "exhibidor") {
      g.add(malla(G.discoBase, M.marmol, 0, 0.008, 0));
      g.add(malla(G.poste, M.laton, 0, 0.141, -0.004));
      g.add(malla(G.barra, M.laton, 0, 0.262, 0));
      g.add(malla(G.remate, M.laton, -0.125, 0.262, 0), malla(G.remate, M.laton, 0.125, 0.262, 0));
      [-0.07, 0.07].forEach(x => g.add(malla(G.gancho, M.laton, x, 0.254, 0.004)));
      g.add(malla(G.tarjeta, M.terciopelo, 0, 0.152, 0.008));
      const pl = placa(0.19, 0.17, p);
      pl.position.set(0, 0.152, 0.0125);
      g.add(pl);
    } else if (tipo === "cojin") {
      g.add(malla(G.caja, M.terciopelo, 0, 0.03, 0));
      [-0.032, 0.032].forEach(z => g.add(malla(G.rodillo, M.terciopelo, 0, 0.061, z + 0.01)));
      const bisagra = new THREE.Group();
      bisagra.position.set(0, 0.06, -0.08);
      const tapa = malla(G.tapa, M.terciopelo, 0, 0.006, 0.08);
      const pl = placa(0.2, 0.13, p);
      pl.position.set(0, -0.0065, 0);
      pl.rotation.x = Math.PI / 2;
      tapa.add(pl);
      bisagra.add(tapa);
      bisagra.rotation.x = -(Math.PI / 2 + 0.22);
      g.add(bisagra);
    } else if (tipo === "cilindro") {
      g.add(malla(G.baseLarga, M.marmol, 0, 0.01, 0));
      [-0.1, 0.1].forEach(x => g.add(malla(G.posteCorto, M.laton, x, 0.06, 0.018)));
      g.add(malla(G.cilindro, M.terciopelo, 0, 0.1, 0.018));
      [-0.1, 0.1].forEach(x => g.add(malla(G.tapon, M.laton, x, 0.1, 0.018)));
      g.add(atril(0.22, 0.18, p, 0.235, -0.03));
    } else {
      g.add(malla(G.plinto, M.marmol, 0, 0.03, 0));
      g.add(malla(G.banda, M.laton, 0, 0.057, 0));
      if (p.categoria === "relojes") {
        g.add(malla(G.almohada, M.terciopelo, 0, 0.09, 0.025));
        g.add(atril(0.22, 0.18, p, 0.235, -0.04));
      } else {
        g.add(atril(0.24, 0.22, p, 0.18, -0.01));
      }
    }
    g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    return g;
  }

  // Reparte n piezas en filas equilibradas (sin una pieza sola en la última fila si se puede evitar)
  function filasDe(n) {
    const filas = Math.ceil(n / cols);
    const base = Math.floor(n / filas), extra = n % filas;
    return Array.from({ length: filas }, (_, i) => base + (i < extra ? 1 : 0));
  }

  function calcularColumnas() {
    const min = celular() ? 112 : 300;
    return clamp(Math.floor(anchoPx / min), 3, celular() ? 4 : 5);
  }

  // ----- Mueble y piezas -----
  function limpiar() {
    if (contenido) escena.remove(contenido);
    desechables.forEach(d => d.dispose());
    desechables = [];
    contenido = null;
    lugares = [];
    titulos = [];
    luces = [];
    capa.innerHTML = "";
  }

  const caja = (w, h, d, mat, x, y, z) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    desechables.push(geo);
    return malla(geo, mat, x, y, z);
  };

  function construir(piezas) {
    limpiar();
    piezasActuales = piezas;
    contenido = new THREE.Group();
    anchoInt = cols * HUECO;
    anchoExt = anchoInt + 2 * PILAR + 0.04;
    // Espacio para la etiqueta de precio que cuelga bajo cada repisa (en metros, según el ancho de pantalla)
    u = (anchoExt * (celular() ? 1.03 : 1.04)) / anchoPx;
    const etiqueta = (celular() ? 54 : 62) * u;
    FILA = ALTO_PIEZA + Math.max(0.16, etiqueta + 10 * u);
    tituloY = etiqueta + 14 * u;
    BANDA = Math.max(0.2, tituloY + 24 * u);
    const fondoZ = (REPISA_Z1 + REPISA_Z0) / 2, prof = REPISA_Z1 - REPISA_Z0;

    let y = -CORNISA;
    NIVELES.forEach(n => {
      const de = piezas.filter(p => nivelDe(p) === n);
      if (!de.length) return;
      const inicio = y;
      const ledMat = new THREE.MeshBasicMaterial({ color: 0xfff2d2 });
      const focoMat = new THREE.MeshBasicMaterial({
        map: texFoco, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false,
      });
      desechables.push(ledMat, focoMat);
      luces.push({ led: ledMat, foco: focoMat });

      // Banda de título con filete de latón
      contenido.add(caja(anchoInt, 0.006, 0.006, M.laton, 0, y - BANDA + 0.03, FONDO_Z + 0.006));
      const disponibles = de.filter(p => p.estado === "disponible").length;
      const t = document.createElement("h3");
      t.className = "v3d-nivel";
      t.innerHTML = `${esc(n.titulo)} <span>${disponibles} disponible${disponibles === 1 ? "" : "s"} · ${de.length} en vitrina</span>`;
      capa.appendChild(t);
      titulos.push({ el: t, y: y - tituloY });
      y -= BANDA;

      let i = 0;
      filasDe(de.length).forEach(cuantas => {
        const techo = y, piso = y - FILA;
        // LED bajo la repisa (o cornisa) de arriba
        contenido.add(caja(anchoInt * 0.97, 0.004, 0.012, ledMat, 0, techo - 0.003, REPISA_Z1 - 0.035));
        // Repisa de cristal grueso con canto verdoso y perfil de latón
        const repisa = caja(anchoInt, VIDRIO, prof, M.vidrio, 0, piso - VIDRIO / 2, fondoZ);
        contenido.add(repisa);
        contenido.add(caja(anchoInt, VIDRIO * 0.9, 0.002, M.cantoVidrio, 0, piso - VIDRIO / 2, REPISA_Z1 + 0.001));
        contenido.add(caja(anchoInt, 0.007, 0.008, M.laton, 0, piso - VIDRIO - 0.0035, REPISA_Z1 - 0.004));

        for (let k = 0; k < cuantas; k++) {
          const p = de[i++];
          const x = (k - (cuantas - 1) / 2) * HUECO;
          const grupo = soporte(p);
          grupo.position.set(x, piso, PIEZA_Z);
          contenido.add(grupo);

          const sombraMat = new THREE.MeshBasicMaterial({ map: texSombra, transparent: true, opacity: 0.4, depthWrite: false });
          desechables.push(sombraMat);
          const sombra = new THREE.Mesh(G.plano, sombraMat);
          sombra.rotation.x = -Math.PI / 2;
          sombra.scale.set(0.3, 0.17, 1);
          sombra.position.set(x, piso + 0.0012, PIEZA_Z + 0.005);
          contenido.add(sombra);

          const pozo = new THREE.Mesh(G.plano, focoMat);
          pozo.scale.set(0.42, 0.42, 1);
          pozo.position.set(x, piso + 0.19, FONDO_Z + 0.004);
          contenido.add(pozo);

          const boton = document.createElement("button");
          boton.type = "button";
          boton.className = "v3d-pieza";
          boton.setAttribute("aria-label", `${p.nombre}. ${precioTexto(p)}. ${disponibilidad(p)}. Ver detalle`);
          boton.innerHTML = `
            <span class="v3d-etiqueta" aria-hidden="true">
              <strong>${esc(p.nombre)}</strong>
              <span class="v3d-precio">${esc(precioTexto(p))}</span>
              <span class="v3d-disp ${p.estado === "apartado" ? "apartado" : ""}">${esc(disponibilidad(p))}</span>
            </span>`;
          capa.appendChild(boton);
          const lugar = { p, x, piso, grupo, sombra, boton };
          boton.addEventListener("click", () => abrirDetalle(p));
          boton.addEventListener("pointerenter", () => resaltar(lugar, true));
          boton.addEventListener("pointerleave", () => resaltar(lugar, false));
          boton.addEventListener("focus", () => { resaltar(lugar, true); traerALaVista(boton); });
          boton.addEventListener("blur", () => resaltar(lugar, false));
          lugares.push(lugar);
        }
        y = piso - VIDRIO;
      });

      // Panel de terciopelo de este nivel
      const alto = inicio - y;
      const panelGeo = new THREE.PlaneGeometry(anchoInt, alto);
      desechables.push(panelGeo);
      const panel = malla(panelGeo, M.terciopeloFondo, 0, inicio - alto / 2, FONDO_Z);
      panel.receiveShadow = true;
      contenido.add(panel);
    });

    // Estructura de mármol: cornisa, pilares y zócalo, con perfiles de latón
    const fondo = y;
    altoMueble = -(fondo - ZOCALO);
    const cuerpo = -fondo;
    const zEst = -0.12, dEst = 0.5;
    contenido.add(caja(anchoExt, CORNISA, dEst, M.marmol, 0, -CORNISA / 2, zEst));
    contenido.add(caja(anchoExt + 0.02, 0.014, dEst + 0.02, M.laton, 0, -0.007, zEst));
    contenido.add(caja(anchoExt, 0.012, 0.012, M.laton, 0, -CORNISA + 0.006, zEst + dEst / 2));
    contenido.add(caja(anchoInt, 0.004, 0.012, luces[0]?.led || M.laton, 0, -CORNISA - 0.003, REPISA_Z1 - 0.035));
    [-1, 1].forEach(lado => {
      const x = lado * (anchoInt / 2 + PILAR / 2);
      contenido.add(caja(PILAR, cuerpo - CORNISA, dEst, M.marmol, x, -(CORNISA + cuerpo) / 2, zEst));
      contenido.add(caja(0.006, cuerpo - CORNISA, 0.006, M.laton, lado * (anchoInt / 2 + 0.003), -(CORNISA + cuerpo) / 2, zEst + dEst / 2));
    });
    contenido.add(caja(anchoExt, ZOCALO, dEst, M.marmol, 0, fondo - ZOCALO / 2, zEst));
    contenido.add(caja(anchoExt, 0.012, 0.012, M.laton, 0, fondo - 0.006, zEst + dEst / 2));
    contenido.add(caja(anchoExt - 0.03, 0.03, dEst - 0.03, M.marmolBase, 0, fondo - ZOCALO + 0.015, zEst + 0.01));
    contenido.traverse(o => {
      if (o.isMesh && o.material === M.marmol) { o.castShadow = true; o.receiveShadow = true; }
    });

    escena.add(contenido);
    medir();
    marcar();
  }

  // ----- Tamaño, cámara y etiquetas -----
  function medir() {
    anchoPx = raiz.clientWidth || contenedor.clientWidth;
    const cab = document.querySelector(".cabecera");
    const tab = document.querySelector(".tabbar");
    cabecera = cab ? cab.offsetHeight : 0;
    const abajo = tab && getComputedStyle(tab).display !== "none" ? tab.offsetHeight : 0;
    const disponible = Math.max(320, innerHeight - cabecera - abajo);
    u = (anchoExt * (celular() ? 1.03 : 1.04)) / anchoPx;
    altoTotal = Math.ceil((altoMueble + 2 * MARGEN) / u);
    altoEscena = Math.min(altoTotal, disponible);
    raiz.style.height = altoTotal + "px";
    escenaEl.style.top = cabecera + "px";
    escenaEl.style.height = altoEscena + "px";
    renderer.setSize(anchoPx, altoEscena, false);
    camara.aspect = anchoPx / altoEscena;
    camara.updateProjectionMatrix();

    const visH = altoEscena * u;
    const sc = sol.shadow.camera;
    sc.left = -anchoExt / 2 - 0.1; sc.right = anchoExt / 2 + 0.1;
    sc.top = visH / 2 + 0.4; sc.bottom = -visH / 2 - 0.4;
    sc.near = 0.1; sc.far = 7;
    sc.updateProjectionMatrix();
    marcar();
  }

  const v = new THREE.Vector3();
  function aPantalla(x, y, z) {
    v.set(x, y, z).project(camara);
    return [(v.x + 1) / 2 * anchoPx, (1 - v.y) / 2 * altoEscena];
  }

  function actualizarCamara() {
    const r = raiz.getBoundingClientRect();
    const recorrido = Math.max(0, altoTotal - altoEscena);
    const desplazado = clamp(cabecera - r.top, 0, recorrido);
    const visH = altoEscena * u;
    const distancia = visH / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const cy = MARGEN - (desplazado + altoEscena / 2) * u;
    camara.position.set(par.x, cy + cam.alza + par.y, FRENTE_Z + distancia * cam.dolly);
    camara.lookAt(par.x * 0.3, cy, FRENTE_Z);

    // Sombra: el encuadre de la luz sigue a la cámara, alineado a su malla de texels para que no "tiemble"
    const texel = (sol.shadow.camera.top - sol.shadow.camera.bottom) / sol.shadow.mapSize.y;
    const ty = Math.round(cy / texel) * texel;
    sol.target.position.set(0, ty, -0.15);
    sol.position.copy(sol.target.position).add(solDir);
  }

  // Escribe un estilo solo si cambió: tocar width/height cada cuadro obliga al navegador a recalcular el diseño
  const ultimoEstilo = new WeakMap();
  function estilo(el, campo, valor) {
    let previo = ultimoEstilo.get(el);
    if (!previo) ultimoEstilo.set(el, previo = {});
    if (previo[campo] !== valor) { previo[campo] = valor; el.style[campo] = valor; }
  }

  function actualizarEtiquetas() {
    const ancho = HUECO * 0.46;
    lugares.forEach(l => {
      const [x0] = aPantalla(l.x - ancho, l.piso, REPISA_Z1);
      const [x1, y1] = aPantalla(l.x + ancho, l.piso - VIDRIO, REPISA_Z1);
      const [, y0] = aPantalla(l.x, l.piso + 0.3, PIEZA_Z);
      estilo(l.boton, "transform", `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`);
      estilo(l.boton, "width", (x1 - x0).toFixed(1) + "px");
      estilo(l.boton, "height", (y1 - y0).toFixed(1) + "px");
    });
    titulos.forEach(t => {
      const [x, y] = aPantalla(-anchoInt / 2 + 0.03, t.y, REPISA_Z1);
      const [x1] = aPantalla(anchoInt / 2 - 0.03, t.y, REPISA_Z1);
      estilo(t.el, "transform", `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateY(-50%)`);
      estilo(t.el, "maxWidth", (x1 - x).toFixed(1) + "px");
    });
  }

  function cuadro() {
    if (!visible || perdido || !contenido) return;
    const ahora = performance.now();
    par.x += (par.tx - par.x) * 0.08;
    par.y += (par.ty - par.y) * 0.08;
    const moviendo = Math.abs(par.tx - par.x) + Math.abs(par.ty - par.y) > 1e-4;
    if (!sucio && !moviendo && ahora > animandoHasta) return;
    sucio = false;
    actualizarCamara();
    actualizarEtiquetas();
    renderer.render(escena, camara);
  }
  gsap.ticker.add(cuadro);

  // ----- Interacción -----
  function resaltar(l, si) {
    if (!entradaHecha || !l.grupo.parent) return;
    const dur = reducir ? 0 : 0.55;
    gsap.to(l.grupo.position, { y: l.piso + (si ? 0.016 : 0), duration: dur, ease: "power3.out", overwrite: "auto" });
    gsap.to(l.grupo.scale, { x: si ? 1.05 : 1, y: si ? 1.05 : 1, z: si ? 1.05 : 1, duration: dur, ease: "power3.out", overwrite: "auto" });
    gsap.to(l.grupo.rotation, { y: si ? -0.1 : 0, duration: reducir ? 0 : 0.9, ease: "power2.out", overwrite: "auto" });
    if (si) {
      foco.position.set(l.x + 0.08, l.piso + 0.78, 0.55);
      foco.target.position.set(l.x, l.piso + 0.13, PIEZA_Z);
    }
    gsap.to(foco, { intensity: si ? FOCO : 0, duration: reducir ? 0 : 0.45, overwrite: "auto" });
    extender(1000);
    marcar();
  }

  // Al llegar con el teclado a una pieza fuera de cuadro, se desplaza la página hasta ella
  function traerALaVista(boton) {
    const rb = boton.getBoundingClientRect(), re = escenaEl.getBoundingClientRect();
    if (rb.top >= re.top && rb.bottom <= re.bottom) return;
    scrollBy({ top: (rb.top + rb.height / 2) - (re.top + re.height / 2), behavior: reducir ? "auto" : "smooth" });
  }

  if (alta && !reducir) {
    escenaEl.addEventListener("pointermove", e => {
      const r = escenaEl.getBoundingClientRect();
      par.tx = ((e.clientX - r.left) / r.width - 0.5) * 0.12;
      par.ty = -((e.clientY - r.top) / r.height - 0.5) * 0.06;
    });
    escenaEl.addEventListener("pointerleave", () => { par.tx = 0; par.ty = 0; });
  }

  addEventListener("scroll", () => { if (visible) marcar(); }, { passive: true });

  let anchoPrevio = 0, altoPrevio = innerHeight;
  const ro = new ResizeObserver(() => {
    const w = contenedor.clientWidth;
    const cambioAlto = Math.abs(innerHeight - altoPrevio) > 120;
    if (!contenido || (w === anchoPrevio && !cambioAlto)) return;
    anchoPrevio = w;
    altoPrevio = innerHeight;
    anchoPx = raiz.clientWidth || w;
    const nuevas = calcularColumnas();
    if (nuevas !== cols) {
      cols = nuevas;
      construir(piezasActuales);
      if (entradaHecha) mostrarFinal();
    } else {
      medir();
    }
  });
  ro.observe(contenedor);
  addEventListener("resize", () => {
    if (contenido && Math.abs(innerHeight - altoPrevio) > 120) { altoPrevio = innerHeight; medir(); }
  });

  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) {
      marcar();
      if (entradaLista && !entradaHecha && e.intersectionRatio > 0) entrada();
    }
  }, { threshold: [0, 0.15] });
  io.observe(raiz);

  canvas.addEventListener("webglcontextlost", e => {
    e.preventDefault();
    perdido = true;
    gsap.ticker.remove(cuadro);
    io.disconnect();
    ro.disconnect();
    alFallar(piezasActuales);
  });

  // ----- Animaciones -----
  // Estado final (sin animación): luces encendidas y piezas en su lugar
  function mostrarFinal() {
    sol.intensity = SOL;
    escena.environmentIntensity = ENTORNO;
    cam.dolly = 1; cam.alza = 0.04;
    luces.forEach(l => { l.led.color.setHex(0xfff2d2); l.foco.opacity = 0.28; });
    lugares.forEach(l => {
      l.grupo.visible = true;
      l.grupo.position.y = l.piso;
      l.grupo.rotation.y = 0;
      l.grupo.scale.setScalar(1);
      l.sombra.material.opacity = 0.4;
    });
    capa.style.opacity = 1;
    marcar();
  }

  // Antes de la entrada: mueble en penumbra, piezas fuera de su soporte
  function prepararEntrada() {
    sol.intensity = 0;
    escena.environmentIntensity = 0.18;
    cam.dolly = 1.35; cam.alza = 0.28;
    luces.forEach(l => { l.led.color.setHex(0x3a3328); l.foco.opacity = 0; });
    lugares.forEach(l => { l.grupo.visible = false; l.sombra.material.opacity = 0; });
    capa.style.opacity = 0;
    entradaLista = true;
    marcar();
  }

  function colocarPiezas(tl, inicio) {
    lugares.forEach((l, i) => {
      const t = inicio + i * 0.07;
      tl.fromTo(l.grupo.position, { y: l.piso + 0.22 }, { y: l.piso, duration: 0.95, ease: "power3.out", onStart: () => { l.grupo.visible = true; } }, t)
        .fromTo(l.grupo.rotation, { y: 0.6 }, { y: 0, duration: 1.1, ease: "power2.out" }, t)
        .fromTo(l.grupo.scale, { x: 0.9, y: 0.9, z: 0.9 }, { x: 1, y: 1, z: 1, duration: 0.95, ease: "power3.out" }, t)
        .fromTo(l.sombra.material, { opacity: 0 }, { opacity: 0.4, duration: 0.7 }, t + 0.35);
    });
    return inicio + lugares.length * 0.07 + 1.1;
  }

  // Secuencia: mueble → luces → piezas que se colocan una a una; la cámara se acerca a la vez
  function entrada() {
    entradaHecha = true;
    const led = new THREE.Color(0xfff2d2);
    const tl = gsap.timeline({ defaults: { ease: "power2.out" } });
    tl.to(cam, { dolly: 1, alza: 0.04, duration: 2.8, ease: "power2.inOut" }, 0)
      .to(escena, { environmentIntensity: ENTORNO, duration: 1.6 }, 0.2)
      .to(sol, { intensity: SOL, duration: 1.4 }, 0.5);
    luces.forEach((l, i) => {
      const k = { t: 0 };
      const de = l.led.color.clone();
      tl.to(k, { t: 1, duration: 0.6, onUpdate: () => l.led.color.copy(de).lerp(led, k.t) }, 0.6 + i * 0.25)
        .to(l.foco, { opacity: 0.28, duration: 0.9 }, 0.75 + i * 0.25);
    });
    const fin = colocarPiezas(tl, 1.2);
    tl.to(capa, { opacity: 1, duration: 0.6 }, fin - 0.6);
    extender((fin + 0.3) * 1000);
  }

  // ----- API -----
  function mostrar(piezas) {
    const mio = ++turno;
    raiz.hidden = !piezas.length;
    if (!raiz.isConnected) {
      contenedor.innerHTML = "";
      contenedor.appendChild(raiz);
    }
    if (!piezas.length) { limpiar(); piezasActuales = []; return; }
    if (!cols) { anchoPx = raiz.clientWidth || contenedor.clientWidth; anchoPrevio = contenedor.clientWidth; cols = calcularColumnas(); }

    const reconstruir = () => {
      if (mio !== turno) return;
      construir(piezas);
      if (reducir) return mostrarFinal();
      if (!entradaHecha) {
        prepararEntrada();
        // Si la vitrina ya está a la vista, la entrada arranca en el siguiente cuadro
        requestAnimationFrame(() => {
          const r = raiz.getBoundingClientRect();
          if (r.top < innerHeight * 0.85 && r.bottom > 0) { visible = true; entrada(); }
        });
        return;
      }
      // Cambio de filtro: luces ya encendidas; las piezas nuevas se colocan una a una
      mostrarFinal();
      capa.style.opacity = 0;
      const tl = gsap.timeline();
      const fin = colocarPiezas(tl, 0.05);
      tl.to(capa, { opacity: 1, duration: 0.4 }, Math.min(fin - 0.4, 0.6));
      extender((fin + 0.3) * 1000);
    };

    // Las piezas anteriores se retiran antes de acomodar las nuevas
    if (entradaHecha && !reducir && lugares.length) {
      const tl = gsap.timeline({ onComplete: reconstruir });
      tl.to(capa, { opacity: 0, duration: 0.15 }, 0);
      lugares.forEach((l, i) => {
        tl.to(l.grupo.position, { y: l.piso + 0.06, duration: 0.22, ease: "power1.in" }, i * 0.012)
          .to(l.grupo.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.22, ease: "power1.in" }, i * 0.012)
          .to(l.sombra.material, { opacity: 0, duration: 0.18 }, i * 0.012);
      });
      extender(tl.duration() * 1000 + 100);
    } else {
      reconstruir();
    }
  }

  // Solo en desarrollo: permite saltar la animación para revisar el estado final
  if (import.meta.env.DEV) {
    window.__vitrina3d = {
      final: () => { gsap.globalTimeline.progress(1); entradaHecha = true; mostrarFinal(); },
      info: () => ({ cols, u, altoTotal, altoEscena, piezas: lugares.length, calls: renderer.info.render.calls, tris: renderer.info.render.triangles }),
    };
  }

  return { mostrar };
}
