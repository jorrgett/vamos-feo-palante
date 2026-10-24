"use client";

import { useLayoutEffect } from "react";

/** Colorea la barra del sistema (Android/Chrome) con el fondo del tema activo, también si se eligió a mano. */
export function syncThemeColor() {
  const manual = document.documentElement.dataset.theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.dataset.original ??= m.content;
    m.content = manual && bg ? bg : m.dataset.original;
  });
}

/** En desarrollo React reinicia los atributos de <html> al remontar; esto vuelve a aplicar el tema guardado. */
export function ThemeSync() {
  useLayoutEffect(() => {
    try {
      const t = localStorage.getItem("vaca-theme");
      if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    } catch {}
    syncThemeColor();
  }, []);
  return null;
}
