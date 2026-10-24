// Novedades de la app: cada vez que se publiquen cambios que los panas noten, se agrega una entrada ARRIBA.
// A cada quien le sale un pantallazo con lo nuevo la primera vez que abre la app después de publicar.

export type Release = {
  /** Único y nunca se cambia (lo que se guarda como "visto"). */
  id: string;
  /** Fecha (Caracas) en formato AAAA-MM-DD. */
  date: string;
  emoji: string;
  title: string;
  items: { emoji: string; text: string }[];
};

export const RELEASES: Release[] = [
  {
    id: "2026-10-24.1",
    date: "2026-10-24",
    emoji: "🛍️",
    title: "Salidas con Cashea: pagas por cuotas",
    items: [
      { emoji: "📅", text: "Si un pana pagó con Cashea en modo espejo, ya no te sale que debes todo: te sale tu próxima cuota, cuánto es y cuándo vence." },
      { emoji: "💸", text: "Al pagar eliges: solo la cuota o todo de una para quedar al día." },
      { emoji: "⏰", text: "Te avisamos cuando se acerca: a 3 días, a 2 días, mañana y el mismo día. Si ya pagaste tu parte, no te llega." },
      { emoji: "🔒", text: "Solo quien tiene el Cashea marca sus cuotas como pagadas a Cashea; los demás pagan su parte con «Pagar cuota»." },
    ],
  },
  {
    id: "2026-10-19.4",
    date: "2026-10-19",
    emoji: "⏰",
    title: "Recordatorio diario de lo que debes",
    items: [
      { emoji: "💸", text: "Cada mañana, si debes algo en una salida abierta, te llega un aviso con cuánto y a quién. Al tocarlo vas directo a pagar." },
      { emoji: "📦", text: "Es un solo aviso al día con todas tus salidas, y el de ayer se borra solo para que no se te llene la campanita." },
      { emoji: "✅", text: "Si te pagaron y no has confirmado, también te lo recuerda. Cuando todo esté pagado o la salida se cierre, deja de llegar." },
    ],
  },
  {
    id: "2026-10-19.3",
    date: "2026-10-19",
    emoji: "🍔",
    title: "Una salida puede tener varias categorías",
    items: [
      { emoji: "✅", text: "Al anotar una salida ya puedes marcar varias categorías: comida y rumba, viaje y hospedaje… lo que haya sido." },
      { emoji: "1️⃣", text: "La primera que marques es la que sale de ícono; las demás aparecen chiquitas al lado." },
      { emoji: "📊", text: "En «¿En qué se va?» del inicio, lo tuyo se reparte entre todas las categorías de la salida." },
    ],
  },
  {
    id: "2026-10-19.2",
    date: "2026-10-19",
    emoji: "📋",
    title: "Copiar los datos del pago móvil, sin que el banco los corte",
    items: [
      { emoji: "✂️", text: "Al copiar el teléfono, la cédula o el monto se copian limpios (sin puntos, guiones ni letras), así la app de tu banco no les corta el último número." },
      { emoji: "💰", text: "El monto se copia como lo piden los bancos: 9480,27 en vez de 9.480,27." },
      { emoji: "📲", text: "«Copiar todo» deja banco, teléfono, cédula y monto uno debajo del otro, listo para «Pegar datos» en tu banco." },
    ],
  },
  {
    id: "2026-10-19.1",
    date: "2026-10-19",
    emoji: "🤖",
    title: "Comprobantes de pago y la IA te echa una mano",
    items: [
      { emoji: "📎", text: "Al pagarle a un pana puedes adjuntar la captura del pago (pago móvil, Zelle, Binance…). El que cobra la ve antes de confirmar." },
      { emoji: "🔎", text: "La IA lee la captura: saca el monto y la referencia, y te avisa si no cuadra con lo que debías o si no le llegó a la persona correcta." },
      { emoji: "🧾", text: "Al anotar una salida, escanea la factura: la IA saca cada cosa, el IVA, el servicio y el total." },
      { emoji: "🙋", text: "Después te pregunta quién pidió qué, una cosa a la vez, y la cuenta queda dividida sola." },
    ],
  },
  {
    id: "2026-10-16.5",
    date: "2026-10-16",
    emoji: "📸",
    title: "Fotos de perfil desde cualquier teléfono",
    items: [
      { emoji: "🤖", text: "Ya se puede poner foto desde Android, también las fotos de «alta eficiencia» (HEIC) que antes no abrían." },
      { emoji: "📷", text: "Puedes tomarte la foto con la cámara directo desde la app." },
      { emoji: "🤙", text: "¿En tu iPhone la app sale con una «P» gris? Borra el ícono y agrégalo de nuevo desde Safari: ahora sí sale la mano." },
    ],
  },
  {
    id: "2026-10-16.4",
    date: "2026-10-16",
    emoji: "🧹",
    title: "Novedades y avisos más ordenados",
    items: [
      { emoji: "✨", text: "Nueva sección Novedades: cada vez que mejoremos la app te sale aquí lo nuevo (está en «Más»)." },
      { emoji: "👈", text: "Ya puedes borrar avisos: desliza uno a la izquierda o toca la ✕." },
      { emoji: "🧹", text: "«Borrar los que ya viste» o «Borrar todos» para dejar la campanita limpia. Los vistos hace más de 30 días se borran solos." },
    ],
  },
  {
    id: "2026-10-16.3",
    date: "2026-10-16",
    emoji: "📸",
    title: "Tu foto de perfil",
    items: [
      { emoji: "📸", text: "Pon tu foto o sigue con tu emoji: Perfil → Cómo te ven → Foto." },
      { emoji: "✂️", text: "Ajústala antes de guardarla: muévela con el dedo, acércala o gírala." },
      { emoji: "🌙", text: "Íconos y textos más claros en modo oscuro." },
    ],
  },
  {
    id: "2026-10-16.2",
    date: "2026-10-16",
    emoji: "📱",
    title: "Mejor en el teléfono",
    items: [
      { emoji: "🤙", text: "La app tiene su ícono al agregarla a la pantalla de inicio." },
      { emoji: "📲", text: "Adiós a la franja negra de arriba, y el botón «Siguiente» ya no queda tapado." },
      { emoji: "🧾", text: "Las categorías y las formas de dividir la cuenta se ven completas." },
      { emoji: "💳", text: "Cashea ahora muestra los niveles del 1 al 6." },
    ],
  },
  {
    id: "2026-10-16.1",
    date: "2026-10-16",
    emoji: "🎉",
    title: "Vamos feo pa'lante",
    items: [
      { emoji: "🎉", text: "Cada vez que salen es una salida: quién fue, quién puso la plata y quién ya pagó." },
      { emoji: "🤝", text: "Solo con invitación: todos los panas conectados, sin escribir nombres." },
      { emoji: "💸", text: "Pagar es guiado: te salen los datos de pago del pana y él confirma que le llegó." },
      { emoji: "🔑", text: "«Olvidé mi contraseña» te manda un link al correo." },
    ],
  },
];

export const LATEST_RELEASE = RELEASES[0].id;

/** Para quien nunca vio el pantallazo (los que ya estaban): se le muestra lo que llegó después de esta. */
const BASELINE = "2026-10-16.2";

/** Lo que le falta por ver (máximo 3 entradas en el pantallazo; el resto está en la página de Novedades). */
export function unseenReleases(seen: string | null): Release[] {
  const idx = RELEASES.findIndex((r) => r.id === (seen ?? BASELINE));
  return RELEASES.slice(0, idx === -1 ? RELEASES.length : idx).slice(0, 3);
}
