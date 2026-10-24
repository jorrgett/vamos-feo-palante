import { AdminTabs } from "./admin-tabs";

/** Título y pestañas del panel del administrador. */
export function AdminHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="display text-3xl font-extrabold sm:text-4xl">Administrador 👑</h1>
        <p className="mt-1 text-muted">{subtitle}</p>
      </div>
      <AdminTabs />
    </div>
  );
}
