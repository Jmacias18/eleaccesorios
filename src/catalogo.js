// Valores compartidos entre la tienda y el panel.
// Deben coincidir con los CHECK de supabase/schema.sql.

// Secciones y subcategorías según el manual de identidad.
// equipos.seccion guarda la sección; equipos.categoria guarda la subcategoría (su id).
// Un mismo id puede existir en dos secciones (p. ej. collares en mujer y hombre).
export const SECCIONES = [
  { id: "mujer", label: "Mujer" },
  { id: "hombre", label: "Hombre" },
  { id: "accesorios", label: "Accesorios" },
];

export const SUBCATEGORIAS = {
  mujer: [
    { id: "collares", label: "Collares" },
    { id: "aretes", label: "Aretes" },
    { id: "arracadas", label: "Arracadas" },
    { id: "pulseras", label: "Pulseras" },
    { id: "brazaletes", label: "Brazaletes" },
    { id: "brazaletes-italianos", label: "Brazaletes italianos" },
    { id: "anillos", label: "Anillos" },
    { id: "relojes", label: "Relojes" },
    { id: "charms", label: "Charms" },
  ],
  hombre: [
    { id: "collares", label: "Collares" },
    { id: "pulseras", label: "Pulseras" },
    { id: "brazaletes", label: "Brazaletes" },
  ],
  accesorios: [
    { id: "bolsas", label: "Bolsas" },
    { id: "llaveros", label: "Llaveros" },
    { id: "otros", label: "Otros" },
  ],
};

export const subcategoriasDe = seccion => SUBCATEGORIAS[seccion] || [];

export const CONDICIONES = [
  { id: "nuevo", label: "Nuevo" },
  { id: "seminuevo", label: "Seminuevo" },
  { id: "usado", label: "Usado" },
];

export const ESTADOS = [
  { id: "disponible", label: "Disponible" },
  { id: "apartado", label: "Apartado" },
  { id: "vendido", label: "Vendido" },
];

export const TIPOS_PROYECTO = [
  { id: "web", label: "Página web" },
  { id: "tienda", label: "Tienda en línea" },
  { id: "sistema", label: "Sistema a medida" },
];

const porId = lista => id => lista.find(x => x.id === id);
export const tipoProyecto = porId(TIPOS_PROYECTO);
export const seccion = porId(SECCIONES);
// Busca la subcategoría por id en cualquier sección (las etiquetas coinciden entre secciones).
export const categoria = id => Object.values(SUBCATEGORIAS).flat().find(x => x.id === id);
export const condicion = porId(CONDICIONES);
export const estado = porId(ESTADOS);

export const money = n =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);

export function textoPrecio(eq) {
  if (eq.precio == null) return "Consultar precio";
  return (eq.desde ? "desde " : "") + money(eq.precio);
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
