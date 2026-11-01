import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const money = (name: string) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export type PayInfo = {
  pagoMovil?: { banco?: string; telefono?: string; cedula?: string };
  zelle?: string;
  binance?: string;
  nota?: string;
};

/** Lo que reporta el teléfono de cada pana sobre los avisos (solo lo ve el administrador). */
export type DeviceStatus = {
  push: "no-soportado" | "ios-instalar" | "bloqueado" | "apagado" | "encendido";
  platform: "iphone" | "android" | "computadora" | "otro";
  installed: boolean;
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  avatar: text("avatar").notNull().default("🐮"),
  color: text("color").notNull().default("#FFB547"),
  /** Moneda en la que prefiere ver los montos: USD, VES o EUR. */
  displayCurrency: text("display_currency").notNull().default("USD"),
  /** Tasa preferida para mostrar bolívares: bcv | usdt | eur. */
  rateSource: text("rate_source").notNull().default("bcv"),
  payInfo: jsonb("pay_info").$type<PayInfo>().notNull().default({}),
  /** Cuándo terminó (o saltó) la bienvenida guiada. */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  /** Último estado de avisos de su teléfono y cuándo abrió la app por última vez. */
  deviceStatus: jsonb("device_status").$type<DeviceStatus>(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  /** Última entrada de Novedades que ya vio (lib/novedades.ts). */
  seenNovedades: text("seen_novedades"),
  createdAt: createdAt(),
});

/** Foto de perfil (opcional; si no hay, se usa el emoji). JPEG cuadrado chico, en base64. Se borra con la cuenta. */
export const userPhotos = pgTable("user_photos", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  data: text("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Links de "olvidé mi contraseña" (se guarda el sha256 del token). */
export const passwordResets = pgTable(
  "password_resets",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

/** Ajustes de la app (p. ej. el código de invitación de la comunidad). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 del token que viaja en la cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    key: text("key").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("login_attempts_key_idx").on(t.key, t.createdAt)],
);

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🍻"),
  color: text("color").notNull().default("#FFB547"),
  description: text("description"),
  inviteCode: text("invite_code").notNull().unique(),
  /** Tasa de referencia del grupo para convertir bolívares: bcv | usdt | eur | custom. */
  rateSource: text("rate_source").notNull().default("bcv"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** Salida cerrada (ya no se esperan más pagos). */
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    /** null = pana sin cuenta (todavía). Puede reclamar su lugar con el link de invitación. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    avatar: text("avatar").notNull().default("🙂"),
    color: text("color").notNull().default("#7DD3FC"),
    role: text("role").notNull().default("member"),
    createdAt: createdAt(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (t) => [index("members_group_idx").on(t.groupId), index("members_user_idx").on(t.userId)],
);

export type FxSnapshotJson = {
  vesPerUsd: number;
  vesPerEur?: number | null;
  vesPerUsdt?: number | null;
  source: string;
  date?: string;
};

export type SplitDataJson = {
  mode: "equal" | "exact" | "percent" | "shares" | "items";
  base?: number;
  members?: string[];
  amounts?: Record<string, number>;
  percents?: Record<string, number>;
  weights?: Record<string, number>;
  items?: { id: string; name: string; price: number; qty: number; members: string[] }[];
  extras?: { id: string; label: string; kind: "percent" | "fixed"; value: number }[];
};

export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Categoría principal (da el emoji y el color de la salida). */
    category: text("category").notNull().default("comida"),
    /** Las otras categorías que se marcaron (una salida puede ser comida y rumba a la vez). */
    extraCategories: text("extra_categories").array().notNull().default(sql`'{}'::text[]`),
    place: text("place"),
    notes: text("notes"),
    spentAt: timestamp("spent_at", { withTimezone: true }).notNull(),
    currency: text("currency").notNull(),
    /** Total con extras, en centavos de la moneda original. */
    amount: money("amount").notNull(),
    /** Total en centavos de USD (libro del grupo). */
    amountUsd: money("amount_usd").notNull(),
    fx: jsonb("fx").$type<FxSnapshotJson>().notNull(),
    split: jsonb("split").$type<SplitDataJson>().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("expenses_group_idx").on(t.groupId, t.spentAt)],
);

export const expensePayers = pgTable(
  "expense_payers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    currency: text("currency").notNull(),
    amount: money("amount").notNull(),
    amountUsd: money("amount_usd").notNull(),
    /** efectivo_usd | efectivo_bs | pago_movil | punto | zelle | binance | cashea | tarjeta | otro */
    method: text("method").notNull().default("efectivo_usd"),
  },
  (t) => [index("expense_payers_expense_idx").on(t.expenseId), index("expense_payers_member_idx").on(t.memberId)],
);

export const expenseShares = pgTable(
  "expense_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expenseId: uuid("expense_id")
      .notNull()
      .references(() => expenses.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** Parte en centavos de la moneda original. */
    amount: money("amount").notNull(),
    amountUsd: money("amount_usd").notNull(),
  },
  (t) => [index("expense_shares_expense_idx").on(t.expenseId), index("expense_shares_member_idx").on(t.memberId)],
);

export const casheaPlans = pgTable(
  "cashea_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "cascade" }),
    /** Quién tiene la orden en su Cashea. */
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    store: text("store"),
    /** principal | cotidiana | promo2 | mas6 | mas9 | mas12 */
    line: text("line").notNull().default("principal"),
    level: integer("level").notNull(),
    initialPct: doublePrecision("initial_pct").notNull(),
    installments: integer("installments").notNull(),
    intervalDays: integer("interval_days").notNull().default(14),
    /** Monto financiado por Cashea en centavos de USD (total de la orden). */
    totalUsd: money("total_usd").notNull(),
    initialUsd: money("initial_usd").notNull(),
    discountUsd: money("discount_usd").notNull().default(0),
    purchaseDate: date("purchase_date", { mode: "string" }).notNull(),
    /** espejo: los panas pagan su parte al ritmo de las cuotas · inmediato: pagan todo de una. */
    mode: text("mode").notNull().default("espejo"),
    createdAt: createdAt(),
  },
  (t) => [index("cashea_plans_group_idx").on(t.groupId)],
);

