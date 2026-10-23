import { describe, expect, it } from "vitest";
import { addTransaction, deleteCard, gerarParcelas, limiteUsado, loadCards, parseMessage, upsertCard, type Cartao } from "@/lib/finance";

describe("parcelamento", () => {
  it("detecta 'em 10 vezes' e força crédito", () => {
    const d = parseMessage("Comprei uma TV de 1200 em 10 vezes")!;
    expect(d.parcelas).toBe(10);
    expect(d.valor).toBe(1200);
    expect(d.conta).toBe("Crédito");
  });

  it("detecta 'parcelado em 3'", () => {
    expect(parseMessage("Gastei 300 no sofá parcelado em 3")!.parcelas).toBe(3);
  });

  it("gera X linhas em meses seguintes somando o total", () => {
    const rows = gerarParcelas({ tipo: "despesa", valor: 100, categoria: "Compras", conta: "Crédito", descricao: "x", data: "2026-01-31" }, 3);
    expect(rows.map((r) => r.data)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(rows.map((r) => `${r.parcela}/${r.totalParcelas}`)).toEqual(["1/3", "2/3", "3/3"]);
    expect(rows.reduce((s, r) => s + r.valor, 0)).toBeCloseTo(100);
  });
});

describe("limite do cartão", () => {
  const c: Cartao = { id: "x", nome: "X", limite: 1000, fechamento: 5, vencimento: 12 };
  const hoje = new Date(2026, 9, 23); // 23/10 → fatura aberta = nov/2026
  const base = { tipo: "despesa" as const, categoria: "Compras", conta: "Crédito", cartao: "x", descricao: "t" };

  it("soma fatura aberta + parcelas futuras, ignora faturas fechadas", () => {
    const txs = [
      { ...base, id: "1", valor: 100, data: "2026-10-01" }, // fatura out (fechada)
      { ...base, id: "2", valor: 200, data: "2026-10-20" }, // fatura nov (aberta)
      { ...base, id: "3", valor: 300, data: "2026-12-20" }, // futura
    ];
    expect(limiteUsado(c, txs, [c], hoje)).toBe(500);
  });
});

describe("exclusão de cartão", () => {
  it("bloqueia quando há transações vinculadas e permite quando não há", () => {
    upsertCard({ nome: "Teste", limite: 500, fechamento: 1, vencimento: 10 });
    const novo = loadCards().find((k) => k.nome === "Teste")!;
    addTransaction({ tipo: "despesa", valor: 10, categoria: "Outros", conta: "Crédito", cartao: novo.id, descricao: "a", data: "2026-10-01" });
    expect(deleteCard(novo.id)).toBe(false);
    upsertCard({ nome: "Vazio", limite: 500, fechamento: 1, vencimento: 10 });
    const vazio = loadCards().find((k) => k.nome === "Vazio")!;
    expect(deleteCard(vazio.id)).toBe(true);
  });
});
