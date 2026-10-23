import { useSyncExternalStore } from "react";

export type TxType = "receita" | "despesa";
export interface Transaction {
  id: string;
  tipo: TxType;
  valor: number;
  categoria: string;
  conta: string;
  descricao: string;
  data: string; // ISO yyyy-mm-dd
  cartao?: string | undefined;
  parcela?: number;
  totalParcelas?: number;
  installment_group_id?: string | null;
}

export interface Cartao { id: string; nome: string; limite: number; fechamento: number; vencimento: number }
const CARDS_KEY = "fin-cartoes-v1";
const seedCards = (): Cartao[] => [
  { id: "principal", nome: "Cartão Principal", limite: 8000, fechamento: 5, vencimento: 12 },
  { id: "viagem", nome: "Cartão Viagem", limite: 5000, fechamento: 20, vencimento: 28 },
];

/** Card id a credit transaction belongs to (accepts legacy name references; no card => "principal"). */
export function cartaoDe(t: Transaction, cards: Cartao[] = loadCards()) {
  if (!t.cartao) return "principal";
  return cards.find((c) => c.id === t.cartao || c.nome === t.cartao)?.id ?? t.cartao;
}

const pad = (n: number) => String(n).padStart(2, "0");
export const ym = (y: number, m: number) => `${y}-${pad(m + 1)}`; // m 0-based

/** Month (yyyy-mm) of the invoice a purchase falls into. */
export function faturaDe(t: Transaction, c: Cartao) {
  const [y, m, d] = t.data.split("-").map(Number) as [number, number, number];
  const dt = new Date(y, m - 1 + (d > c.fechamento ? 1 : 0), 1);
  return ym(dt.getFullYear(), dt.getMonth());
}