export const casheaInstallments = pgTable(
  "cashea_installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => casheaPlans.id, { onDelete: "cascade" }),
    /** 0 = inicial. */
    n: integer("n").notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    amountUsd: money("amount_usd").notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidVes: money("paid_ves"),
    paidRate: doublePrecision("paid_rate"),
  },
  (t) => [index("cashea_installments_plan_idx").on(t.planId), index("cashea_installments_due_idx").on(t.dueDate)],
);

export const settlements = pgTable(
  "settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    fromMember: uuid("from_member")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    toMember: uuid("to_member")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** Si el pago es "su parte" de una cuenta concreta (checklist de quién ya pagó). */
    expenseId: uuid("expense_id").references(() => expenses.id, { onDelete: "set null" }),
    /** Cashea en espejo: la cuota que cubre este pago. Sin cuota, cubre las más viejas primero. */
    cuotaN: integer("cuota_n"),
    currency: text("currency").notNull(),
    amount: money("amount").notNull(),
    amountUsd: money("amount_usd").notNull(),
    rate: doublePrecision("rate"),
    rateSource: text("rate_source"),
    method: text("method").notNull().default("pago_movil"),
    note: text("note"),
    /** Número de referencia del pago móvil / transferencia. */
    reference: text("reference"),
    /** null = el que cobra todavía no confirma que le llegó. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** Un mismo pago puede cubrir varias salidas: todas comparten este id. */
    batchId: uuid("batch_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("settlements_group_idx").on(t.groupId, t.paidAt), index("settlements_expense_idx").on(t.expenseId)],
);

/** Lo que la IA leyó de un comprobante y si cuadra con lo que se debía. */
export type ProofAi = {
  leido: {
    esComprobante: boolean;
    monto: number | null;
    moneda: "VES" | "USD" | "USDT" | "EUR" | null;
    referencia: string | null;
    fecha: string | null;
    bancoOrigen: string | null;
    bancoDestino: string | null;
    telefonoDestino: string | null;
    cedulaDestino: string | null;
    cuentaDestino: string | null;
  };
  check: { monto: "ok" | "no" | "?"; destino: "ok" | "no" | "?" };
  resumen: string;
};

/**
 * Comprobante de pago (captura del pago móvil, Zelle, Binance…). JPEG chico en base64.
 * Mientras no se anota el pago queda como borrador (settlement_id null) y se borra solo al día siguiente.
 * Se borra con el pago (si el que cobra dice "no me llegó") y con la cuenta de quien lo subió.
 */
export const paymentProofs = pgTable(
  "payment_proofs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    settlementId: uuid("settlement_id").references(() => settlements.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    data: text("data").notNull(),
    ai: jsonb("ai").$type<ProofAi>(),
    createdAt: createdAt(),
  },
  (t) => [index("payment_proofs_settlement_idx").on(t.settlementId)],
);

