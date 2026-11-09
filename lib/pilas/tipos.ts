// Pilas 🔋: el asistente de la app. Tipos que comparten el servidor y la pantalla del chat.
import type { SalidaInput } from "@/app/actions/salidas";

export type PersonaVista = { nombre: string; avatar: string; color: string };

/** Lo que se ve en la tarjeta de una salida propuesta (antes de anotarla). */
export type VistaSalida = {
  titulo: string;
  emoji: string;
  fecha: string;
  /** Total en la moneda de la cuenta («Bs 12.000,00»). */
  totalTexto: string;
  totalUsd: number;
  division: string;
  personas: (PersonaVista & { parteUsd: number; pusoUsd: number; yaPago: boolean })[];
  deudas: { de: string; a: string; usd: number }[];
};

/**
 * Lo que Pilas le deja a la persona para que lo confirme con un toque.
 * Pilas nunca ejecuta nada: cada botón llama a la misma acción de la app que usaría la pantalla normal.
 */
export type Tarjeta =
  | { tipo: "salida"; id: string; input: SalidaInput; vista: VistaSalida }
  | {
      tipo: "recordar";
      id: string;
      /** Recordatorio de todo lo que un pana me debe… */
      userId?: string;
      /** …o de una salida (a todos los que faltan o a uno). */
      salidaId?: string;
      memberId?: string;
      titulo: string;
      personas: PersonaVista[];
      montoUsd: number;
      detalle: string;
    }
  | { tipo: "mensaje"; id: string; userId: string; persona: PersonaVista; texto: string }
  | {
      tipo: "pagado";
      id: string;
      persona: PersonaVista;
      /** Todo lo que el pana me debe (sin salida) o su parte de una salida. */
      userId?: string;
      salidaId?: string;
      memberId?: string;
      metodo: string;
      moneda: "USD" | "VES";
      montoUsd: number;
      detalle: string;
    }
  | { tipo: "confirmar"; id: string; settlementIds: string[]; persona: PersonaVista; montoUsd: number; detalle: string }
  | { tipo: "ir"; id: string; href: string; texto: string; emoji: string };

export type EstadoTarjeta = { estado: "hecho" | "descartado"; texto: string; href?: string };

/** Lo que el servidor le va mandando al chat mientras Pilas piensa (una línea JSON por evento). */
export type EventoPilas =
  | { t: "estado"; texto: string }
  | { t: "texto"; d: string }
  | { t: "tarjeta"; tarjeta: Tarjeta }
  | { t: "fin"; historial: unknown[] }
  | { t: "error"; texto: string };

/** Foto que se adjunta a un mensaje (ya comprimida en el teléfono). */
export type ImagenPilas = { mime: "image/jpeg" | "image/png" | "image/webp"; base64: string };
