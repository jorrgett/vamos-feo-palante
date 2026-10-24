import { NextResponse } from "next/server";
import { refreshBcv, refreshUsdt, seedHistory } from "@/lib/rates";

export const maxDuration = 60;

// Vercel Cron lo llama una vez al día; también sirve para forzar una actualización.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const [bcv, usdt, seed] = await Promise.all([refreshBcv(), refreshUsdt(), seedHistory().catch((e) => ({ error: String(e) }))]);
  return NextResponse.json({ bcv, usdt, seed });
}
