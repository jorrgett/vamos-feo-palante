// Datos de pago móvil listos para pegar en la app del banco. Lo que se muestra queda bonito
// ("V-12.345.678", "Bs 9.480,27"), pero lo que se copia va limpio: si se pega "0414-1234567" o
// "V-12345678" en un campo con límite de caracteres, el banco corta el último dígito.

type PagoMovil = { banco?: string; telefono?: string; cedula?: string };

const digits = (s: string) => s.replace(/\D/g, "");

/** Código de 4 dígitos del banco ("0104 Venezolano de Crédito" → "0104"). */
export function bankCode(banco?: string): string {
  return banco?.match(/\b0\d{3}\b/)?.[0] ?? (banco ?? "").trim();
}

/** Teléfono de 11 dígitos con el 0 adelante ("+58 414-123.45.67" → "04141234567"). */
export function phoneForBank(tel?: string): string {
  let d = digits(tel ?? "");
  if (d.startsWith("58") && d.length === 12) d = d.slice(2);
  if (d.length === 10 && d.startsWith("4")) d = `0${d}`;
  return d;
}

/** Cédula/RIF: la letra (V, E, J, P, G) y los números por separado ("V-12.345.678" → V + "12345678"). */
export function docParts(ci?: string): { letter: string; number: string } {
  const s = (ci ?? "").trim().toUpperCase();
  const letter = s.match(/^[VEJPG]/)?.[0] ?? "V";
  return { letter, number: digits(s) };
}

/** Monto sin separador de miles y con coma decimal (946.027 céntimos → "9460,27"). */
export function amountForBank(cents: number): string {
  const c = Math.max(0, Math.round(cents));
  return `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`;
}

/**
 * Todo junto, un dato por línea y sin etiquetas, como lo leen los "Pegar datos" de los bancos
 * (código del banco, teléfono, cédula y monto). Para V va solo el número; otra letra se deja pegada.
 */
export function pagoMovilBlock(pm: PagoMovil, amountCents?: number): string {
  const doc = docParts(pm.cedula);
  return [
    pm.banco && bankCode(pm.banco),
    pm.telefono && phoneForBank(pm.telefono),
    pm.cedula && (doc.letter === "V" ? doc.number : `${doc.letter}${doc.number}`),
    amountCents != null && amountForBank(amountCents),
  ]
    .filter(Boolean)
    .join("\n");
}
