// Íconos SVG de trazo (24×24, stroke 1.75). Heredan el color con currentColor.
const svg = (cuerpo, clase = "ico") =>
  `<svg class="${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cuerpo}</svg>`;

const TRAZOS = {
  // Categorías
  relojes: '<circle cx="12" cy="13" r="6"/><path d="M12 10v3l2 1.5"/><path d="M9.5 7 10 3h4l.5 4M9.5 19 10 23h4l.5-4"/>',
  aretes: '<path d="M12 3v4"/><path d="M12 7a3 3 0 0 0-3 3c0 2 3 6 3 6s3-4 3-6a3 3 0 0 0-3-3z"/>',
  collares: '<path d="M4 4c0 6 3.5 9 8 9s8-3 8-9"/><path d="M12 13v3"/><path d="m12 16 2 2-2 3-2-3z"/>',
  pulseras: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="6" r="1.5"/>',
  anillos: '<circle cx="12" cy="14" r="6"/><path d="m9.5 8 2.5-5 2.5 5z"/>',
  otros: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5"/><path d="M12 13v8"/>',
  // Interfaz
  camara: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3.5"/>',
  buscar: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  mas: '<path d="M12 5v14M5 12h14"/>',
  cerrar: '<path d="M18 6 6 18M6 6l12 12"/>',
  alerta: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
  externo: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  recargar: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8"/><path d="M21 3v5h-5"/>',
  candado: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  ojo: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  imagen: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  izquierda: '<path d="m15 18-6-6 6-6"/>',
  derecha: '<path d="m9 18 6-6-6-6"/>',
  galeria: '<rect x="3" y="5" width="14" height="14" rx="2"/><path d="M21 7v12a2 2 0 0 1-2 2H7"/><path d="m3 15 3.5-3.5a1.5 1.5 0 0 1 2 0L13 16"/>',
};

export const icono = (nombre, clase) => svg(TRAZOS[nombre] || TRAZOS.otros, clase);
