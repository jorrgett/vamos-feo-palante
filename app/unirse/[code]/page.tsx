import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getInviteCode } from "@/lib/community";
import { getDb, schema } from "@/lib/db";
import { Logo } from "@/components/brand";
import { avatarText } from "@/lib/avatar";

export const metadata: Metadata = { title: "Te invitaron" };

export default async function Unirse({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (await getCurrentUser()) redirect("/inicio");
  const valid = code === (await getInviteCode());
  const db = await getDb();
  const panas = valid ? await db.select({ avatar: schema.users.avatar, name: schema.users.name }).from(schema.users).limit(12) : [];

  return (
    <main className="paper grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto mb-6 flex w-fit">
          <Logo />
        </Link>
        <div className="sticker relative bg-card p-6 text-center sm:p-7">
          <span className="tape -top-3 left-1/2 -translate-x-1/2 rotate-2" />
          {!valid ? (
            <>
              <p className="text-5xl">🙈</p>
              <h1 className="display mt-3 text-2xl font-bold">Este link ya no sirve</h1>
              <p className="mt-2 text-muted">Pídele a un pana el link nuevo de invitación.</p>
            </>
          ) : (
            <>
              <p className="text-5xl">🤙</p>
              <h1 className="display mt-3 text-3xl font-extrabold">¡Te invitaron!</h1>
              <p className="mt-2 text-muted">Aquí los panas anotan las salidas, quién puso la plata y quién ya pagó. Sin enredos.</p>
              {panas.length > 0 && (
                <>
                  <p className="mt-4 text-2xl tracking-tight">{panas.map((p) => avatarText(p.avatar)).join(" ")}</p>
                  <p className="text-sm text-muted">{panas.map((p) => p.name).join(", ")} {panas.length === 1 ? "ya está" : "ya están"} adentro.</p>
                </>
              )}
              <div className="mt-6 grid gap-2.5">
                <Link href={`/registro?invitacion=${code}`} className="btn-pop h-12">
                  Crear mi cuenta
                </Link>
                <Link href="/entrar" className="btn-pop btn-pop-paper h-12">
                  Ya tengo cuenta
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
