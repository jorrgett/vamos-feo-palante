// Pruebas de la lógica de dinero: npx tsx scripts/probar-logica.ts
import assert from "node:assert/strict";
import { allocate, fmt, parseAmount, toUsdCents } from "../lib/money";
import { computeSplit } from "../lib/split";
import { computeBalances, pairwiseDebts, simplifyDebts } from "../lib/balances";
import { casheaSchedule, inClubDays, installmentStatus, mirrorForDebtor, mirrorStatus } from "../lib/cashea";
import { debtSplit, paidProgress, remainingTo, shareStatuses } from "../lib/share-status";
import { auditLedger } from "../lib/audit";
import { categoriesOf, categoryLabel } from "../lib/constants";
import { casheaReminders, dailyReminders, type ReminderSalida } from "../lib/debt-reminders";
import { amountForBank, bankCode, docParts, pagoMovilBlock, phoneForBank } from "../lib/pago-movil";

let n = 0;
const t = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log("✓", name);
};

t("parseAmount formatos venezolanos", () => {
  assert.equal(parseAmount("12,50"), 1250);
  assert.equal(parseAmount("1.234,56"), 123456);
  assert.equal(parseAmount("45.000"), 4500000);
  assert.equal(parseAmount("Bs. 35.204,64"), 3520464);
  assert.equal(parseAmount("12.5"), 1250);
  assert.equal(parseAmount("1,234.56"), 123456);
  assert.equal(parseAmount("1.234.567"), 123456700);
  assert.equal(parseAmount("0,99"), 99);
  assert.equal(parseAmount(""), null);
});

t("allocate suma exacta", () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.deepEqual(allocate(100, [1, 2, 1]), [25, 50, 25]);
  const r = allocate(98765, [3, 7, 11, 13]);
  assert.equal(r.reduce((a, b) => a + b, 0), 98765);
});

t("fmt", () => {
  assert.equal(fmt(123456, "USD"), "$ 1.234,56");
  assert.equal(fmt(-5000, "VES"), "−Bs 50,00");
  assert.equal(fmt(5000, "EUR", { sign: true }), "+€ 50,00");
});

t("conversión Bs→USD con tasa BCV", () => {
  // Bs 35.204,64 a 880,1159 = $40,00
  assert.equal(toUsdCents(3520464, "VES", { vesPerUsd: 880.1159 }), 4000);
  // €10 con EUR 985,73 y USD 880,12 ≈ $11,20
  assert.equal(toUsdCents(1000, "EUR", { vesPerUsd: 880.1159, vesPerEur: 985.729808 }), 1120);
});

t("split igual + servicio 10 %", () => {
  const r = computeSplit({ mode: "equal", base: 9000, members: ["a", "b", "c"] }, [{ id: "s", label: "Servicio", kind: "percent", value: 10 }]);
  assert.equal(r.total, 9900);
  assert.deepEqual(r.shares, { a: 3300, b: 3300, c: 3300 });
});

t("split por consumo con ítems compartidos y propina", () => {
  const r = computeSplit(
    {
      mode: "items",
      items: [
        { id: "1", name: "Hamburguesa", price: 1200, qty: 1, members: ["a"] },
        { id: "2", name: "Pizza", price: 1800, qty: 1, members: ["b", "c"] },
        { id: "3", name: "Tequeños", price: 600, qty: 1, members: ["a", "b", "c"] },
        { id: "4", name: "Cervezas", price: 250, qty: 4, members: ["a", "b"] },
      ],
    },
    [{ id: "p", label: "Propina", kind: "percent", value: 10 }],
  );
  assert.equal(r.base, 4600);
  assert.deepEqual(r.baseShares, { a: 1200 + 200 + 500, b: 900 + 200 + 500, c: 900 + 200 });
  assert.equal(r.total, 5060);
  assert.equal(Object.values(r.shares).reduce((x, y) => x + y, 0), 5060);
});

t("split porcentajes y partes", () => {
  const p = computeSplit({ mode: "percent", base: 10000, percents: { a: 50, b: 30, c: 20 } });
  assert.deepEqual(p.shares, { a: 5000, b: 3000, c: 2000 });
  assert.throws(() => computeSplit({ mode: "percent", base: 10000, percents: { a: 50, b: 30 } }));
  const s = computeSplit({ mode: "shares", base: 9000, weights: { a: 2, b: 1 } });
  assert.deepEqual(s.shares, { a: 6000, b: 3000 });
});

