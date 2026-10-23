import { useSyncExternalStore, useState, useEffect, useCallback } from "react";
import { api, type DashboardSummaryResponse, type ThirdPartySummaryResponse } from "./api";

export type TxType = "receita" | "despesa";
export type ExpenseOwner = "Próprio" | "Terceiros";
export interface Contact { id: string; name: string }
export type TransactionAccountType = "CREDIT_CARD" | "CHECKING_ACCOUNT";
export interface TransactionAccount { id: string; name: string; type: TransactionAccountType }
export interface Transaction {
  id: string;
  tipo: TxType;
  valor: number;
  asset_value?: number;
  categoria: string;
  conta: string;
  descricao: string;
  data: string; // ISO yyyy-mm-dd
  expense_owner?: ExpenseOwner;
  contact_id?: string | null;
  account_id?: string | null;
  is_recurring?: boolean;
  is_paid?: boolean;
  /** @deprecated Legacy payment label retained for compatibility with old records. */
  conta_bancaria_id?: string;
  cartao?: string | undefined;
  parcela?: number;
  totalParcelas?: number;
  installment_group_id?: string | null;
  parcelaInicial?: number;
}

export interface Cartao { id: string; nome: string; limite: number; fechamento: number; vencimento: number }
export type TipoContaBancaria = "corrente" | "poupanca" | "dinheiro";
export interface ContaBancaria { id: string; nome: string; instituicao: string; tipo: TipoContaBancaria; saldoInicial: number }
export interface Caixinha { id: string; contaBancariaId: string; nome: string; saldo: number }
export interface FinanceSettings { monthly_spending_limit: number }
const CARDS_KEY = "fin-cartoes-v1";
const ACCOUNTS_KEY = "fin-contas-v1";
const POCKETS_KEY = "fin-caixinhas-v1";
const CONTACTS_KEY = "fin-contacts-v1";
export const TRANSACTION_ACCOUNTS_KEY = "accounts";
const LEGACY_TRANSACTION_ACCOUNTS_KEY = "fin-accounts-v1";
const SETTINGS_KEY = "@FalaGrana:settings";
const DEFAULT_SETTINGS: FinanceSettings = { monthly_spending_limit: 2000 };
const seedCards = (): Cartao[] => [
  { id: "principal", nome: "Cartão Principal", limite: 8000, fechamento: 5, vencimento: 12 },
  { id: "viagem", nome: "Cartão Viagem", limite: 5000, fechamento: 20, vencimento: 28 },
];

/** Card id a credit transaction belongs to (accepts legacy name references; no card => "principal"). */
export function cartaoDe(t: Transaction, cards: Cartao[] = loadCards()) {
  if (t.account_id && cards.some((card) => card.id === t.account_id)) return t.account_id;
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

/** Generates N monthly installment rows using the provided amount as the unit installment value. */
export function gerarParcelas(t: Omit<Transaction, "id">, n: number): Omit<Transaction, "id">[] {
  if (n <= 1) return [{ ...t }];
  return gerarParcelasUnitarias(t, 1, n);
}

export function gerarParcelasUnitarias(t: Omit<Transaction, "id">, parcelaInicial: number, totalParcelas: number): Omit<Transaction, "id">[] {
  const firstInstallment = Math.max(1, Math.min(999, Math.floor(parcelaInicial)));
  const total = Math.max(firstInstallment, Math.min(999, Math.floor(totalParcelas)));
  const groupId = t.installment_group_id ?? createInstallmentGroupId();
  return Array.from({ length: total - firstInstallment + 1 }, (_, index) => ({
    ...t,
    installment_group_id: groupId,
    valor: t.valor,
    data: addMonths(t.data, index),
    parcela: firstInstallment + index,
    totalParcelas: total,
    parcelaInicial: firstInstallment,
    is_paid: false,
  }));
}

export const CATEGORIAS = [
  "Alimentação", "Transporte", "Moradia", "Lazer", "Saúde", "Compras", "Educação", "Consórcio", "Financiamento", "Assinatura / Fixo", "Salário", "Freelance", "Outros",
];
export const CONTAS = ["Débito", "Crédito", "Pix", "Dinheiro"];
export const META_GASTOS = DEFAULT_SETTINGS.monthly_spending_limit;

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
    ...gerarParcelas({ tipo: "despesa", valor: 240, categoria: "Compras", conta: "Crédito", cartao: "principal", descricao: "Notebook", data: iso(20) }, 10).map((t, i) => ({ ...t, id: `s9-${i}` })),
    { id: "s10", tipo: "despesa", valor: 640, categoria: "Lazer", conta: "Crédito", cartao: "viagem", descricao: "Passagem aérea", data: iso(6) },
    { id: "s8", tipo: "despesa", valor: 330, categoria: "Compras", conta: "Crédito", descricao: "Roupas", data: iso(1) },
  ];
}

let cache: Transaction[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: Transaction[] = [];
let contactsCache: Contact[] | null = null;
const EMPTY_CONTACTS: Contact[] = [];
let transactionAccountsCache: TransactionAccount[] | null = null;
const EMPTY_TRANSACTION_ACCOUNTS: TransactionAccount[] = [];
let settingsCache: FinanceSettings | null = null;

export function loadFinanceSettings(): FinanceSettings {
  if (settingsCache) return settingsCache;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const stored: Partial<FinanceSettings> = raw ? JSON.parse(raw) : {};
    const configuredLimit = Number(stored.monthly_spending_limit);
    settingsCache = {
      monthly_spending_limit: Number.isFinite(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : DEFAULT_SETTINGS.monthly_spending_limit,
    };
    if (!raw || settingsCache.monthly_spending_limit !== stored.monthly_spending_limit) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache));
    }
  } catch {
    settingsCache = { ...DEFAULT_SETTINGS };
  }
  return settingsCache;
}

