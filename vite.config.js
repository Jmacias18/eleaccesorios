import { resolve } from "node:path";
import { defineConfig } from "vite";

// /admin → /admin/ en dev y preview (si no, Vite responde con la tienda)
const redirigirAdmin = {
  name: "redirigir-admin",
  configureServer(server) { server.middlewares.use(redirigir); },
  configurePreviewServer(server) { server.middlewares.use(redirigir); },
};

function redirigir(req, res, next) {
  if (req.url === "/admin" || req.url.startsWith("/admin?")) {
    res.writeHead(301, { Location: req.url.replace("/admin", "/admin/") });
    return res.end();
  }
  next();
}

export default defineConfig({
  plugins: [redirigirAdmin],
  build: {
    rollupOptions: {
      input: {
        tienda: resolve(import.meta.dirname, "index.html"),
        admin: resolve(import.meta.dirname, "admin/index.html"),
      },
    },
  },
});