t("saldos y simplificación", () => {
  // a pagó 90 por a,b,c · b pagó 30 por b,c
  const bal = computeBalances(
    ["a", "b", "c"],
    [
      { payers: [{ memberId: "a", amountUsd: 9000 }], shares: ["a", "b", "c"].map((m) => ({ memberId: m, amountUsd: 3000 })) },
      { payers: [{ memberId: "b", amountUsd: 3000 }], shares: ["b", "c"].map((m) => ({ memberId: m, amountUsd: 1500 })) },
    ],
    [],
  );
  assert.deepEqual(bal, { a: 6000, b: -1500, c: -4500 });
  const tr = simplifyDebts(bal);
  assert.deepEqual(tr, [
    { from: "c", to: "a", amount: 4500 },
    { from: "b", to: "a", amount: 1500 },
  ]);
  // c le paga 45 a a → quedan sólo los 15 de b
  const bal2 = computeBalances(["a", "b", "c"], [], [{ fromMember: "c", toMember: "a", amountUsd: 4500 }]);
  assert.deepEqual(bal2, { a: -4500, b: 0, c: 4500 });
  const pw = pairwiseDebts(
    [{ payers: [{ memberId: "a", amountUsd: 9000 }], shares: ["a", "b", "c"].map((m) => ({ memberId: m, amountUsd: 3000 })) }],
    [],
  );
  assert.equal(pw.length, 2);
});

t("simplificación con 6 personas deja ≤ n−1 pagos y todos en cero", () => {
  const bal = { a: 12345, b: -2000, c: -3345, d: 5000, e: -7000, f: -5000 };
  const tr = simplifyDebts(bal);
  assert.ok(tr.length <= 5);
  const after: Record<string, number> = { ...bal };
  for (const x of tr) {
    after[x.from] += x.amount;
    after[x.to] -= x.amount;
  }
  assert.ok(Object.values(after).every((v) => v === 0));
});

t("Cashea: $100 nivel 3 (40 %) 3 cuotas del 16-10-2026", () => {
  const s = casheaSchedule({ totalUsd: 10000, initialPct: 40, installments: 3, intervalDays: 14, purchaseDate: "2026-10-16" });
  assert.equal(s.initialUsd, 4000);
  assert.deepEqual(
    s.rows.map((r) => [r.dueDate, r.amountUsd]),
    [
      ["2026-10-16", 4000],
      ["2026-10-30", 2000],
      ["2026-11-13", 2000],
      ["2026-11-27", 2000],
    ],
  );
});

t("Cashea: 30 % deja $23,33 · $23,33 · $23,34", () => {
  const s = casheaSchedule({ totalUsd: 10000, initialPct: 30, installments: 3, intervalDays: 14, purchaseDate: "2026-10-16" });
  assert.deepEqual(
    s.rows.map((r) => r.amountUsd),
    [3000, 2333, 2333, 2334],
  );
});

t("Cashea: la inicial sube si la línea no alcanza", () => {
  const s = casheaSchedule({ totalUsd: 10000, initialPct: 40, installments: 3, intervalDays: 14, purchaseDate: "2026-10-16", availableLineUsd: 5000 });
  assert.equal(s.initialUsd, 5000);
  assert.equal(s.financedUsd, 5000);
  assert.ok(s.raisedByLine);
});

t("Cashea: días del club y estados", () => {
  assert.ok(inClubDays("2026-10-16"));
  assert.ok(!inClubDays("2026-10-10"));
  assert.equal(installmentStatus({ n: 1, dueDate: "2026-10-30", amountUsd: 1, paidAt: null }, "2026-10-16"), "al-dia");
  assert.equal(installmentStatus({ n: 1, dueDate: "2026-10-30", amountUsd: 1, paidAt: null }, "2026-11-01"), "en-gracia");
  assert.equal(installmentStatus({ n: 1, dueDate: "2026-10-30", amountUsd: 1, paidAt: null }, "2026-11-02"), "atrasada");
});

