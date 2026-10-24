import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getEverything } from "@/lib/data";
import { categoriesOf, categoryOf } from "@/lib/constants";
import { dueLabel } from "@/lib/cashea";
import { prettyDay, ymdOf } from "@/lib/dates";
import { checklistRows } from "@/lib/salida-view";
import { paidProgress } from "@/lib/share-status";
import { SalidasList, type SalidaCard } from "./salidas-list";

export const metadata: Metadata = { title: "Salidas" };

export default async function Salidas() {
  const user = await requireUser();
  const bundles = await getEverything(user.id);
  const cards: SalidaCard[] = bundles
    .filter(({ ledger }) => ledger.expenses[0])
    .map(({ ledger }) => {
      const e = ledger.expenses[0];
      const rows = checklistRows(ledger);
      const p = paidProgress(rows);
      const mine = rows.find((r) => r.isMe);
      const toCollect = rows.filter((r) => r.iCollect).reduce((a, r) => a + Math.max(0, r.owesUsd - r.paidUsd), 0);
      const toPay = mine && mine.owesUsd > 0 ? Math.max(0, mine.owesUsd - mine.paidUsd) : 0;
      return {
        id: ledger.group.id,
        title: e.title,
        emoji: categoryOf(e.category).emoji,
        color: categoryOf(e.category).color,
        extraEmojis: categoriesOf(e)
          .slice(1)
          .map((c) => c.emoji)
          .join(""),
        date: ymdOf(e.spentAt),
        dateLabel: prettyDay(ymdOf(e.spentAt), true),
        place: e.place,
        totalUsd: e.amountUsd,
        people: ledger.members.filter((m) => e.shares.some((s) => s.memberId === m.id)).map((m) => ({ emoji: m.avatar, color: m.color, name: m.name })),
        closed: !!ledger.group.closedAt,
        paid: p.paid,
        debtors: p.debtors,
        waiting: p.waiting,
        toCollect,
        toPay,
        // Si es por cuotas de Cashea, lo que importa es la próxima cuota, no el total.
        nextCuota:
          toPay > 0 && mine?.cuota
            ? { usd: mine.cuota.payUsd, label: `${mine.cuota.n === 0 ? "Tu inicial" : `Tu cuota ${mine.cuota.n}`} · ${dueLabel(mine.cuota.daysLeft)}`, late: mine.cuota.daysLeft < 0 }
            : null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between gap-3">
          <h1 className="display text-3xl font-extrabold sm:text-4xl">Salidas 🎉</h1>
          <Link href="/salidas/nueva" className="btn-pop h-10 shrink-0 px-4 text-sm sm:h-11 sm:px-5 sm:text-base">
            <Plus size={18} /> Anotar
          </Link>
        </div>
        <p className="mt-1 text-muted">Cada vez que salen, una salida: quién fue, quién puso y quién ya pagó.</p>
      </div>
      <SalidasList cards={cards} />
    </div>
  );
}
