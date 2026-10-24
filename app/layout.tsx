import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Shantell_Sans } from "next/font/google";
import "./globals.css";
import { ThemeSync } from "@/components/theme-sync";
import { APPLE_ICON_DATA_URI } from "@/lib/apple-icon";

const hand = Shantell_Sans({ subsets: ["latin"], variable: "--font-hand", display: "swap", weight: ["500", "700", "800"] });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Vamos feo pa'lante", template: "%s · Vamos feo pa'lante" },
  description: "La libreta de cuentas de los panas: quién puso, quién debe y quién ya pagó, en $, Bs, € o USDT.",
  applicationName: "Vamos feo pa'lante",
  appleWebApp: { capable: true, title: "Pa'lante", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // PNG opaco de 180 px que el iPhone usa al "Agregar a inicio" (scripts/generar-iconos.mts). Va incrustado
  // (data:) porque iOS 27.2 no lo descarga de la red y pone una letra; /apple-touch-icon.png sigue existiendo.
  icons: { apple: [{ url: APPLE_ICON_DATA_URI, sizes: "180x180", type: "image/png" }] },
  // iOS todavía lee la versión con prefijo para abrirla como app.
  other: { "apple-mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3ead8" },
    { media: "(prefers-color-scheme: dark)", color: "#15121a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Aplica el tema guardado antes del primer pintado (sin parpadeo).
const themeScript = `try{var t=localStorage.getItem("vaca-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-VE" suppressHydrationWarning className={`${hand.variable} ${geist.variable} ${geistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
