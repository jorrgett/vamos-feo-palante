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
  | { tipo: "ir"; id: string; href: string; texto: string; emoji: string }
  // ── Tarjetas visuales (solo muestran, con gráficos y toques para ver más) ──
  | {
      tipo: "balance";
      id: string;
      meDebenUsd: number;
      deboUsd: number;
      personas: (PersonaVista & { userId: string; meDebeUsd: number; leDeboUsd: number; items: { titulo: string; usd: number; salidaId: string }[] })[];
    }
  | {
      tipo: "salida_vista";
      id: string;
      salidaId: string;
      titulo: string;
      emoji: string;
      fecha: string;
      totalTexto: string;
      totalUsd: number;
      debenUsd: number;
      pagadoUsd: number;
      cerrada: boolean;
      puedoRecordar: boolean;
      personas: (PersonaVista & { yo: boolean; parteUsd: number; estado: "puso" | "pagado" | "por-confirmar" | "parcial" | "falta"; detalle: string })[];
    }
  | {
      tipo: "gastos";
      id: string;
      periodo: string;
      totalUsd: number;
      salidas: number;
      meses: { key: string; label: string; usd: number }[];
      categorias: { id: string; label: string; emoji: string; usd: number }[];
      mayor: { titulo: string; usd: number } | null;
    }
  | {
      tipo: "cuotas";
      id: string;
      cuotas: { tienda: string; n: number; de: number; fecha: string; dias: number; usd: number; mia: boolean; titular: string; salidaId: string }[];
    }
  | {
      tipo: "tasas";
      id: string;
      bcvUsd: number;
      bcvEur: number;
      usdt: number | null;
      fecha: string;
      historia: { bcvUsd: number[]; bcvEur: number[]; usdt: number[] };
      cambio: { bcvUsd?: number | null; bcvEur?: number | null; usdt?: number | null };
    };

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
