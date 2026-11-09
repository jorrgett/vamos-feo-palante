import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRates } from "@/lib/rates";
import { fmtNumber } from "@/lib/money";
import { BrandMark, Doodle } from "@/components/brand";

// Entrada privada: esto es solo para los panas, nada de páginas de venta.
export default async function Portada({ searchParams }: { searchParams: Promise<{ adios?: string }> }) {
  const { adios } = await searchParams;
  if (await getCurrentUser()) redirect("/inicio");
  const rates = await getRates().catch(() => null);

  return (
    <main className="paper grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm text-center">
        <div className="relative mx-auto w-fit">
          <BrandMark size={128} className="wobble" vivo priority />
          <Doodle kind="star" className="absolute -top-3 -right-9 size-9 rotate-12 text-mango" />
          <Doodle kind="squiggle" className="absolute -bottom-2 -left-12 size-12 text-faint" />
        </div>
        {adios && (
          <p className="mx-auto mt-6 max-w-xs rounded-2xl border-2 border-ink bg-card px-4 py-3 text-sm font-semibold">
            Tu cuenta y tus datos se borraron por completo. ¡Pa&apos;lante! 🤙
          </p>
        )}
        <h1 className="display mt-7 text-[3.4rem] leading-[0.92] font-extrabold">
          Vamos feo
          <br />
          <span className="marker">pa&apos;lante</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xs text-[1.05rem] text-muted">
          La libreta de las salidas con los panas: quién puso, quién debe y quién se está haciendo el loco 👀
        </p>
        <div className="mt-8 grid gap-3">
          <Link href="/entrar" className="btn-pop h-13 text-lg">
            Entrar
          </Link>
          <Link href="/registro" className="btn-pop btn-pop-paper h-13 text-lg">
            Me invitaron
          </Link>
        </div>
        {rates && (
          <p className="num mt-9 text-xs text-muted">
            Hoy · BCV {fmtNumber(rates.bcvUsd)} · € {fmtNumber(rates.bcvEur)}
            {rates.usdt ? ` · USDT ${fmtNumber(rates.usdt)}` : ""}
          </p>
        )}
        <p className="mt-2 text-xs text-faint">hecho entre panas 🇻🇪</p>
      </div>
    </main>
  );
}
