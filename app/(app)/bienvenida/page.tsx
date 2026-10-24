import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getInviteCode, userCount } from "@/lib/community";
import { Onboarding } from "./onboarding";

export const metadata: Metadata = { title: "Bienvenido" };

export default async function Bienvenida() {
  const user = await requireUser();
  const [code, n] = await Promise.all([getInviteCode(), userCount()]);
  return <Onboarding user={{ name: user.name, avatar: user.avatar, color: user.color, payInfo: user.payInfo }} inviteCode={code} alone={n <= 1} />;
}
