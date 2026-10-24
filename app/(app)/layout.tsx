import { requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/community";
import { myMemberships } from "@/lib/data";
import { getRates } from "@/lib/rates";
import { unreadCount } from "@/lib/notify";
import { DisplayProvider } from "@/components/display";
import { BottomNav, Sidebar, TopBar } from "@/components/nav";
import { DeviceReporter } from "@/components/push";
import { NovedadesModal } from "@/components/novedades";
import { unseenReleases } from "@/lib/novedades";
import { ToastProvider } from "@/components/ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [memberships, rates, unread, admin] = await Promise.all([myMemberships(user.id), getRates(), unreadCount(user.id), isAdmin(user.id)]);
  // En la barra lateral: las salidas abiertas.
  const groups = memberships
    .filter((m) => !m.group.closedAt)
    .slice(0, 12)
    .map((m) => ({ id: m.group.id, name: m.group.name, emoji: m.group.emoji, color: m.group.color }));
  const navUser = { name: user.name, avatar: user.avatar, color: user.color, email: user.email };
  // Lo nuevo desde la última vez (no a quien todavía está en la bienvenida).
  const news = user.onboarded ? unseenReleases(user.seenNovedades) : [];

  return (
    <DisplayProvider initialCurrency={user.displayCurrency} initialRateSource={user.rateSource} rates={rates}>
      <ToastProvider>
        <div className="paper flex min-h-dvh">
          <Sidebar user={navUser} groups={groups} admin={admin} news={news.length > 0} />
          <div className="flex min-w-0 flex-1 flex-col">
            <TopBar user={navUser} unread={unread} />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-28 sm:px-6 lg:pb-12">{children}</main>
          </div>
        </div>
        <BottomNav groups={groups} admin={admin} news={news.length > 0} />
        <DeviceReporter userId={user.id} />
        {news.length > 0 && <NovedadesModal releases={news} />}
      </ToastProvider>
    </DisplayProvider>
  );
}
