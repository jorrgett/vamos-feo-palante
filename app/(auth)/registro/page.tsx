import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getInviteCode, userCount } from "@/lib/community";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default async function Page({ searchParams }: { searchParams: Promise<{ invitacion?: string }> }) {
  const { invitacion } = await searchParams;
  if (await getCurrentUser()) redirect("/inicio");
  const first = (await userCount()) === 0;
  const valid = first || (!!invitacion && invitacion === (await getInviteCode()));
  if (!valid)
    return (
      <div className="text-center">
        <p className="text-5xl">🔐</p>
        <h1 className="display mt-3 text-2xl font-extrabold">Solo con invitación</h1>
        <p className="mt-2 text-muted">Esta app es solo para los panas. Pídele a alguien de adentro que te mande el link de invitación (está en «Panas → Invitar»).</p>
        <Link href="/entrar" className="btn-pop btn-pop-paper mt-6 h-11 px-6">
          Ya tengo cuenta
        </Link>
      </div>
    );
  return <AuthForm mode="register" invite={invitacion} first={first} />;
}
