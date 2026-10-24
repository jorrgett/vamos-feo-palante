"use server";

import { requireUser } from "@/lib/auth";
import { rotateInviteCode } from "@/lib/community";

export async function newInviteCode() {
  await requireUser();
  return rotateInviteCode();
}