export function updateMonthlySpendingLimit(limit: number) {
  if (!Number.isFinite(limit) || limit <= 0) return false;
  settingsCache = { monthly_spending_limit: limit };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settingsCache));
  listeners.forEach((listener) => listener());
  return true;
}

export function useFinanceSettings() {
  return useSyncExternalStore(
    (callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    loadFinanceSettings,
    () => DEFAULT_SETTINGS,
  );
}

function load(): Transaction[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: Transaction[] = raw ? JSON.parse(raw) : [];
    const needsLegacyContact = parsed.some((transaction) => transaction.expense_owner === "Terceiros" && !transaction.contact_id);
    let legacyContactId: string | undefined;
    if (needsLegacyContact) {
      const contacts = loadContacts();
      const legacyContact = contacts.find((contact) => contact.name === "Terceiro não identificado");
      legacyContactId = legacyContact?.id ?? "legacy-third-party";
      if (!legacyContact) {
        contactsCache = [...contacts, { id: legacyContactId, name: "Terceiro não identificado" }];
        localStorage.setItem(CONTACTS_KEY, JSON.stringify(contactsCache));
      }
    }
    cache = parsed.map((transaction) => {
      const migratedContactId = transaction.expense_owner === "Terceiros" && !transaction.contact_id && legacyContactId
        ? legacyContactId
        : transaction.contact_id;
      const migratedAccountId = transaction.account_id
        ?? (transaction.cartao && loadCards().some((card) => card.id === transaction.cartao) ? transaction.cartao : undefined)
        ?? (transaction.conta === "Crédito" ? cartaoDe(transaction) : undefined)
        ?? (transaction.conta_bancaria_id && loadBankAccounts().some((account) => account.id === transaction.conta_bancaria_id) ? transaction.conta_bancaria_id : undefined);
      return {
        ...transaction,
        expense_owner: transaction.expense_owner ?? (migratedContactId ? "Terceiros" : "Próprio"),
        ...(migratedContactId ? { contact_id: migratedContactId } : {}),
        ...(migratedAccountId ? { account_id: migratedAccountId } : {}),
      };
    });
    if (!raw || parsed.some((transaction) => !transaction.expense_owner || !transaction.account_id) || needsLegacyContact) {
      localStorage.setItem(KEY, JSON.stringify(cache));
    }
  } catch {
    cache = [];
  }
  return cache!;
}

function save(next: Transaction[]) {
  cache = next.map((transaction) => ({ ...transaction, expense_owner: transaction.contact_id ? "Terceiros" : "Próprio" }));
  localStorage.setItem(KEY, JSON.stringify(cache));
  listeners.forEach((l) => l());
}

