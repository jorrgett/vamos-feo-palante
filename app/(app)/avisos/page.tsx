import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notify";
import { ymdOf } from "@/lib/dates";
import { NoticesView } from "./notices-view";

export const metadata: Metadata = { title: "Avisos" };

export default async function Avisos() {
  const user = await requireUser();
  const rows = await listNotifications(user.id, 120);
  return (
    <NoticesView
      items={rows.map((r) => ({
        id: r.id,
        emoji: r.emoji,
        title: r.title,
        body: r.body,
        url: r.url,
        kind: r.kind,
        unread: !r.readAt,
        day: ymdOf(r.createdAt),
        time: r.createdAt.toISOString(),
      }))}
    />
  );
}
