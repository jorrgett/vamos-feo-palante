import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getEverything } from "@/lib/data";
import { activity } from "@/lib/insights";
import { HistoryView } from "./history-view";

export const metadata: Metadata = { title: "Historial" };

export default async function Historial() {
  const user = await requireUser();
  const bundles = await getEverything(user.id);
  const items = activity(bundles, 5000);
  const groups = bundles.map((b) => ({ id: b.ledger.group.id, name: b.ledger.group.name, emoji: b.ledger.group.emoji }));
  return <HistoryView items={items} groups={groups} />;
}
