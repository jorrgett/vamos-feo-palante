import type { Metadata } from "next";
import { ForgotForm } from "./forgot-form";

export const metadata: Metadata = { title: "Olvidé mi contraseña" };

export default function Olvide() {
  return <ForgotForm />;
}