export function addMonths(isoDate: string, n: number) {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  const dt = new Date(y, m - 1 + n, Math.min(d, last));
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Splits a purchase into N monthly installment rows (cents distributed so they sum to the total). */
export function gerarParcelas(t: Omit<Transaction, "id">, n: number): Omit<Transaction, "id">[] {
  if (n <= 1) return [{ ...t, installment_group_id: t.installment_group_id ?? undefined }];
  const groupId = t.installment_group_id ?? createInstallmentGroupId();
  const cents = Math.round(t.valor * 100);
  const base = Math.floor(cents / n);
  return Array.from({ length: n }, (_, i) => ({
    ...t,
    installment_group_id: groupId,
    valor: (base + (i === 0 ? cents - base * n : 0)) / 100,
    data: addMonths(t.data, i),
    parcela: i + 1,
    totalParcelas: n,
  }));
}

export const CATEGORIAS = [
  "Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Compras", "Educação", "Salário", "Freelance", "Outros",
];
export const CONTAS = ["Débito", "Crédito", "Pix", "Dinheiro"];
export const META_GASTOS = 4000;

const KEY = "fin-transactions-v1";

function iso(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

function seed(): Transaction[] {
  return [
    { id: "s1", tipo: "receita", valor: 6500, categoria: "Salário", conta: "Pix", descricao: "Salário mensal", data: iso(10) },
    { id: "s2", tipo: "despesa", valor: 1800, categoria: "Moradia", conta: "Débito", descricao: "Aluguel", data: iso(9) },
    { id: "s3", tipo: "despesa", valor: 420.5, categoria: "Alimentação", conta: "Crédito", descricao: "Supermercado", data: iso(7) },
    { id: "s4", tipo: "despesa", valor: 89.9, categoria: "Lazer", conta: "Crédito", descricao: "Cinema", data: iso(5) },
    { id: "s5", tipo: "despesa", valor: 150, categoria: "Transporte", conta: "Débito", descricao: "Combustível", data: iso(4) },
    { id: "s6", tipo: "receita", valor: 900, categoria: "Freelance", conta: "Pix", descricao: "Projeto freelance", data: iso(3) },
    { id: "s7", tipo: "despesa", valor: 210, categoria: "Saúde", conta: "Débito", descricao: "Farmácia", data: iso(2) },
    ...gerarParcelas({ tipo: "despesa", valor: 2400, categoria: "Compras", conta: "Crédito", cartao: "principal", descricao: "Notebook", data: iso(20) }, 10).map((t, i) => ({ ...t, id: `s9-${i}` })),
    { id: "s10", tipo: "despesa", valor: 640, categoria: "Lazer", conta: "Crédito", cartao: "viagem", descricao: "Passagem aérea", data: iso(6) },
    { id: "s8", tipo: "despesa", valor: 330, categoria: "Compras", conta: "Crédito", descricao: "Roupas", data: iso(1) },
  ];
}

let cache: Transaction[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: Transaction[] = [];

function load(): Transaction[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? JSON.parse(raw) : seed();
    if (!raw) localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    cache = seed();
  }
  return cache!;
}

function save(next: Transaction[]) {
  cache = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function createInstallmentGroupId() {
  return `installment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export function addTransaction(t: Omit<Transaction, "id">, parcelas = 1) {
  const groupId = parcelas > 1 ? (t.installment_group_id ?? createInstallmentGroupId()) : t.installment_group_id;
  const rows = gerarParcelas({ ...t, installment_group_id: groupId }, parcelas).map((r) => ({ ...r, id: Math.random().toString(36).slice(2) }));
  save([...rows, ...load()]);
}
export function removeTransaction(id: string) {
  save(load().filter((t) => t.id !== id));
}
export function removeTransactionsByInstallmentGroupId(installmentGroupId: string) {
  save(load().filter((t) => t.installment_group_id !== installmentGroupId));
}
export function updateTransaction(id: string, patch: Partial<Omit<Transaction, "id">>) {
  save(load().map((t) => (t.id === id ? { ...t, ...patch } : t)));
}

export function updateTransactionsByInstallmentGroupId(installmentGroupId: string, patch: Partial<Omit<Transaction, "id">>) {
  save(load().map((t) => (t.installment_group_id === installmentGroupId ? { ...t, ...patch } : t)));
}

export function anteciparParcelas(groupId: string, count: number, valor: number, hoje = new Date()) {
  const rows = load()
    .filter((t) => t.installment_group_id === groupId)
    .sort((a, b) => (a.parcela ?? 0) - (b.parcela ?? 0));

  if (!rows.length) return [];

  const targetCount = Math.max(0, Math.min(Math.round(count), rows.length));
  if (!targetCount) return rows;

  const targetIds = new Set(rows.slice(-targetCount).map((t) => t.id));
  const iso = hoje.toISOString().slice(0, 10);
  const next = load().map((t) => (targetIds.has(t.id) ? { ...t, data: iso, valor: Number.isFinite(valor) ? valor : t.valor } : t));
  save(next);
  return next.filter((t) => t.installment_group_id === groupId);
}

// ---- Cartões store ----
let cardsCache: Cartao[] | null = null;
const EMPTY_CARDS: Cartao[] = [];
export function loadCards(): Cartao[] {
  if (cardsCache) return cardsCache;
  try {
    const raw = localStorage.getItem(CARDS_KEY);
    cardsCache = raw ? JSON.parse(raw) : seedCards();
    if (!raw) localStorage.setItem(CARDS_KEY, JSON.stringify(cardsCache));
  } catch {
    cardsCache = seedCards();
  }
  return cardsCache!;
}
function saveCards(next: Cartao[]) {
  cardsCache = next;
  localStorage.setItem(CARDS_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}
export function upsertCard(c: Omit<Cartao, "id"> & { id?: string }) {
  const cards = loadCards();
  if (c.id && cards.some((x) => x.id === c.id)) saveCards(cards.map((x) => (x.id === c.id ? { ...x, ...c, id: x.id } : x)));
  else saveCards([...cards, { ...c, id: Math.random().toString(36).slice(2) }]);
}
/** Returns false (and does nothing) when the card still has linked transactions. */
export function deleteCard(id: string): boolean {
  const cards = loadCards();
  if (load().some((t) => t.conta === "Crédito" && cartaoDe(t, cards) === id)) return false;
  saveCards(cards.filter((c) => c.id !== id));
  return true;
}
export function useCards() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    loadCards,
    () => EMPTY_CARDS,
  );
}

/** Invoice month that is currently open for a card. */
export function faturaAberta(c: Cartao, hoje = new Date()) {
  const d = new Date(hoje.getFullYear(), hoje.getMonth() + (hoje.getDate() > c.fechamento ? 1 : 0), 1);
  return ym(d.getFullYear(), d.getMonth());
}
/** Used limit = open invoice + all future installments on this card. */
export function limiteUsado(c: Cartao, txs: Transaction[], cards: Cartao[], hoje = new Date()) {
  const aberta = faturaAberta(c, hoje);
  return txs
    .filter((t) => t.conta === "Crédito" && t.tipo === "despesa" && cartaoDe(t, cards) === c.id && faturaDe(t, c) >= aberta)
    .reduce((s, t) => s + t.valor, 0);
}

export function useTransactions() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    load,
    () => EMPTY,
  );
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const normalizeText = (value: string) => value
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const KEYWORDS: [RegExp, string][] = [
  [/ifood|delivery|restaurante|lanchonete|lanche|almoco|almo[cç]o|jantar|mercado|supermercado|padaria|pizza|cafe|caf[eé]|sorvete|comida|delivery/i, "Alimentação"],
  [/uber|99|onibus|[ôo]nibus|metro|metr[ôo]|taxi|gasolina|combust[ií]vel|estacionamento|transporte|carro/i, "Transporte"],
  [/aluguel|condom[ií]nio|luz|[aá]gua|internet|energia|iptu|moradia|apartamento|casa/i, "Moradia"],
  [/cinema|netflix|spotify|show|bar|viagem|jogo|streaming|parque|lazer/i, "Lazer"],
  [/farm[aá]cia|m[eé]dico|rem[eé]dio|academia|consulta|dentista|clinica|hospital|plano|psicologo|psicologa/i, "Saúde"],
  [/roupa|amazon|loja|shopping|presente|tv|celular|notebook|sof[aá]|geladeira|eletronico|eletrodomestico|smartphone|perfume/i, "Compras"],
  [/curso|livro|faculdade|universidade|escola|mensalidade|material escolar|apostila/i, "Educação"],
  [/sal[aá]rio|salario|bonus|b[oó]nus/i, "Salário"],
  [/freela|freelance|projeto|cliente/i, "Freelance"],
];

const parseAmount = (raw: string) => {
  const match = raw.match(/(?:r\$\s*|rs\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i);
  if (!match) return null;
  const value = match[1].replace(/\./g, "").replace(",", ".");
  return Number.parseFloat(value);
};

export type Draft = Omit<Transaction, "id"> & { parcelas: number };

export type StrictTransactionType = "EXPENSE" | "INCOME" | "TRANSFER";
export interface StrictFinancialTransaction {
  type: StrictTransactionType;
  amount: number;
  description: string;
  category: string;
  account: string | null;
  installments: number;
  date: string;
}
export interface StrictFinancialExtraction {
  transactions: StrictFinancialTransaction[];
}

function parseInstallments(text: string) {
  const match = text.match(/(?:em|parcelado\s+em|em\s+|\b)(\d{1,2})\s*(?:x|vezes|parcelas)\b/i);
  if (!match) return 1;
  const value = Number(match[1]);
  return Number.isFinite(value) ? Math.max(1, Math.min(48, value)) : 1;
}

function getCategoryFromText(text: string): string {
  const normalized = normalizeText(text);
  const mapping: [RegExp, string][] = [
    [/ifood|delivery|restaurante|lanchonete|lanche|almoco|mercado|supermercado|padaria|pizza|cafe|sorvete|comida|pao|pão|lanche/i, "Alimentação"],
    [/uber|99|onibus|metro|taxi|gasolina|combustivel|estacionamento|transporte|carro|carona/i, "Transporte"],
    [/aluguel|condominio|luz|agua|internet|energia|iptu|moradia|apartamento|casa|conta de luz|condominio/i, "Moradia"],
    [/cinema|netflix|spotify|show|bar|viagem|jogo|streaming|parque|lazer/i, "Lazer"],
    [/farmacia|medico|remedio|academia|consulta|dentista|clinica|hospital|plano|psicologo/i, "Saúde"],
    [/curso|livro|faculdade|universidade|escola|mensalidade|material escolar|apostila/i, "Educação"],
    [/tenis|sapato|roupa|camisa|vestido|calca|jaqueta|casaco|loja|shopping|presente|vestuario|vestuário/i, "Vestuário"],
    [/salario|sal[aá]rio|bonus|bônus|rendimento|ganho|salario/i, "Salário"],
  ];
  const match = mapping.find(([pattern]) => pattern.test(normalized));
  return match?.[1] ?? "Outros";
}

function inferStrictType(text: string): StrictTransactionType {
  const normalized = normalizeText(text);
  if (/(transferi|transferencia|transferência|enviei|mandei|transfere|transferiu)/i.test(normalized)) return "TRANSFER";
  if (/(recebi|ganhei|sal[aá]rio|salario|bonus|b[oó]nus|deposito|dep[oó]sito|reembolso|rendimento|vendi)/i.test(normalized)) return "INCOME";
  return "EXPENSE";
}

function getStrictAccount(text: string): string | null {
  const normalized = normalizeText(text);
  if (/(credito|cart[aã]o|cartao)/i.test(normalized)) return "Cartão de Crédito";
  if (/(d[eé]bito|debito|pix)/i.test(normalized)) return "Conta Corrente";
  return null;
}

function normalizeDescription(raw: string) {
  const withoutSignals = raw
    .replace(/^(?:gastei|gastei\s+um|paguei|comprei|compra|recebi|ganhei|vendi|transferi|enviei|mandei)\s+/i, "")
    .replace(/^(?:de|da|do|na|no|em|por|para|a\s+|o\s+)\s+/i, "")
    .replace(/^(?:r\$\s*|rs\s*)/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutSignals.length > 0 ? withoutSignals.charAt(0).toUpperCase() + withoutSignals.slice(1) : "Lançamento";
}

function splitIntoClauses(text: string) {
  const segments = text
    .split(/\s*(?:;|,|\s+e\s+|\s+e\s+|\s+\band\b\s+|\s+\bmais\b\s+)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return segments.length > 0 ? segments : [text.trim()];
}

function extractSingleTransaction(text: string): StrictFinancialTransaction | null {
  const amountMatch = text.match(/(?:r\$\s*|rs\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i);
  if (!amountMatch) return null;

  const rawAmount = amountMatch[1].replace(/\./g, "").replace(",", ".");
  const amount = Number.parseFloat(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const description = normalizeDescription(text.replace(amountMatch[0], "").trim());
  if (!description || description === "Lançamento") return null;

  const type = inferStrictType(text);
  const date = /ontem/i.test(text) ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

  return {
    type,
    amount,
    description,
    category: getCategoryFromText(text),
    account: getStrictAccount(text),
    installments: parseInstallments(text),
    date,
  };
}

export function extractFinancialTransactions(text: string): StrictFinancialExtraction {
  const clauses = splitIntoClauses(text);
  const transactions = clauses
    .map((clause) => extractSingleTransaction(clause))
    .filter((item): item is StrictFinancialTransaction => item !== null);

  if (transactions.length === 0) {
    return { transactions: [{
      type: "EXPENSE",
      amount: 0,
      description: "Lançamento",
      category: "Outros",
      account: null,
      installments: 1,
      date: new Date().toISOString().slice(0, 10),
    }] };
  }

  return { transactions };
}

export function parseMessage(text: string): Draft | null {
  const normalized = normalizeText(text);
  const parc = normalized.match(/(?:em|parcelado\s+em)\s+(\d{1,2})\s*(?:x|vezes|parcelas)?|\b(\d{1,2})\s*(?:x|vezes|parcelas)\b/i);
  const parcelas = parc ? Math.max(1, Math.min(48, Number(parc[1] ?? parc[2]))) : 1;
  const clean = parc && parcelas > 1 ? normalized.replace(parc[0], " ") : normalized;
  const valor = parseAmount(clean) ?? parseAmount(text) ?? 0;
  if (!valor) return null;
  const tipo: TxType = /(recebi|ganhei|sal[aá]rio|salario|entrou|freela|vendi|deposito|dep[oó]sito|transfer[eê]ncia|reembolso|bonus|b[oó]nus|rendimentos)/i.test(normalized) ? "receita" : "despesa";
  const categoria = KEYWORDS.find(([r]) => r.test(normalized))?.[1] ?? "Outros";
  let conta = /cr[eé]dito|cart[aã]o|credito|cartao/i.test(normalized) ? "Crédito" : /pix/i.test(normalized) ? "Pix" : /dinheiro|esp[eé]cie/i.test(normalized) ? "Dinheiro" : "Débito";
  if (parcelas > 1) conta = "Crédito";
  const cards = loadCards();
  const cartao = conta === "Crédito"
    ? (cards.find((c) => normalized.includes(c.nome.toLowerCase().replace(/^cart[aã]o\s+/, ""))) ?? cards[0])?.id
    : undefined;
  const data = iso(/ontem/i.test(normalized) ? 1 : 0);
  const descricao = text.trim().length > 60 ? text.trim().slice(0, 57) + "..." : text.trim();
  return { tipo, valor, categoria, conta, descricao, data, cartao, parcelas };
}
