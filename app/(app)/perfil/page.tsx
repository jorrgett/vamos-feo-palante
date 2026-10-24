import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/community";
import { getEverything } from "@/lib/data";
import { ProfileView, type DeletionPreview } from "./profile-view";

export const metadata: Metadata = { title: "Perfil" };

export default async function Perfil() {
  const user = await requireUser();
  const [bundles, admin] = await Promise.all([getEverything(user.id), isAdmin(user.id)]);
  // Qué pasaría con cada grupo si borra la cuenta.
  const deletion: DeletionPreview = { alone: [], shared: [] };
  for (const { ledger, summary } of bundles) {
    const others = ledger.members.some((m) => m.userId && m.userId !== user.id);
    const g = { id: ledger.group.id, name: ledger.group.name, emoji: ledger.group.emoji };
    if (others) deletion.shared.push({ ...g, balance: summary.balances[ledger.me.id] ?? 0 });
    else deletion.alone.push(g);
  }
  return <ProfileView user={user} deletion={deletion} admin={admin} />;
}
