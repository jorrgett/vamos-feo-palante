import type { Metadata } from "next";
import { requireAdmin, serverNow } from "@/lib/admin";
import { adminOverview } from "@/lib/community";
import { AdminHeader } from "./admin-header";
import { AdminView } from "./admin-view";

export const metadata: Metadata = { title: "Administrador" };

export default async function Admin() {
  const user = await requireAdmin();
  const panas = await adminOverview(user.id);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminHeader subtitle="Solo tú ves esto: quién tiene los avisos activos, quién no y por qué." />
      <AdminView
        now={serverNow()}
        panas={panas.map((p) => ({
          ...p,
          joinedAt: p.joinedAt.getTime(),
          lastSeenAt: p.lastSeenAt?.getTime() ?? null,
          devices: p.devices.map((d) => ({ label: d.label, since: d.since.getTime() })),
        }))}
      />
    </div>
  );
}
