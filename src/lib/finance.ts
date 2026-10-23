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

export function addTransaction(t: Omit<Transaction, "id">) {
  save([{ ...t, id: Math.random().toString(36).slice(2) }, ...load()]);
}
export function removeTransaction(id: string) {
  save(load().filter((t) => t.id !== id));
}

export function useTransactions() {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    load,
    () => EMPTY,
  );
}

export const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const KEYWORDS: [RegExp, string][] = [
  [/ifood|restaurante|lanche|almo[cç]o|jantar|mercado|padaria|pizza|caf[eé]|comida/i, "Alimentação"],
  [/uber|99|[ôo]nibus|gasolina|combust[ií]vel|metr[ôo]|estacionamento/i, "Transporte"],
  [/aluguel|condom[ií]nio|luz|[aá]gua|internet|energia/i, "Moradia"],
  [/cinema|netflix|spotify|show|bar|viagem|jogo/i, "Lazer"],
  [/farm[aá]cia|m[eé]dico|rem[eé]dio|academia|consulta/i, "Saúde"],
  [/roupa|amazon|loja|shopping|presente/i, "Compras"],
  [/curso|livro|faculdade|escola/i, "Educação"],
  [/sal[aá]rio/i, "Salário"],
  [/freela|freelance|projeto/i, "Freelance"],
];

export function parseMessage(text: string): Omit<Transaction, "id"> | null {
  const m = text.match(/(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const valor = parseFloat((m[1] ?? "0").replace(",", "."));
  const tipo: TxType = /recebi|ganhei|sal[aá]rio|entrou|freela|vendi/i.test(text) ? "receita" : "despesa";
  const categoria = KEYWORDS.find(([r]) => r.test(text))?.[1] ?? "Outros";
  const conta = /cr[eé]dito|cart[aã]o/i.test(text) ? "Crédito" : /pix/i.test(text) ? "Pix" : /dinheiro|esp[eé]cie/i.test(text) ? "Dinheiro" : "Débito";
  const data = iso(/ontem/i.test(text) ? 1 : 0);
  const descricao = text.length > 60 ? text.slice(0, 57) + "..." : text;
  return { tipo, valor, categoria, conta, descricao, data };
}