t("quién ya pagó su parte: una persona puso todo", () => {
  // a pagó $80 entre a, b, c, d → b, c y d le deben $20 cada uno
  const e = { payers: [{ memberId: "a", amountUsd: 8000 }], shares: ["a", "b", "c", "d"].map((m) => ({ memberId: m, amountUsd: 2000 })) };
  assert.deepEqual(debtSplit(e, "b"), [{ to: "a", amountUsd: 2000 }]);
  const linked = [{ fromMember: "b", toMember: "a", amountUsd: 2000 }, { fromMember: "c", toMember: "a", amountUsd: 500 }];
  const st = Object.fromEntries(shareStatuses(e, linked).map((x) => [x.memberId, x.status]));
  assert.deepEqual(st, { a: "puso", b: "pagado", c: "parcial", d: "falta" });
  const p = paidProgress(shareStatuses(e, linked));
  assert.equal(p.debtors, 3);
  assert.equal(p.paid, 1);
  assert.equal(p.pendingUsd, 1500 + 2000);
});

t("quién ya pagó su parte: dos pusieron la plata", () => {
  // a puso $60 y b $40 de una cuenta de $100 entre a, b, c, d ($25 c/u) → a +35, b +15
  const e = {
    payers: [
      { memberId: "a", amountUsd: 6000 },
      { memberId: "b", amountUsd: 4000 },
    ],
    shares: ["a", "b", "c", "d"].map((m) => ({ memberId: m, amountUsd: 2500 })),
  };
  assert.deepEqual(debtSplit(e, "c"), [
    { to: "a", amountUsd: 1750 },
    { to: "b", amountUsd: 750 },
  ]);
  assert.equal(remainingTo(e, [{ fromMember: "c", toMember: "a", amountUsd: 1750 }], "c", "b"), 750);
  assert.equal(remainingTo(e, [{ fromMember: "c", toMember: "a", amountUsd: 1750 }], "c", "a"), 0);
});

// Cuadre del panel del administrador: Ana puso $30, cada uno debe $10.
const auditOf = (shares: number[], settlements: [string, string, number, boolean][]) =>
  auditLedger({
    members: ["Ana", "Beto", "Caro"].map((name, i) => ({ id: "abc"[i], userId: i === 2 ? null : "abc"[i], name, avatar: "🙂", color: "#999" })),
    expenses: [{ amountUsd: 3000, payers: [{ memberId: "a", amountUsd: 3000 }], shares: shares.map((v, i) => ({ memberId: "abc"[i], amountUsd: v })) }],
    settlements: settlements.map(([f, to, v, ok]) => ({ fromMember: f, toMember: to, amountUsd: v, confirmedAt: ok ? new Date() : null })),
  });

t("cuadre: salida normal con pagos pendientes", () => {
  const a = auditOf([1000, 1000, 1000], [["b", "a", 1000, true]]);
  assert.ok(a.ok);
  assert.ok(!a.settled);
  assert.deepEqual(
    a.rows.map((r) => r.balance),
    [1000, 0, -1000],
  );
});

t("cuadre: todo pagado aunque falte confirmar", () => {
  const a = auditOf([1000, 1000, 1000], [["b", "a", 1000, true], ["c", "a", 1000, false]]);
  assert.ok(a.ok && a.settled);
  assert.equal(a.rows[0].receivedPending, 1000);
  assert.equal(a.rows[2].sentPending, 1000);
});

t("cuadre: detecta pagos de más, partes que no suman y pagos al que no puso", () => {
  const over = auditOf([1000, 1000, 1000], [["b", "a", 1000, true], ["c", "a", 1500, true]]);
  assert.ok(!over.ok);
  assert.ok(over.issues.some((x) => x.startsWith("Caro pagó de más")));
  assert.ok(over.issues.some((x) => x.startsWith("A Ana le pagaron de más")));
  const short = auditOf([1000, 1000, 900], []);
  assert.ok(short.issues.some((x) => x.startsWith("Las partes suman")));
  assert.ok(short.issues.some((x) => x.startsWith("Los saldos no suman cero")));
  const wrong = auditOf([1000, 1000, 1000], [["c", "b", 1000, true]]);
  assert.ok(wrong.issues.some((x) => x === "Beto recibió pagos sin haber puesto plata."));
});

