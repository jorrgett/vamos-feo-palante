import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vamos feo pa'lante",
    short_name: "Pa'lante",
    description: "La libreta de cuentas de los panas.",
    id: "/",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    background_color: "#f3ead8",
    theme_color: "#f3ead8",
    lang: "es-VE",
    icons: [
      // Solo PNG y sin "?v=": el iPhone ignora los SVG del manifest y, si no encuentra uno, pone una letra.
      { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
