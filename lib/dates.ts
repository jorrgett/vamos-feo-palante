// Fechas "de calendario" (YYYY-MM-DD) en hora de Venezuela (UTC−4, sin horario de verano).

export const VE_TZ = "America/Caracas";

export function todayVE(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: VE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / 86_400_000);
}

const fmtDay = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDayYear = new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmtLong = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const ymdToDate = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

export function prettyDay(ymd: string, withYear = false): string {
  const today = todayVE();
  const delta = diffDays(ymd, today);
  if (delta === 0) return "hoy";
  if (delta === -1) return "ayer";
  if (delta === 1) return "mañana";
  const sameYear = ymd.slice(0, 4) === today.slice(0, 4);
  return (withYear || !sameYear ? fmtDayYear : fmtDay).format(ymdToDate(ymd)).replace(".", "");
}

export function longDay(ymd: string): string {
  return fmtLong.format(ymdToDate(ymd));
}

export function relativeDue(ymd: string): string {
  const delta = diffDays(ymd, todayVE());
  if (delta === 0) return "vence hoy";
  if (delta === 1) return "vence mañana";
  if (delta > 1) return `en ${delta} días`;
  if (delta === -1) return "venció ayer";
  return `venció hace ${-delta} días`;
}

/** Fecha VE (YYYY-MM-DD) de un instante. */
export function ymdOf(date: Date | string): string {
  return todayVE(typeof date === "string" ? new Date(date) : date);
}

export function monthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

const fmtMonth = new Intl.DateTimeFormat("es-VE", { month: "short", timeZone: "UTC" });
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return fmtMonth.format(new Date(Date.UTC(y, m - 1, 1))).replace(".", "");
}

/** Mediodía en Caracas de ese día, para guardar como timestamptz sin que cambie de fecha. */
export function noonVE(ymd: string): Date {
  return new Date(`${ymd}T12:00:00-04:00`);
}
