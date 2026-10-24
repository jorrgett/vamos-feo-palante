import type { Metadata } from "next";
import { Calculator } from "./calculator";

export const metadata: Metadata = { title: "Calculadora" };

export default function CalculadoraPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="display text-3xl font-extrabold sm:text-4xl">Calculadora rápida 🧮</h1>
      <p className="mt-1 mb-6 text-muted">Para dividir la cuenta en la mesa, sin guardar nada.</p>
      <Calculator />
    </div>
  );
}