t("pago móvil: se copia como lo piden los bancos", () => {
  assert.equal(bankCode("0104 Venezolano de Crédito"), "0104");
  assert.equal(phoneForBank("0414-1234567"), "04141234567");
  assert.equal(phoneForBank("+58 414 123.45.67"), "04141234567");
  assert.equal(phoneForBank("4141234567"), "04141234567");
  assert.deepEqual(docParts("V-12.345.678"), { letter: "V", number: "12345678" });
  assert.deepEqual(docParts("e 81234567"), { letter: "E", number: "81234567" });
  assert.deepEqual(docParts("12345678"), { letter: "V", number: "12345678" });
  assert.equal(amountForBank(948027), "9480,27");
  assert.equal(amountForBank(5000), "50,00");
  assert.equal(amountForBank(7), "0,07");
  assert.equal(
    pagoMovilBlock({ banco: "0104 Venezolano de Crédito", telefono: "0414-7654321", cedula: "V-12.345.678" }, 948027),
    "0104\n04147654321\n12345678\n9480,27",
  );
  assert.equal(pagoMovilBlock({ banco: "0134 Banesco", telefono: "04141234567", cedula: "E-81234567" }), "0134\n04141234567\nE81234567");
});

t("varias categorías: la principal primero, sin repetir", () => {
  assert.deepEqual(
    categoriesOf({ category: "comida", extraCategories: ["bebidas", "comida", "entradas"] }).map((c) => c.id),
    ["comida", "bebidas", "entradas"],
  );
  assert.equal(categoryLabel({ category: "comida", extraCategories: ["bebidas"] }), "Comida + Rumba y tragos");
  assert.equal(categoryLabel({ category: "cafe" }), "Café y postres");
});

t("recordatorio diario: un aviso por persona con todas sus deudas", () => {
  const members = [
    { id: "a", userId: "ua", name: "Ana" },
    { id: "b", userId: "ub", name: "Beto" },
    { id: "c", userId: "uc", name: "Caro" },
    { id: "x", userId: null, name: "Ex pana" },
  ];
  const salida = (id: string, title: string, settlements: ReminderSalida["settlements"] = []): ReminderSalida => ({
    id,
    title,
    vesPerUsd: 100,
    expense: { payers: [{ memberId: "a", amountUsd: 3000 }], shares: ["a", "b", "c"].map((m) => ({ memberId: m, amountUsd: 1000 })) },
    settlements,
    members,
  });
  const r = dailyReminders([
    salida("s1", "Pizzas"),
    salida("s2", "Cine", [
      { fromMember: "b", toMember: "a", amountUsd: 1000, confirmedAt: new Date() },
      { fromMember: "c", toMember: "a", amountUsd: 1000, confirmedAt: null },
    ]),
  ]);
  const of = (u: string) => r.filter((x) => x.userId === u);
  // Beto: solo debe Pizzas (Cine ya lo pagó y está confirmado).
  assert.equal(of("ub").length, 1);
  assert.equal(of("ub")[0].title, "Te falta pagar tu parte de «Pizzas»");
  assert.equal(of("ub")[0].url, "/pagar?a=ua&s=s1");
  // Caro: debe Pizzas; Cine ya lo pagó (falta que Ana confirme), así que no se le cobra.
  assert.equal(of("uc").length, 1);
  assert.ok(of("uc")[0].title.includes("Pizzas"));
  // Ana cobra: no debe nada, pero tiene un pago por confirmar.
  assert.equal(of("ua").length, 1);
  assert.equal(of("ua")[0].title, "Caro dice que te pagó «Cine»");
  // Con dos salidas sin pagar, un solo aviso con el total.
  const two = dailyReminders([salida("s1", "Pizzas"), salida("s3", "Playa")]).filter((x) => x.userId === "ub");
  assert.equal(two.length, 1);
  assert.ok(two[0].title.startsWith("Tienes 2 salidas por pagar"));
  assert.equal(two[0].url, "/pagar");
});

// Ejemplo: piñata de $22,50 con el Cashea de Luis (inicial 0 %, 2 cuotas de $11,25: 26-oct y 9-nov).
const pinata = {
  memberId: "h",
  mode: "espejo",
  totalUsd: 2250,
  installments: 2,
  rows: [
    { n: 0, dueDate: "2026-10-12", amountUsd: 0, paidAt: new Date() },
    { n: 1, dueDate: "2026-10-26", amountUsd: 1125, paidAt: null },
    { n: 2, dueDate: "2026-11-09", amountUsd: 1125, paidAt: null },
  ],
};
const pinataExp = { payers: [{ memberId: "h", amountUsd: 2250 }], shares: [{ memberId: "h", amountUsd: 1985 }, { memberId: "j", amountUsd: 265 }] };

