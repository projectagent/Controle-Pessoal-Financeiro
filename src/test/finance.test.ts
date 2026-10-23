import { describe, expect, it } from "vitest";
import { addTransaction, anteciparParcelas, deleteCard, extractFinancialTransactions, gerarParcelas, limiteUsado, loadCards, parseMessage, updateTransactionsByInstallmentGroupId, upsertCard, type Cartao } from "@/lib/finance";

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

  it("classifica transferências recebidas como receita", () => {
    const d = parseMessage("Recebi R$ 1200 por transferência")!;
    expect(d.tipo).toBe("receita");
    expect(d.categoria).toBe("Outros");
  });

  it("categorizza gastos em farmácia como saúde", () => {
    const d = parseMessage("Paguei R$ 89,90 na farmácia")!;
    expect(d.tipo).toBe("despesa");
    expect(d.categoria).toBe("Saúde");
  });

  it("gera X linhas em meses seguintes somando o total", () => {
    const rows = gerarParcelas({ tipo: "despesa", valor: 100, categoria: "Compras", conta: "Crédito", descricao: "x", data: "2026-01-31" }, 3);
    expect(rows.map((r) => r.data)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    expect(rows.map((r) => `${r.parcela}/${r.totalParcelas}`)).toEqual(["1/3", "2/3", "3/3"]);
    expect(rows.reduce((s, r) => s + r.valor, 0)).toBeCloseTo(100);
  });
});

describe("extração estrita de lançamentos", () => {
  it("separa múltiplos gastos em um único texto", () => {
    const result = extractFinancialTransactions("gastei 20 de pão e 50 de uber");
    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[0]).toMatchObject({ type: "EXPENSE", amount: 20, category: "Alimentação", description: "Pão" });
    expect(result.transactions[1]).toMatchObject({ type: "EXPENSE", amount: 50, category: "Transporte", description: "Uber" });
  });

  it("detecta transferências e conta pelo método informado", () => {
    const result = extractFinancialTransactions("transferi 1200 para a conta do aluguel em 3x");
    expect(result.transactions[0]).toMatchObject({ type: "TRANSFER", amount: 1200, installments: 3, account: null });
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

describe("parcelas em grupo", () => {
  it("atualiza todos os itens de um mesmo grupo ao editar em massa", () => {
    const groupId = "group-update-test";
    addTransaction({ tipo: "despesa", valor: 200, categoria: "Compras", conta: "Crédito", cartao: "principal", descricao: "Notebook", data: "2026-01-15", installment_group_id: groupId }, 3);

    updateTransactionsByInstallmentGroupId(groupId, { categoria: "Eletrônicos", descricao: "Monitor", valor: 450 });

    const rows = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]").filter((t: any) => t.installment_group_id === groupId);
    expect(rows).toHaveLength(3);
    expect(rows.every((t: any) => t.categoria === "Eletrônicos")).toBe(true);
    expect(rows.every((t: any) => t.descricao === "Monitor")).toBe(true);
    expect(rows.every((t: any) => t.valor === 450)).toBe(true);
  });

  it("antecipa as últimas parcelas do grupo e atualiza valor e data", () => {
    const groupId = "group-advance-test";
    const base = { tipo: "despesa" as const, categoria: "Compras", conta: "Crédito", cartao: "principal", descricao: "Notebook", data: "2026-01-15", installment_group_id: groupId };
    addTransaction(base, 4);

    const rowsBefore = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]").filter((t: any) => t.installment_group_id === groupId).sort((a: any, b: any) => a.parcela - b.parcela);
    const current = rowsBefore[rowsBefore.length - 1];
    const today = new Date();

    anteciparParcelas(groupId, 2, 350, today);

    const rowsAfter = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]").filter((t: any) => t.installment_group_id === groupId).sort((a: any, b: any) => a.parcela - b.parcela);
    expect(rowsAfter.slice(-2).every((t: any) => t.data === today.toISOString().slice(0, 10))).toBe(true);
    expect(rowsAfter.slice(-2).every((t: any) => t.valor === 350)).toBe(true);
    expect(current.parcela).toBe(4);
  });
});
