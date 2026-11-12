// Catálogo de PRUEBA para ver la tienda en desarrollo (no es inventario real).
// Solo se usa con http://127.0.0.1:5173/?prueba=1. Nunca llega a producción.
// Cubre las tres secciones, varias subcategorías, precios con y sin "desde",
// consultar precio y piezas apartadas.

export const PIEZAS_PRUEBA = [
  { id: "p1", nombre: "[Prueba] Aretes aro dorado", seccion: "mujer", categoria: "aretes", precio: 350, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p2", nombre: "[Prueba] Arracadas perla", seccion: "mujer", categoria: "arracadas", precio: 290, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p3", nombre: "[Prueba] Collar corazón acero", seccion: "mujer", categoria: "collares", precio: 480, desde: true, condicion: "nuevo", estado: "apartado", foto_url: null },
  { id: "p4", nombre: "[Prueba] Collar trébol negro", seccion: "mujer", categoria: "collares", precio: 720, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p5", nombre: "[Prueba] Pulsera corazones de colores", seccion: "mujer", categoria: "pulseras", precio: 620, desde: false, condicion: "nuevo", estado: "disponible", foto_url: "/portada-pulseras-700.jpg" },
  { id: "p6", nombre: "[Prueba] Brazalete rígido oro laminado", seccion: "mujer", categoria: "brazaletes", precio: null, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p7", nombre: "[Prueba] Brazalete italiano", seccion: "mujer", categoria: "brazaletes-italianos", precio: 540, desde: true, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p8", nombre: "[Prueba] Anillo solitario", seccion: "mujer", categoria: "anillos", precio: 390, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p9", nombre: "[Prueba] Reloj dama oro laminado", seccion: "mujer", categoria: "relojes", precio: 1250, desde: false, condicion: "seminuevo", estado: "disponible", foto_url: null },
  { id: "p10", nombre: "[Prueba] Charm estrella", seccion: "mujer", categoria: "charms", precio: 180, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p11", nombre: "[Prueba] Collar cadena hombre", seccion: "hombre", categoria: "collares", precio: 610, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p12", nombre: "[Prueba] Pulsera cadena hombre", seccion: "hombre", categoria: "pulseras", precio: 540, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p13", nombre: "[Prueba] Brazalete acero hombre", seccion: "hombre", categoria: "brazaletes", precio: null, desde: false, condicion: "nuevo", estado: "apartado", foto_url: null },
  { id: "p14", nombre: "[Prueba] Bolsa de mano", seccion: "accesorios", categoria: "bolsas", precio: 850, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
  { id: "p15", nombre: "[Prueba] Llavero acero", seccion: "accesorios", categoria: "llaveros", precio: 150, desde: false, condicion: "nuevo", estado: "disponible", foto_url: null },
];
