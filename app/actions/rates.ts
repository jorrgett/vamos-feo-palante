"use server";

import { requireUser } from "@/lib/auth";
import { getRates, getRatesForDate } from "@/lib/rates";
import { todayVE } from "@/lib/dates";

/** Tasas que aplicaban un día (para gastos con fecha pasada). */
export async function ratesForDate(ymd: string) {
  await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  if (ymd >= todayVE()) return getRates();
  return getRatesForDate(ymd);
}
