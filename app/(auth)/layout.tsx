import Link from "next/link";
import { Logo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="paper grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mx-auto mb-6 flex w-fit">
          <Logo />
        </Link>
        <div className="sticker relative bg-card p-6 sm:p-7">
          <span className="tape -top-3 left-1/2 -translate-x-1/2 -rotate-2" />
          {children}
        </div>
      </div>
    </main>
  );
}
