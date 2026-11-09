import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { getEverything } from "@/lib/data";
import { personBalances } from "@/lib/people";
import { Avatar } from "@/components/ui";
import { PersonDebts } from "@/components/person-debts";
import { PersonActions } from "./person-actions";
import { PayInfoCard } from "@/components/pay-info-card";

export const metadata: Metadata = { title: "Pana" };

export default async function Pana({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = await getDb();
  const [p] = await db
    .select({ id: schema.users.id, name: schema.users.name, avatar: schema.users.avatar, color: schema.users.color, payInfo: schema.users.payInfo })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1);
  if (!p) notFound();
  const isMe = p.id === user.id;
  const bundles = await getEverything(user.id);
  const b = personBalances(bundles).find((x) => x.userId === id);
  const shared = bundles.filter(({ ledger }) => ledger.members.some((m) => m.userId === id)).length;

  return (
    <div className="entra mx-auto max-w-2xl space-y-5">
      <Link href="/panas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-text">
        <ArrowLeft size={16} /> Panas
      </Link>
      <div className="sticker flex items-center gap-4 bg-card p-5">
        <Avatar emoji={p.avatar} color={p.color} size={72} />
        <div className="min-w-0">
          <h1 className="display truncate text-3xl font-extrabold">{isMe ? `${p.name} (tú)` : p.name}</h1>
          <p className="text-sm text-muted">
            {shared} {shared === 1 ? "salida" : "salidas"} juntos
          </p>
        </div>
      </div>

      {!isMe && <PersonActions userId={p.id} name={p.name} owesMe={b?.owedToMe ?? 0} iOwe={b?.iOwe ?? 0} />}

      {b && b.owedToMe > 0 && (
        <section>
          <h2 className="display mb-2 text-lg font-bold">Te debe</h2>
          <PersonDebts kind="cobrar" people={[{ userId: p.id, name: p.name, avatar: p.avatar, color: p.color, amount: b.owedToMe, items: b.theyOweItems }]} />
        </section>
      )}
      {b && b.iOwe > 0 && (
        <section>
          <h2 className="display mb-2 text-lg font-bold">Le debes</h2>
          <PersonDebts kind="pagar" people={[{ userId: p.id, name: p.name, avatar: p.avatar, color: p.color, amount: b.iOwe, items: b.iOweItems }]} />
        </section>
      )}
      {!isMe && !b && <p className="card p-5 text-center text-sm text-muted">Están a mano 🤙 Nadie le debe nada a nadie.</p>}

      <PayInfoCard name={p.name} info={p.payInfo} isMe={isMe} />
    </div>
  );
}