export function createInstallmentGroupId() {
  return `installment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
export function addTransaction(
  t: Omit<Transaction, "id">,
  parcelas = 1,
  options: { parcelaInicial?: number } = {},
) {
  const selectedAccount = t.account_id ? getTransactionAccount(t.account_id) : undefined;
  const isAssinatura = t.categoria === "Assinatura / Fixo";
  const isRecurring = isAssinatura
    ? (t.is_recurring !== undefined ? t.is_recurring : true)
    : undefined;

  const normalized = {
    ...t,
    account_id: t.account_id ?? null,
    is_paid: t.is_paid ?? false,
    ...(selectedAccount?.type === "CREDIT_CARD" ? { cartao: selectedAccount.id, conta: "Crédito" } : {}),
    ...(selectedAccount?.type === "CHECKING_ACCOUNT" ? { conta_bancaria_id: selectedAccount.id } : {}),
    expense_owner: t.contact_id ? "Terceiros" as const : "Próprio" as const,
    ...(isRecurring !== undefined ? { is_recurring: isRecurring } : {}),
  };
  const groupId = parcelas > 1 ? (normalized.installment_group_id ?? createInstallmentGroupId()) : normalized.installment_group_id;
  const installmentData = groupId ? { ...normalized, installment_group_id: groupId } : normalized;
  const generated = parcelas > 1
    ? gerarParcelasUnitarias(installmentData, options.parcelaInicial ?? 1, parcelas)
    : gerarParcelas(installmentData, parcelas);
  const rows = generated.map((r) => ({ ...r, id: Math.random().toString(36).slice(2) }));
  save([...rows, ...load()]);
}

export function loadContacts(): Contact[] {
  if (contactsCache) return contactsCache;
  try {
    const raw = localStorage.getItem(CONTACTS_KEY);
    contactsCache = raw ? JSON.parse(raw) : [];
    if (!raw) localStorage.setItem(CONTACTS_KEY, JSON.stringify(contactsCache));
  } catch {
    contactsCache = [];
  }
  return contactsCache!;
}

function saveContacts(next: Contact[]) {
  contactsCache = next;
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function upsertContact(name: string, id?: string): string {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  const contacts = loadContacts();
  const duplicate = contacts.find((contact) => contact.name.toLocaleLowerCase("pt-BR") === normalizedName.toLocaleLowerCase("pt-BR"));
  if (duplicate && duplicate.id !== id) return duplicate.id;
  if (id && contacts.some((contact) => contact.id === id)) {
    saveContacts(contacts.map((contact) => contact.id === id ? { ...contact, name: normalizedName } : contact));
    return id;
  }
  const newId = Math.random().toString(36).slice(2);
  saveContacts([...contacts, { id: newId, name: normalizedName }]);
  return newId;
}

export function deleteContact(id: string): boolean {
  if (load().some((transaction) => transaction.contact_id === id)) return false;
  saveContacts(loadContacts().filter((contact) => contact.id !== id));
  return true;
}

export function totalAReceberGeral(contacts: Contact[] | Contact, transactions: Transaction[]): number {
  const list = Array.isArray(contacts) ? contacts : [contacts];
  const contactIds = new Set(list.map((c) => c.id));
  return transactions
    .filter((transaction) => transaction.tipo === "despesa" && transaction.contact_id && contactIds.has(transaction.contact_id) && !transaction.is_paid)
    .reduce((sum, transaction) => sum + transaction.valor, 0);
}

export function totalAReceberMes(
  contacts: Contact[] | Contact,
  transactions: Transaction[],
  mes: string = new Date().toISOString().slice(0, 7),
): number {
  const list = Array.isArray(contacts) ? contacts : [contacts];
  const contactIds = new Set(list.map((c) => c.id));
  return transactions
    .filter((transaction) => transaction.tipo === "despesa" && transaction.contact_id && contactIds.has(transaction.contact_id) && transaction.data.startsWith(mes) && !transaction.is_paid)
    .reduce((sum, transaction) => sum + transaction.valor, 0);
}

export function totalAReceber(contacts: Contact[], transactions: Transaction[]) {
  return totalAReceberGeral(contacts, transactions);
}

export function toggleTransactionPaid(id: string): boolean {
  const tx = load().find((t) => t.id === id);
  if (!tx) return false;
  const next = !tx.is_paid;
  updateTransaction(id, { is_paid: next });
  return next;
}

export function setTransactionPaid(id: string, isPaid: boolean) {
  updateTransaction(id, { is_paid: isPaid });
}

export function useContacts() {
  return useSyncExternalStore(
    (callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    loadContacts,
    () => EMPTY_CONTACTS,
  );
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

export interface LongTermPlanSummary {
  parcelaAtual: number;
  totalParcelas: number;
  valorParcela: number;
  totalPago: number;
  saldoDevedor: number;
  percentualConcluido: number;
}

export function resumirPlanoLongoPrazo(transactions: Transaction[], hoje = new Date()): LongTermPlanSummary {
  const sorted = [...transactions].sort((a, b) => (a.parcela ?? 0) - (b.parcela ?? 0));
  const firstInstallment = sorted[0]?.parcelaInicial ?? sorted[0]?.parcela ?? 1;
  const totalParcelas = Math.max(1, ...sorted.map((transaction) => transaction.totalParcelas ?? 1));
  const valorParcela = sorted[0]?.valor ?? 0;
  const hojeIso = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
  const datedInstallments = sorted.filter((transaction) => transaction.data <= hojeIso || transaction.is_paid === true).length;
  const parcelaAtual = Math.min(totalParcelas, firstInstallment - 1 + datedInstallments);
  const totalPago = parcelaAtual * valorParcela;
  const saldoDevedor = Math.max(0, (totalParcelas - parcelaAtual) * valorParcela);

  return {
    parcelaAtual,
    totalParcelas,
    valorParcela,
    totalPago,
    saldoDevedor,
    percentualConcluido: Math.round((parcelaAtual / totalParcelas) * 100),
  };
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
    cardsCache = raw ? JSON.parse(raw) : [];
    if (!raw) localStorage.setItem(CARDS_KEY, JSON.stringify(cardsCache));
  } catch {
    cardsCache = [];
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
  else saveCards([...cards, { ...c, id: c.id ?? Math.random().toString(36).slice(2) }]);
}
/** Returns false (and does nothing) when the card still has linked transactions. */
export function deleteCard(id: string): boolean {
  const cards = loadCards();
  if (load().some((t) => t.account_id === id || t.cartao === id || (t.conta === "Crédito" && cartaoDe(t, cards) === id))) return false;
  saveCards(cards.filter((c) => c.id !== id));
  saveTransactionAccounts(loadTransactionAccounts().filter((account) => account.id !== id));
  return true;
}
export function useCards() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    loadCards,
    () => EMPTY_CARDS,
  );
}

let accountsCache: ContaBancaria[] | null = null;
const EMPTY_ACCOUNTS: ContaBancaria[] = [];

export function loadBankAccounts(): ContaBancaria[] {
  if (accountsCache) return accountsCache;
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    accountsCache = raw ? JSON.parse(raw) : [];
    if (!raw) localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accountsCache));
  } catch {
    accountsCache = [];
  }
  return accountsCache!;
}

function saveBankAccounts(next: ContaBancaria[]) {
  accountsCache = next;
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function upsertBankAccount(account: Omit<ContaBancaria, "id"> & { id?: string }) {
  const accounts = loadBankAccounts();
  if (account.id && accounts.some((item) => item.id === account.id)) {
    saveBankAccounts(accounts.map((item) => item.id === account.id ? { ...item, ...account, id: item.id } : item));
    return account.id;
  }
  const id = account.id ?? Math.random().toString(36).slice(2);
  saveBankAccounts([...accounts, { ...account, id }]);
  return id;
}

export function deleteBankAccount(id: string): boolean {
  if (
    load().some((transaction) => transaction.account_id === id || transaction.conta_bancaria_id === id)
    || loadCaixinhas().some((pocket) => pocket.contaBancariaId === id)
  ) return false;
  saveBankAccounts(loadBankAccounts().filter((account) => account.id !== id));
  saveTransactionAccounts(loadTransactionAccounts().filter((account) => account.id !== id));
  return true;
}

export function useBankAccounts() {
  return useSyncExternalStore(
    (callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    loadBankAccounts,
    () => EMPTY_ACCOUNTS,
  );
}

function saveTransactionAccounts(next: TransactionAccount[]) {
  transactionAccountsCache = next;
  localStorage.setItem(TRANSACTION_ACCOUNTS_KEY, JSON.stringify(next));
  localStorage.setItem(LEGACY_TRANSACTION_ACCOUNTS_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function loadTransactionAccounts(): TransactionAccount[] {
  const stored = (() => {
    if (transactionAccountsCache) return transactionAccountsCache;
    try {
      const raw = localStorage.getItem(TRANSACTION_ACCOUNTS_KEY) ?? localStorage.getItem(LEGACY_TRANSACTION_ACCOUNTS_KEY);
      transactionAccountsCache = raw ? JSON.parse(raw) : [];
    } catch {
      transactionAccountsCache = [];
    }
    return transactionAccountsCache!;
  })();
  const currentAccounts: TransactionAccount[] = [
    ...loadCards().map((card) => ({ id: card.id, name: card.nome, type: "CREDIT_CARD" as const })),
    ...loadBankAccounts().map((account) => ({ id: account.id, name: account.nome, type: "CHECKING_ACCOUNT" as const })),
  ];
  const merged = new Map(stored.map((account) => [account.id, account]));
  currentAccounts.forEach((account) => merged.set(account.id, account));
  const accounts = [...merged.values()];
  if (accounts.length !== stored.length || accounts.some((account, index) => account.id !== stored[index]?.id || account.name !== stored[index]?.name || account.type !== stored[index]?.type)) {
    transactionAccountsCache = accounts;
    localStorage.setItem(TRANSACTION_ACCOUNTS_KEY, JSON.stringify(accounts));
    localStorage.setItem(LEGACY_TRANSACTION_ACCOUNTS_KEY, JSON.stringify(accounts));
  } else {
    transactionAccountsCache = stored;
  }
  return transactionAccountsCache;
}

export function getTransactionAccount(id: string): TransactionAccount | undefined {
  return loadTransactionAccounts().find((account) => account.id === id);
}

export function upsertTransactionAccount(name: string, type: TransactionAccountType): string | null {
  const normalizedName = name.trim().replace(/\s+/g, " ");
  if (!normalizedName) return null;
  const match = loadTransactionAccounts().find((account) => account.type === type && account.name.toLowerCase() === normalizedName.toLowerCase());
  if (match) return match.id;

  const id = Math.random().toString(36).slice(2);
  if (type === "CREDIT_CARD") {
    upsertCard({ id, nome: normalizedName, limite: 5000, fechamento: 5, vencimento: 12 });
  } else {
    upsertBankAccount({ id, nome: normalizedName, instituicao: normalizedName, tipo: "corrente", saldoInicial: 0 });
  }
  const syncedAccounts = loadTransactionAccounts();
  if (!syncedAccounts.some((account) => account.id === id)) {
    saveTransactionAccounts([...syncedAccounts, { id, name: normalizedName, type }]);
  }
  return id;
}

export function useTransactionAccounts() {
  return useSyncExternalStore(
    (callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    loadTransactionAccounts,
    () => EMPTY_TRANSACTION_ACCOUNTS,
  );
}

export function tipoDaContaTransacao(id: string | null | undefined): TransactionAccountType | undefined {
  return id ? getTransactionAccount(id)?.type : undefined;
}

export function cartaoSelecionado(t: Transaction, cardId: string, cards: Cartao[] = loadCards()) {
  if (Object.prototype.hasOwnProperty.call(t, "account_id")) return t.account_id === cardId;
  return t.conta === "Crédito" && cartaoDe(t, cards) === cardId;
}

export function saldoDaConta(account: ContaBancaria, transactions: Transaction[]) {
  return transactions
    .filter((transaction) => transaction.conta_bancaria_id === account.id)
    .reduce((balance, transaction) => balance + (transaction.tipo === "receita" ? transaction.valor : -transaction.valor), account.saldoInicial);
}

let pocketsCache: Caixinha[] | null = null;
const EMPTY_POCKETS: Caixinha[] = [];

export function loadCaixinhas(): Caixinha[] {
  if (pocketsCache) return pocketsCache;
  try {
    const raw = localStorage.getItem(POCKETS_KEY);
    pocketsCache = raw ? JSON.parse(raw) : [];
    if (!raw) localStorage.setItem(POCKETS_KEY, JSON.stringify(pocketsCache));
  } catch {
    pocketsCache = [];
  }
  return pocketsCache!;
}

function saveCaixinhas(next: Caixinha[]) {
  pocketsCache = next;
  localStorage.setItem(POCKETS_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function upsertCaixinha(pocket: Omit<Caixinha, "id"> & { id?: string }) {
  const pockets = loadCaixinhas();
  if (pocket.id && pockets.some((item) => item.id === pocket.id)) {
    saveCaixinhas(pockets.map((item) => item.id === pocket.id ? { ...item, ...pocket, id: item.id } : item));
    return pocket.id;
  }
  const id = Math.random().toString(36).slice(2);
  saveCaixinhas([...pockets, { ...pocket, id }]);
  return id;
}

export function deleteCaixinha(id: string) {
  saveCaixinhas(loadCaixinhas().filter((pocket) => pocket.id !== id));
}

export function useCaixinhas() {
  return useSyncExternalStore(
    (callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    loadCaixinhas,
    () => EMPTY_POCKETS,
  );
}

export function saldoTotalComCaixinhas(accountBalance: number, pockets: Caixinha[]) {
  return accountBalance + pockets.reduce((total, pocket) => total + pocket.saldo, 0);
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
    .filter((t) => cartaoSelecionado(t, c.id, cards) && t.tipo === "despesa" && faturaDe(t, c) >= aberta)
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
  [/cons[oó]rcio|consorcio/i, "Consórcio"],
  [/financiamento|financiar|financiado|financiada/i, "Financiamento"],
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

const AMOUNT_PATTERN = /(?:r\$\s*|rs\s*)?((?:\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:[.,]\d{1,2})?))/i;

function normalizeAmount(raw: string) {
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    return lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  }
  if (lastComma >= 0) {
    return /^\d{1,3}(?:,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  }
  if (lastDot >= 0 && /^\d{1,3}(?:\.\d{3})+$/.test(raw)) return raw.replace(/\./g, "");
  return raw;
}

const parseAmount = (raw: string) => {
  const match = raw.match(AMOUNT_PATTERN);
  const amount = match?.[1];
  if (!amount) return null;
  const value = normalizeAmount(amount);
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
  account_id?: string | null;
  account_name: string | null;
  installments: number;
  date: string;
  expense_owner: ExpenseOwner;
  contact_id?: string | null;
  contact_name: string | null;
  installmentCurrent?: number;
  asset_value?: number;
  is_recurring?: boolean;
  is_paid?: boolean;
}
export interface StrictFinancialExtraction {
  transactions: StrictFinancialTransaction[];
}

function parseInstallments(text: string) {
  const installmentPhrase = text.match(/\bparcela\s+(\d{1,3})\s+de\s+(\d{1,3})\b/i);
  if (installmentPhrase) {
    const total = Number(installmentPhrase[2]);
    return Number.isFinite(total) ? Math.max(1, Math.min(999, total)) : 1;
  }
  const fraction = text.match(/\b\d{1,3}\s*\/\s*(\d{1,3})\b/);
  if (fraction) {
    const total = Number(fraction[1]);
    return Number.isFinite(total) ? Math.max(1, Math.min(999, total)) : 1;
  }
  const match = text.match(/(?:parcelado\s+em|em)\s*(\d{1,3})\s*(?:x|vezes|parcelas)?\b|\b(\d{1,3})\s*(?:x|vezes|parcelas)\b/i);
  if (!match) return 1;
  const value = Number(match[1] ?? match[2]);
  return Number.isFinite(value) ? Math.max(1, Math.min(999, value)) : 1;
}

function parseInstallmentCurrent(text: string) {
  const fraction = text.match(/\b(\d{1,3})\s*\/\s*\d{1,3}\b/);
  const phrase = text.match(/\bparcela\s+(\d{1,3})\s+de\s+\d{1,3}\b/i);
  const current = Number(fraction?.[1] ?? phrase?.[1]);
  if (!Number.isFinite(current)) return undefined;
  return Number.isFinite(current) ? Math.max(1, Math.min(999, current)) : undefined;
}

function parseAssetValue(text: string): number | undefined {
  const match = text.match(/\b(?:valor\s+da\s+carta|carta|valor\s+do\s+bem|bem\s+financiado|total|financiamento\s+de)\s*(?:de\s+)?(?:r\$\s*)?(\d[\d.,]*)(?:\s*(k))?\b/i);
  if (!match?.[1]) return undefined;
  const value = Number.parseFloat(normalizeAmount(match[1]));
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return value * (match[2] ? 1000 : 1);
}

function getCategoryFromText(text: string): string {
  const normalized = normalizeText(text);
  const mapping: [RegExp, string][] = [
    [/cons[oó]rcio|consorcio/i, "Consórcio"],
    [/financiamento|financiar|financiado|financiada/i, "Financiamento"],
    [/ifood|delivery|restaurante|lanchonete|lanche|almoco|mercado|supermercado|padaria|pizza|cafe|sorvete|comida|pao|pão|lanche/i, "Alimentação"],
    [/uber|99|onibus|metro|taxi|gasolina|combustivel|estacionamento|transporte|carro|carona|moto|motocicleta|placa|mecanico|mec[aâ]nica/i, "Transporte"],
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
    .replace(/^(?:r\$\s*|rs\s*)/i, "")
    .replace(/\b(?:reais|real|brl)\b/gi, " ")
    .replace(/\bparcela\s+\d{1,3}\s+de\s+\d{1,3}\b/gi, " ")
    .replace(/\b\d{1,3}\s*\/\s*\d{1,3}\b/g, " ")
    .replace(/\b\d{1,3}\s*(?:x|vezes|parcelas?)\b/gi, " ")
    .replace(/\b(?:d[eé]bito|cr[eé]dito|pix)\b/gi, " ")
    .replace(/\bparcelas?\b/gi, " ")
    .replace(/^(?:de|da|do|na|no|em|por|para|a\s+|o\s+)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return withoutSignals.length > 0 ? withoutSignals.charAt(0).toUpperCase() + withoutSignals.slice(1) : "Lançamento";
}

function inferExpenseOwner(text: string): ExpenseOwner {
  const personContext = /\b(?:para|pro|pra)\s+(?:(?:o|a)\s+)?[A-ZÀ-Þ][\p{L}-]*/u.test(text);
  const namedPossessor = /\b(?:do|da)\s+[A-ZÀ-Þ][\p{L}-]+/u.test(text);
  return personContext || namedPossessor ? "Terceiros" : "Próprio";
}

function extractContactContext(text: string) {
  const match = text.match(/\b(?:para|pro|pra|da|do)\s+(?:o\s+|a\s+)?([\p{L}][\p{L}'-]*)\s*$/iu);
  const candidate = match?.[1]?.trim();
  const genericDestinations = new Set(["casa", "trabalho", "empresa", "rua", "conta", "cartao", "cartão", "mercado", "praia"]);
  if (!match || !candidate || genericDestinations.has(normalizeText(candidate))) return null;
  return { name: candidate, match };
}

function splitIntoClauses(text: string) {
  const segments = text
    .split(/\s*(?:;|(?<!\d),(?!\d)|\s+e\s+|\s+\band\b\s+|\s+\bmais\b\s+)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return segments.length > 0 ? segments : [text.trim()];
}

function extractSingleTransaction(text: string, contacts: Contact[], accounts: TransactionAccount[]): StrictFinancialTransaction | null {
  const amountMatch = text.match(AMOUNT_PATTERN);
  const amountToken = amountMatch?.[1];
  if (!amountMatch || !amountToken) return null;

  const amount = Number.parseFloat(normalizeAmount(amountToken));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const contactContext = extractContactContext(text);
  const descriptionText = contactContext
    ? text.slice(0, contactContext.match.index) + text.slice((contactContext.match.index ?? 0) + contactContext.match[0].length)
    : text;
  const description = normalizeDescription(descriptionText.replace(amountMatch[0], "").trim());
  if (!description || description === "Lançamento") return null;

  const type = inferStrictType(text);
  const date = /ontem/i.test(text) ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const installmentCurrent = parseInstallmentCurrent(text);
  const installments = parseInstallments(text);
  const assetValue = parseAssetValue(text);
  const contact = contactContext
    ? contacts.find((item) => item.name.toLowerCase() === contactContext.name.toLowerCase())
    : undefined;
  const normalizedInput = normalizeText(text);
  const sortedAccounts = [...accounts].sort((a, b) => b.name.length - a.name.length);
  const mentionedAccount = sortedAccounts.find((account) => normalizeText(account.name).length > 0 && normalizedInput.includes(normalizeText(account.name)));

  const category = getCategoryFromText(text);
  const isAssinatura = category === "Assinatura / Fixo";

  return {
    type,
    amount,
    description,
    category,
    account: getStrictAccount(text),
    account_id: mentionedAccount?.id ?? null,
    account_name: mentionedAccount?.name ?? null,
    installments,
    date,
    ...(installmentCurrent ? { installmentCurrent } : {}),
    ...(assetValue ? { asset_value: assetValue } : {}),
    ...(isAssinatura ? { is_recurring: true } : {}),
    expense_owner: type === "EXPENSE" && (contactContext || inferExpenseOwner(text) === "Terceiros") ? "Terceiros" : "Próprio",
    ...(contact ? { contact_id: contact.id } : {}),
    contact_name: contactContext ? contact?.name ?? contactContext.name : null,
  };
}

export function extractFinancialTransactions(text: string, contacts: Contact[] = [], accounts: TransactionAccount[] = []): StrictFinancialExtraction {
  const clauses = splitIntoClauses(text);
  const transactions = clauses
    .map((clause) => extractSingleTransaction(clause, contacts, accounts))
    .filter((item): item is StrictFinancialTransaction => item !== null);

  if (transactions.length === 0) {
    return { transactions: [{
      type: "EXPENSE",
      amount: 0,
      description: "Lançamento",
      category: "Outros",
      account: null,
      account_id: null,
      account_name: null,
      installments: 1,
      date: new Date().toISOString().slice(0, 10),
      expense_owner: "Próprio",
      contact_name: null,
    }] };
  }

  return { transactions };
}

export function parseMessage(text: string): Draft | null {
  const normalized = normalizeText(text);
  const parcelas = parseInstallments(normalized);
  const parcelaAtual = parseInstallmentCurrent(normalized);
  const clean = normalized.replace(/\bparcela\s+\d{1,3}\s+de\s+\d{1,3}\b|\b\d{1,3}\s*\/\s*\d{1,3}\b|(?:em|parcelado\s+em)\s+\d{1,3}\s*(?:x|vezes|parcelas)?|\b\d{1,3}\s*(?:x|vezes|parcelas)\b/gi, " ");
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
  return { tipo, valor, categoria, conta, descricao, data, cartao, parcelas, ...(parcelaAtual ? { parcela: parcelaAtual } : {}), ...(parcelas > 1 ? { totalParcelas: parcelas, parcelaInicial: parcelaAtual ?? 1 } : {}) };
}

/**
 * Automatically renews recurring subscriptions from the previous month into the current month
 * if they haven't been launched yet.
 */
export function processarRecorrencias(hoje: Date = new Date()): Transaction[] {
  const allTxs = load();
  const currentMonth = ym(hoje.getFullYear(), hoje.getMonth());
  const prevDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const prevMonth = ym(prevDate.getFullYear(), prevDate.getMonth());

  // Find all active subscriptions from previous month
  const prevSubscriptions = allTxs.filter(
    (t) => t.categoria === "Assinatura / Fixo" && t.is_recurring === true && t.data.startsWith(prevMonth),
  );

  if (prevSubscriptions.length === 0) return [];

  // Group by normalized description to get latest record per subscription
  const grouped = new Map<string, Transaction>();
  for (const sub of prevSubscriptions) {
    const key = sub.descricao.trim().toLowerCase();
    const existing = grouped.get(key);
    if (!existing || sub.data.localeCompare(existing.data) > 0) {
      grouped.set(key, sub);
    }
  }

  const currentYear = hoje.getFullYear();
  const currentMonth0 = hoje.getMonth();
  const maxDays = new Date(currentYear, currentMonth0 + 1, 0).getDate();

  const toClone: Transaction[] = [];

  for (const [key, candidate] of grouped.entries()) {
    const alreadyLaunched = allTxs.some(
      (t) =>
        t.categoria === "Assinatura / Fixo" &&
        t.data.startsWith(currentMonth) &&
        t.descricao.trim().toLowerCase() === key,
    );

    if (!alreadyLaunched) {
      const origDay = Number(candidate.data.split("-")[2]) || 1;
      const targetDay = Math.min(origDay, maxDays);
      const newDate = `${currentYear}-${pad(currentMonth0 + 1)}-${pad(targetDay)}`;

      const cloned: Transaction = {
        ...candidate,
        id: Math.random().toString(36).slice(2),
        data: newDate,
        is_recurring: true,
        is_paid: false,
        parcela: undefined,
        totalParcelas: undefined,
        installment_group_id: undefined,
        parcelaInicial: undefined,
      };
      toClone.push(cloned);
    }
  }

  if (toClone.length > 0) {
    save([...toClone, ...allTxs]);
  }

  return toClone;
}

/**
 * Cancels recurring renewal for an Assinatura / Fixo expense by setting is_recurring to false
 * on the latest recorded entry for that subscription.
 */
export function cancelarRenovacaoAssinatura(idOrTxOrDesc: string | Transaction): boolean {
  const txs = load();
  const target = typeof idOrTxOrDesc === "string"
    ? (txs.find((t) => t.id === idOrTxOrDesc) ?? txs.find((t) => t.categoria === "Assinatura / Fixo" && t.descricao.trim().toLowerCase() === idOrTxOrDesc.trim().toLowerCase()))
    : idOrTxOrDesc;
  if (!target) return false;

  const targetDesc = target.descricao.trim().toLowerCase();
  const matches = txs
    .filter((t) => t.categoria === "Assinatura / Fixo" && t.descricao.trim().toLowerCase() === targetDesc)
    .sort((a, b) => b.data.localeCompare(a.data));

  const latest = matches[0] ?? target;
  updateTransaction(latest.id, { is_recurring: false });
  return true;
}

/**
 * Reactivates recurring renewal for an Assinatura / Fixo expense.
 */
export function reativarRenovacaoAssinatura(idOrTxOrDesc: string | Transaction): boolean {
  const txs = load();
  const target = typeof idOrTxOrDesc === "string"
    ? (txs.find((t) => t.id === idOrTxOrDesc) ?? txs.find((t) => t.categoria === "Assinatura / Fixo" && t.descricao.trim().toLowerCase() === idOrTxOrDesc.trim().toLowerCase()))
    : idOrTxOrDesc;
  if (!target) return false;

  const targetDesc = target.descricao.trim().toLowerCase();
  const matches = txs
    .filter((t) => t.categoria === "Assinatura / Fixo" && t.descricao.trim().toLowerCase() === targetDesc)
    .sort((a, b) => b.data.localeCompare(a.data));

  const latest = matches[0] ?? target;
  updateTransaction(latest.id, { is_recurring: true });
  return true;
}
/**
 * Saldo Atual = (receitas realizadas) - (despesas pessoais realizadas). "Realizada" = data <= hoje.
 * Despesas de terceiros (contact_id) NUNCA afetam o saldo: sao tratadas a parte em "Terceiros".
 */
export function calcularSaldoAtual(transactions: Transaction[], hojeIso: string = new Date().toISOString().slice(0, 10)): number {
  return transactions
    .filter((t) => t.data <= hojeIso && !(t.tipo === "despesa" && t.contact_id))
    .reduce((sum, t) => sum + (t.tipo === "receita" ? t.valor : -t.valor), 0);
}
/** Transações cuja data pertence ao mês (yyyy-mm). */
export function transacoesDoMes(transactions: Transaction[], mes: string): Transaction[] {
  return transactions.filter((t) => t.data.startsWith(mes));
}

/** Agrupa por dia (data desc). */
export function agruparPorDia(transactions: Transaction[]): { data: string; items: Transaction[] }[] {
  const map = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = map.get(t.data);
    if (list) list.push(t);
    else map.set(t.data, [t]);
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([data, items]) => ({ data, items }));
}

export function resumoMensal(transactions: Transaction[]) {
  const entradas = transactions.filter((t) => t.tipo === "receita").reduce((s, t) => s + t.valor, 0);
  const saidas = transactions.filter((t) => t.tipo === "despesa").reduce((s, t) => s + t.valor, 0);
  return { entradas, saidas, balanco: entradas - saidas };
}

/** Desloca um mês yyyy-mm em n meses. */
export function deslocarMes(mes: string, n: number): string {
  const [y, m] = mes.split("-").map(Number) as [number, number];
  const d = new Date(y, m - 1 + n, 1);
  return ym(d.getFullYear(), d.getMonth());
}

/**
 * Resumo do mês isolando despesas pessoais de valores a receber de terceiros.
 * - gastos: despesas sem contact_id (terceiros nunca entram aqui)
 * - aReceber: despesas de terceiros ainda pendentes (is_paid !== true)
 * - entradas: receitas
 */
export function resumoMensalSeparado(transactions: Transaction[]) {
  const gastos = transactions.filter((t) => t.tipo === "despesa" && !t.contact_id).reduce((s, t) => s + t.valor, 0);
  const aReceber = transactions.filter((t) => t.tipo === "despesa" && !!t.contact_id && !t.is_paid).reduce((s, t) => s + t.valor, 0);
  const repasseTerceiros = transactions.filter((t) => t.tipo === "despesa" && !!t.contact_id).reduce((s, t) => s + t.valor, 0);
  const totalGasto = gastos + repasseTerceiros;
  const entradas = transactions.filter((t) => t.tipo === "receita").reduce((s, t) => s + t.valor, 0);
  return { gastos, aReceber, repasseTerceiros, totalGasto, entradas };
}


/**
 * Initializes synchronization with the local SQLite server.
 */
export async function initFinanceApiSync() {
  if (typeof window === "undefined") return;
  try {
    const [apiAccounts, apiContacts, apiTxs] = await Promise.all([
      api.getAccounts().catch(() => null),
      api.getContacts().catch(() => null),
      api.getTransactions().catch(() => null),
    ]);

    if (Array.isArray(apiAccounts)) {
      transactionAccountsCache = apiAccounts.map((a) => ({ id: a.id, name: a.name, type: a.type }));
      localStorage.setItem(TRANSACTION_ACCOUNTS_KEY, JSON.stringify(transactionAccountsCache));
    }
    if (Array.isArray(apiContacts)) {
      contactsCache = apiContacts.map((c) => ({ id: c.id, name: c.name }));
      localStorage.setItem(CONTACTS_KEY, JSON.stringify(contactsCache));
    }
    if (Array.isArray(apiTxs)) {
      cache = apiTxs as unknown as Transaction[];
      localStorage.setItem(KEY, JSON.stringify(cache));
    }
    listeners.forEach((l) => l());

    // Process recurring subscriptions from previous month on the server
    await api.processRecurring().catch(() => {});
  } catch (err) {
    console.warn("Could not sync with SQLite API (offline or not reachable):", err);
  }
}

/**
 * React hook to fetch dashboard summary calculated entirely via SQL on SQLite.
 */
export function useDashboardSummary(month = new Date().toISOString().slice(0, 7)) {
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getDashboardSummary(month);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    const listener = () => { fetchSummary(); };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [fetchSummary]);

  return { summary, loading, refetch: fetchSummary };
}

/**
 * React hook to fetch third party summary calculated entirely via SQL on SQLite.
 */
export function useThirdPartySummary(month = new Date().toISOString().slice(0, 7)) {
  const [summary, setSummary] = useState<ThirdPartySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getThirdPartySummary(month);
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    const listener = () => { fetchSummary(); };
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, [fetchSummary]);

  return { summary, loading, refetch: fetchSummary };
}


/**
 * Zera completamente o aplicativo:
 * - Executa DELETE FROM nas tabelas operacionais do SQLite via API (mantendo schema)
 * - Limpa todos os dados salvos no LocalStorage
 * - Reseta todos os caches em memória da aplicação
 * - Notifica todos os listeners reativos
 */
export async function zerarAplicativo(): Promise<boolean> {
  if (typeof window !== "undefined") {
    try {
      await api.resetDatabase();
    } catch (err) {
      console.warn("Could not reset SQLite API (offline or not reachable):", err);
    }

    try {
      localStorage.clear();
      localStorage.setItem(KEY, JSON.stringify([]));
      localStorage.setItem(CONTACTS_KEY, JSON.stringify([]));
      localStorage.setItem(TRANSACTION_ACCOUNTS_KEY, JSON.stringify([]));
      localStorage.setItem(LEGACY_TRANSACTION_ACCOUNTS_KEY, JSON.stringify([]));
      localStorage.setItem(CARDS_KEY, JSON.stringify([]));
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify([]));
      localStorage.setItem(POCKETS_KEY, JSON.stringify([]));
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
    } catch (err) {
      console.warn("Error clearing localStorage:", err);
    }
  }

  cache = [];
  contactsCache = [];
  transactionAccountsCache = [];
  cardsCache = [];
  accountsCache = [];
  pocketsCache = [];
  settingsCache = { ...DEFAULT_SETTINGS };

  listeners.forEach((l) => l());

  return true;
}

export const clearAllData = zerarAplicativo;
