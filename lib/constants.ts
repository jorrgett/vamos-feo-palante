export const CATEGORIES = [
  { id: "comida", label: "Comida", emoji: "🍔", color: "#FF8A4C" },
  { id: "bebidas", label: "Rumba y tragos", emoji: "🍻", color: "#FFC145" },
  { id: "cafe", label: "Café y postres", emoji: "☕", color: "#C08457" },
  { id: "mercado", label: "Mercado", emoji: "🛒", color: "#4ADE80" },
  { id: "transporte", label: "Transporte", emoji: "🚕", color: "#38BDF8" },
  { id: "gasolina", label: "Gasolina", emoji: "⛽", color: "#F472B6" },
  { id: "viaje", label: "Viaje y playa", emoji: "🏖️", color: "#2DD4BF" },
  { id: "hospedaje", label: "Hospedaje", emoji: "🏨", color: "#A78BFA" },
  { id: "entradas", label: "Cine y entradas", emoji: "🎟️", color: "#FB7185" },
  { id: "regalo", label: "Regalo / colecta", emoji: "🎁", color: "#E879F9" },
  { id: "servicios", label: "Servicios", emoji: "💡", color: "#FACC15" },
  { id: "otro", label: "Otro", emoji: "✨", color: "#94A3B8" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export const categoryOf = (id: string) => CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];

/** Todas las categorías de una cuenta: la principal primero y después las demás que se marcaron. */
export const categoriesOf = (e: { category: string; extraCategories?: readonly string[] | null }) =>
  [...new Set([e.category, ...(e.extraCategories ?? [])])].map(categoryOf);

/** «Comida + Rumba y tragos». */
export const categoryLabel = (e: { category: string; extraCategories?: readonly string[] | null }) =>
  categoriesOf(e)
    .map((c) => c.label)
    .join(" + ");

export const PAY_METHODS = [
  { id: "efectivo_usd", label: "Efectivo $", emoji: "💵", currency: "USD" },
  { id: "pago_movil", label: "Pago móvil", emoji: "📲", currency: "VES" },
  { id: "punto", label: "Punto / débito", emoji: "💳", currency: "VES" },
  { id: "efectivo_bs", label: "Efectivo Bs", emoji: "🪙", currency: "VES" },
  { id: "zelle", label: "Zelle", emoji: "⚡", currency: "USD" },
  { id: "binance", label: "Binance / USDT", emoji: "🟡", currency: "USDT" },
  { id: "cashea", label: "Cashea", emoji: "🛍️", currency: "USD" },
  { id: "tarjeta", label: "Tarjeta internacional", emoji: "🌎", currency: "USD" },
  { id: "efectivo_eur", label: "Efectivo €", emoji: "💶", currency: "EUR" },
  { id: "otro", label: "Otro", emoji: "🔁", currency: "USD" },
] as const;

export type PayMethodId = (typeof PAY_METHODS)[number]["id"];
export const payMethodOf = (id: string) => PAY_METHODS.find((m) => m.id === id) ?? PAY_METHODS[PAY_METHODS.length - 1];

export const AVATARS = ["😎", "🦊", "🐼", "🐯", "🦁", "🐸", "🐙", "🦄", "🐧", "🐨", "🐵", "🦉", "🐶", "🐱", "🐻", "🐰", "🦜", "🐢", "🦩", "🐝"];

export const MEMBER_COLORS = [
  "#FFB547",
  "#FF6B6B",
  "#2DD4BF",
  "#A78BFA",
  "#38BDF8",
  "#F472B6",
  "#4ADE80",
  "#FB923C",
  "#FACC15",
  "#60A5FA",
  "#E879F9",
  "#34D399",
];

export const GROUP_EMOJIS = ["🍻", "🍕", "🌮", "🍣", "🏖️", "🎉", "⚽", "🎮", "🏔️", "🤙", "🍔", "☕", "🎂", "🏠", "✈️", "🎸"];

export const BANKS_VE = [
  "0102 Banco de Venezuela",
  "0104 Venezolano de Crédito",
  "0105 Mercantil",
  "0108 Provincial",
  "0114 Bancaribe",
  "0115 Exterior",
  "0128 Banco Caroní",
  "0134 Banesco",
  "0137 Sofitasa",
  "0138 Banco Plaza",
  "0146 Bangente",
  "0151 BFC Fondo Común",
  "0156 100% Banco",
  "0157 DelSur",
  "0163 Banco del Tesoro",
  "0166 Banco Agrícola",
  "0168 Bancrecer",
  "0169 Mi Banco",
  "0171 Banco Activo",
  "0172 Bancamiga",
  "0173 Banco Internacional de Desarrollo",
  "0174 Banplus",
  "0175 Banco Digital de los Trabajadores",
  "0177 Banfanb",
  "0178 N58 Banco Digital",
  "0191 BNC Nacional de Crédito",
];
