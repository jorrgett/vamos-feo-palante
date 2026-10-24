import { allocate } from "./money";

// Todas las cantidades de este módulo están en centavos de la moneda del gasto.

export type SplitMode = "equal" | "exact" | "percent" | "shares" | "items";

export type SplitItem = {
  id: string;
  name: string;
  /** Precio unitario en centavos. */
  price: number;
  qty: number;
  /** Quiénes consumieron el ítem (se reparte en partes iguales entre ellos). */
  members: string[];
};

export type Extra = {
  id: string;
  label: string;
  kind: "percent" | "fixed";
  /** Porcentaje (10 = 10 %) o monto fijo en centavos. */
  value: number;
};

export type SplitInput =
  | { mode: "equal"; base: number; members: string[] }
  | { mode: "exact"; amounts: Record<string, number> }
  | { mode: "percent"; base: number; percents: Record<string, number> }
  | { mode: "shares"; base: number; weights: Record<string, number> }
  | { mode: "items"; items: SplitItem[] };

export type SplitResult = {
  base: number;
  extras: { id: string; label: string; amount: number }[];
  total: number;
  /** Lo que le toca a cada miembro, ya con extras incluidos. */
  shares: Record<string, number>;
  /** Parte de cada miembro antes de extras. */
  baseShares: Record<string, number>;
};

export class SplitError extends Error {}

export const EXTRA_PRESETS: Omit<Extra, "id">[] = [
  { label: "Servicio", kind: "percent", value: 10 },
  { label: "Propina", kind: "percent", value: 10 },
  { label: "IVA", kind: "percent", value: 16 },
  { label: "IGTF", kind: "percent", value: 3 },
  { label: "Delivery", kind: "fixed", value: 0 },
];

function baseShares(input: SplitInput): Record<string, number> {
  switch (input.mode) {
    case "equal": {
      if (input.members.length === 0) throw new SplitError("Elige al menos una persona para dividir.");
      const parts = allocate(input.base, input.members.map(() => 1));
      return Object.fromEntries(input.members.map((m, i) => [m, parts[i]]));
    }
    case "exact": {
      const entries = Object.entries(input.amounts).filter(([, v]) => v > 0);
      if (entries.length === 0) throw new SplitError("Indica cuánto le toca a cada quien.");
      return Object.fromEntries(entries);
    }
    case "percent": {
      const entries = Object.entries(input.percents).filter(([, v]) => v > 0);
      const sum = entries.reduce((a, [, v]) => a + v, 0);
      if (entries.length === 0) throw new SplitError("Asigna porcentajes.");
      if (Math.abs(sum - 100) > 0.01) throw new SplitError(`Los porcentajes suman ${sum.toFixed(2)} %, deben sumar 100 %.`);
      const parts = allocate(input.base, entries.map(([, v]) => v));
      return Object.fromEntries(entries.map(([m], i) => [m, parts[i]]));
    }
    case "shares": {
      const entries = Object.entries(input.weights).filter(([, v]) => v > 0);
      if (entries.length === 0) throw new SplitError("Asigna al menos una parte.");
      const parts = allocate(input.base, entries.map(([, v]) => v));
      return Object.fromEntries(entries.map(([m], i) => [m, parts[i]]));
    }
    case "items": {
      if (input.items.length === 0) throw new SplitError("Agrega lo que consumieron.");
      const acc: Record<string, number> = {};
      for (const item of input.items) {
        if (item.members.length === 0) throw new SplitError(`"${item.name || "Ítem"}" no tiene a nadie asignado.`);
        const amount = Math.round(item.price * item.qty);
        const parts = allocate(amount, item.members.map(() => 1));
        item.members.forEach((m, i) => (acc[m] = (acc[m] ?? 0) + parts[i]));
      }
      return acc;
    }
  }
}

export function computeSplit(input: SplitInput, extras: Extra[] = []): SplitResult {
  const bases = baseShares(input);
  const members = Object.keys(bases);
  const base = members.reduce((a, m) => a + bases[m], 0);
  if (base <= 0) throw new SplitError("El monto debe ser mayor que cero.");

  const extraAmounts = extras
    .filter((e) => e.value > 0)
    .map((e) => ({ id: e.id, label: e.label, amount: e.kind === "percent" ? Math.round((base * e.value) / 100) : Math.round(e.value) }));
  const extrasTotal = extraAmounts.reduce((a, e) => a + e.amount, 0);

  // Los extras se reparten en proporción a lo que consumió cada quien.
  const extraParts = allocate(extrasTotal, members.map((m) => bases[m]));
  const shares = Object.fromEntries(members.map((m, i) => [m, bases[m] + extraParts[i]]));

  return { base, extras: extraAmounts, total: base + extrasTotal, shares, baseShares: bases };
}

/** Reparte el total en USD con los mismos pesos que las partes en moneda original (suma exacta). */
export function sharesToUsd(shares: Record<string, number>, totalUsd: number): Record<string, number> {
  const members = Object.keys(shares);
  const parts = allocate(totalUsd, members.map((m) => shares[m]));
  return Object.fromEntries(members.map((m, i) => [m, parts[i]]));
}
