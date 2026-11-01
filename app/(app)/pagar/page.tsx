import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getEverything } from "@/lib/data";
import { personBalances } from "@/lib/people";
import { aiEnabled } from "@/lib/ai";
import { PayWizard, type Creditor } from "./pay-wizard";

export const metadata: Metadata = { title: "Pagar" };

export default async function Pagar({ searchParams }: { searchParams: Promise<{ a?: string; s?: string; todo?: string }> }) {
  const user = await requireUser();
  const { a, s, todo } = await searchParams;
  const bundles = await getEverything(user.id);
  const owe = personBalances(bundles).filter((b) => b.iOwe > 0);
  const db = await getDb();
  const infos = owe.length
    ? await db.select({ id: schema.users.id, payInfo: schema.users.payInfo }).from(schema.users).where(inArray(schema.users.id, owe.map((b) => b.userId)))
    : [];
  const creditors: Creditor[] = owe.map((b) => ({
    userId: b.userId,
    name: b.name,
    avatar: b.avatar,
    color: b.color,
    amount: b.iOwe,
    items: b.iOweItems.map((i) => ({ salidaId: i.salidaId, title: i.title, emoji: i.emoji, date: i.date, remainingUsd: i.remainingUsd, rateSource: i.rateSource, cuota: i.cuota ?? null, registeredRate: i.registeredRate ?? null })),
    payInfo: infos.find((x) => x.id === b.userId)?.payInfo ?? {},
  }));
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="display text-3xl font-extrabold sm:text-4xl">Pagarle a un pana 💸</h1>
      <p className="mt-1 mb-5 text-muted">Te guío: a quién, qué le estás pagando y sus datos para pagarle. Al final le llega el aviso para que confirme.</p>
      <PayWizard creditors={creditors} preselect={creditors.some((c) => c.userId === a) ? a : undefined} salida={s} aiOn={aiEnabled()} payAll={todo === "1"} />
    </div>
  );
}
