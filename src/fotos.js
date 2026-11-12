import { supabase } from "./supabase.js";

const BUCKET = "equipos";
// Reduce la foto del celular (≈4 MB) a ≈150–300 KB antes de subirla.
// Las capturas de proyectos usan ladoMax mayor para que el texto se lea nítido.
export async function comprimir(archivo, { ladoMax = 1280 } = {}) {
  const img = await cargarImagen(archivo);
  const escala = Math.min(1, ladoMax / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  img.close?.();

  // Safari no genera WebP desde canvas: en ese caso cae a JPEG.
  let blob = await aBlob(canvas, "image/webp", 0.8);
  if (blob?.type !== "image/webp") blob = await aBlob(canvas, "image/jpeg", 0.82);
  if (!blob) throw new Error("No se pudo procesar la imagen.");
  return blob;
}

async function cargarImagen(archivo) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(archivo, { imageOrientation: "from-image" });
    } catch { /* formato no soportado por createImageBitmap: probar con <img> */ }
  }
  const url = URL.createObjectURL(archivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("Ese archivo no es una imagen compatible.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const aBlob = (canvas, tipo, calidad) => new Promise(r => canvas.toBlob(r, tipo, calidad));

// carpeta: "" para equipos, "proyectos/" para capturas del portafolio
export async function subir(blob, carpeta = "") {
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const ruta = `${carpeta}${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, blob, {
    contentType: blob.type,
    cacheControl: "31536000",
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}

// Borra la foto a partir de su URL pública. Si falla, no interrumpe: solo queda un archivo huérfano.
export async function borrar(url) {
  const marca = `/object/public/${BUCKET}/`;
  const i = url?.indexOf(marca) ?? -1;
  if (i < 0) return;
  const ruta = decodeURIComponent(url.slice(i + marca.length));
  const { data, error } = await supabase.storage.from(BUCKET).remove([ruta]);
  if (error || !data?.length) console.warn("No se pudo borrar la foto", ruta, error || "sin permiso o no existe");
}
