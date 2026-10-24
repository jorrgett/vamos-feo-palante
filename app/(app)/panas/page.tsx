import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getInviteCode, listPanas } from "@/lib/community";
import { getEverything } from "@/lib/data";
import { personBalances } from "@/lib/people";
import { InviteCard } from "@/components/invite-card";
import { Money } from "@/components/display";
import { Avatar } from "@/components/ui";

export const metadata: Metadata = { title: "Panas" };

export default async function Panas() {
  const user = await requireUser();
  const [panas, bundles, code] = await Promise.all([listPanas(user.id), getEverything(user.id), getInviteCode()]);
  const balances = new Map(personBalances(bundles).map((b) => [b.userId, b]));
  const others = panas.filter((p) => !p.isMe);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div>
          <h1 className="display text-3xl font-extrabold sm:text-4xl">Los panas 🤙</h1>
          <p className="mt-1 text-muted">Todos los que están en la app. Toca a uno para ver sus datos de pago y lo que tienen pendiente.</p>
        </div>
        {others.length === 0 ? (
          <div className="sticker bg-sun p-5 text-sun-ink">
            <p className="display text-xl font-bold">Estás solito por aquí 😅</p>
            <p className="mt-1 text-sm opacity-80">Invita a tus panas con el link de al lado: cuando entren, aparecen aquí y ya los puedes meter en las salidas.</p>
          </div>
        ) : (
          <ul className="card divide-y divide-line overflow-clip">
            {others.map((p) => {
              const b = balances.get(p.id);
              return (
                <li key={p.id}>
                  <Link href={`/panas/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-card-2/60">
                    <Avatar emoji={p.avatar} color={p.color} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{p.name}</p>
                      <p className="text-xs text-muted">{p.hasPayInfo ? "📲 Tiene sus datos de pago" : "Sin datos de pago todavía"}</p>
                    </div>
                    <div className="text-right text-sm">
                      {b && b.owedToMe > 0 && (
                        <p className="font-semibold text-mint">
                          te debe <Money usd={b.owedToMe} />
                        </p>
                      )}
                      {b && b.iOwe > 0 && (
                        <p className="font-semibold text-rose">
                          le debes <Money usd={b.iOwe} />
                        </p>
                      )}
                      {(!b || (!b.owedToMe && !b.iOwe)) && <p className="text-xs text-muted">a mano ✓</p>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <aside className="space-y-4">
        <InviteCard code={code} />
        <div className="card p-5 text-sm text-muted">
          <p className="font-semibold text-text">¿Cómo funciona?</p>
          <ol className="mt-2 space-y-1.5">
            <li>1. Mándale el link a tu pana.</li>
            <li>2. Crea su cuenta y carga sus datos de pago.</li>
            <li>3. Ya lo puedes meter en las salidas 🎉</li>
          </ol>
        </div>
      </aside>
    </div>
  );
}