t("cashea espejo: se debe la próxima cuota, no el total", () => {
  const m = mirrorForDebtor(pinata, pinataExp, [], "j", "2026-10-24")!;
  assert.deepEqual(m.parts.map((p) => p.usd), [0, 133, 132]);
  assert.equal(m.next!.n, 1);
  assert.equal(m.next!.daysLeft, 2);
  assert.equal(m.nextPayUsd, 133);
  assert.equal(m.overdueUsd, 0);
  assert.equal(m.totalRestUsd, 265);
  // Pagó la cuota 1: ahora toca la 2.
  const m2 = mirrorForDebtor(pinata, pinataExp, [{ fromMember: "j", toMember: "h", amountUsd: 133 }], "j", "2026-10-24")!;
  assert.equal(m2.next!.n, 2);
  assert.equal(m2.nextPayUsd, 132);
  // Se le pasó la cuota 1: queda vencida y para ponerse al día paga la 1.
  const late = mirrorForDebtor(pinata, pinataExp, [], "j", "2026-10-28")!;
  assert.equal(late.overdueUsd, 133);
  assert.equal(late.next!.daysLeft, -2);
  // El dueño del Cashea no se debe a sí mismo.
  assert.equal(mirrorForDebtor(pinata, pinataExp, [], "h"), null);
});

t("cashea espejo: si el dueño puso una parte en efectivo, esa parte se debe de una", () => {
  const s = mirrorStatus({ owedUsd: 300, paidUsd: 0, holderPutUsd: 2250, planTotalUsd: 1250, rows: pinata.rows, at: "2026-10-24" });
  assert.equal(s.parts[0].usd, 300 - 167);
  assert.equal(s.parts[1].usd + s.parts[2].usd, 167);
  assert.equal(s.overdueUsd, 133);
});

t("avisos de cuota: a 3, 2, 1 y 0 días; el diario solo cobra lo vencido", () => {
  const members = [
    { id: "h", userId: "uh", name: "Luis" },
    { id: "j", userId: "uj", name: "Jorge" },
  ];
  const plan = { groupId: "g", store: "PIÑATA", closed: false, plan: pinata, expense: pinataExp, settlements: [], members, bcvUsd: 886 };
  const on = (at: string) => casheaReminders([plan], at);
  assert.equal(on("2026-10-22").length, 0); // faltan 4 días
  const d3 = on("2026-10-23");
  assert.equal(d3.find((x) => x.userId === "uj")!.title, "Tu cuota 1 de «PIÑATA»: vence en 3 días");
  assert.equal(d3.find((x) => x.userId === "uh")!.title, "Cuota 1/2 de PIÑATA: vence en 3 días");
  assert.ok(d3.find((x) => x.userId === "uh")!.body.includes("Ya te pagaron su parte 0 de 1 pana"));
  assert.equal(on("2026-10-25").find((x) => x.userId === "uj")!.title, "Tu cuota 1 de «PIÑATA»: vence mañana");
  assert.equal(on("2026-10-26").find((x) => x.userId === "uj")!.title, "Tu cuota 1 de «PIÑATA»: vence hoy");
  assert.equal(on("2026-10-28").find((x) => x.userId === "uh")!.title, "Cuota 1/2 de PIÑATA: último día de gracia");
  // Si ya pagó su parte de la cuota 1, no le llega.
  assert.equal(casheaReminders([{ ...plan, settlements: [{ fromMember: "j", toMember: "h", amountUsd: 133 }] }], "2026-10-25").filter((x) => x.userId === "uj").length, 0);
  // Recordatorio diario: antes de vencer no le cobra nada; vencida, sí.
  const salida: ReminderSalida = { id: "g", title: "PIÑATA", vesPerUsd: 886, expense: pinataExp, settlements: [], members, cashea: pinata };
  assert.equal(dailyReminders([salida], "2026-10-24").filter((x) => x.userId === "uj").length, 0);
  const late = dailyReminders([salida], "2026-10-27").find((x) => x.userId === "uj")!;
  assert.equal(late.title, "Se te venció la cuota 1 de «PIÑATA»");
  assert.ok(late.body.startsWith("$ 1,33"));
});

console.log(`\n${n} pruebas OK`);
