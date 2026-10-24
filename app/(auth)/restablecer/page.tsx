import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Contraseña nueva" };

export default async function Restablecer({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token)
    return (
      <div className="text-center">
        <p className="text-5xl">🤔</p>
        <h1 className="display mt-3 text-2xl font-extrabold">Falta el link</h1>
        <p className="mt-2 text-muted">Abre el link que te llegó al correo, o pide uno nuevo.</p>
        <Link href="/olvide" className="btn-pop mt-6 h-11 px-6">
          Pedir link nuevo
        </Link>
      </div>
    );
  return <ResetForm token={token} />;
}