/**
 * Cada uso de la IA (para que el administrador vea el consumo). Sin datos personales:
 * si la persona borra su cuenta, la fila queda anónima (user_id en NULL).
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** factura | comprobante */
    task: text("task").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Costo aproximado en millonésimas de dólar (precio de lista). */
    costMicros: integer("cost_micros").notNull().default(0),
    ok: boolean("ok").notNull(),
    error: text("error"),
    ms: integer("ms").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

/** Avisos dentro de la app (y espejo de lo que se manda por push). */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    /** gasto | pago | parte | recordatorio | mensaje | cashea | grupo */
    kind: text("kind").notNull(),
    emoji: text("emoji").notNull().default("🔔"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url"),
    createdAt: createdAt(),
    readAt: timestamp("read_at", { withTimezone: true }),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

/** Teléfonos/navegadores donde cada quien activó las notificaciones push. */
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/** Histórico propio de tasas (se llena con cada consulta y con el cron diario). */
export const rates = pgTable(
  "rates",
  {
    id: serial("id").primaryKey(),
    /** bcv_usd | bcv_eur | usdt | paralelo */
    source: text("source").notNull(),
    value: doublePrecision("value").notNull(),
    /** Fecha a la que aplica la tasa (fecha valor en el BCV). */
    date: date("date", { mode: "string" }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    official: boolean("official").notNull().default(true),
  },
  (t) => [uniqueIndex("rates_source_date_uq").on(t.source, t.date)],
);

export const usersRelations = relations(users, ({ many }) => ({ members: many(members) }));
export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(members),
  expenses: many(expenses),
  settlements: many(settlements),
  casheaPlans: many(casheaPlans),
}));
export const membersRelations = relations(members, ({ one }) => ({
  group: one(groups, { fields: [members.groupId], references: [groups.id] }),
  user: one(users, { fields: [members.userId], references: [users.id] }),
}));
export const expensesRelations = relations(expenses, ({ one, many }) => ({
  group: one(groups, { fields: [expenses.groupId], references: [groups.id] }),
  payers: many(expensePayers),
  shares: many(expenseShares),
  casheaPlan: many(casheaPlans),
}));
export const expensePayersRelations = relations(expensePayers, ({ one }) => ({
  expense: one(expenses, { fields: [expensePayers.expenseId], references: [expenses.id] }),
  member: one(members, { fields: [expensePayers.memberId], references: [members.id] }),
}));
export const expenseSharesRelations = relations(expenseShares, ({ one }) => ({
  expense: one(expenses, { fields: [expenseShares.expenseId], references: [expenses.id] }),
  member: one(members, { fields: [expenseShares.memberId], references: [members.id] }),
}));
export const casheaPlansRelations = relations(casheaPlans, ({ one, many }) => ({
  group: one(groups, { fields: [casheaPlans.groupId], references: [groups.id] }),
  expense: one(expenses, { fields: [casheaPlans.expenseId], references: [expenses.id] }),
  member: one(members, { fields: [casheaPlans.memberId], references: [members.id] }),
  // "cuotas" (lista) para no chocar con la columna `installments` (número de cuotas).
  cuotas: many(casheaInstallments),
}));
export const casheaInstallmentsRelations = relations(casheaInstallments, ({ one }) => ({
  plan: one(casheaPlans, { fields: [casheaInstallments.planId], references: [casheaPlans.id] }),
}));
export const settlementsRelations = relations(settlements, ({ one }) => ({
  group: one(groups, { fields: [settlements.groupId], references: [groups.id] }),
  expense: one(expenses, { fields: [settlements.expenseId], references: [expenses.id] }),
  from: one(members, { fields: [settlements.fromMember], references: [members.id] }),
  to: one(members, { fields: [settlements.toMember], references: [members.id] }),
}));
