import "server-only";
import { getEverything } from "@/lib/data";
import { casheaDues } from "@/lib/insights";
import { pendingConfirmations, personBalances } from "@/lib/people";

/** Sugerencias según cómo están las cuentas de cada quien. */
export async function sugerenciasPilas(userId: string): Promise<string[]> {
  const bundles = await getEverything(userId);
  const people = personBalances(bundles);
  const out: string[] = [];
  if (people.some((p) => p.iOwe > 0)) out.push("¿A quién le debo y por qué?");
  const deudor = [...people].filter((p) => p.owedToMe > 0).sort((a, b) => b.owedToMe - a.owedToMe)[0];
  if (deudor) out.push(`Recuérdale a ${deudor.name.split(" ")[0]} que me debe`);
  if (pendingConfirmations(bundles, "cobro").length) out.push("¿Qué pagos tengo por confirmar?");
  const abierta = bundles.find((b) => !b.ledger.group.closedAt && b.ledger.expenses[0]);
  if (abierta) out.push(`Explícame «${abierta.ledger.expenses[0].title}»`);
  if (casheaDues(bundles, 30).length) out.push("¿Cuándo vence mi próxima cuota?");
  out.push("Quiero anotar una salida");
  if (out.length < 5) out.push("¿Cuánto he gastado este mes?");
  if (out.length < 5) out.push("¿Cuánto son $20 en bolívares?");
  return out.slice(0, 5);
}
