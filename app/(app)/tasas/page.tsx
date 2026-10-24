import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { rateHistory } from "@/lib/rates";
import { RatesView } from "./rates-view";

export const metadata: Metadata = { title: "Tasas" };

export default async function Tasas({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await requireUser();
  const { dias } = await searchParams;
  const days = [30, 90, 365].includes(Number(dias)) ? Number(dias) : 90;
  const history = await rateHistory(days);
  return <RatesView history={history} days={days} />;
}
