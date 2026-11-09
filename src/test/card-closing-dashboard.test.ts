import { describe, it, expect, beforeEach } from "vitest";
import {
  computeTransactionMesReferencia,
  transacoesDoMes,
  mesReferenciaDe,
  type Transaction,
  type Cartao,
  upsertCard,
  loadCards,
  addTransaction,
} from "@/lib/finance";

describe("Credit Card Closing Day & Dashboard Reference Month", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("calcula mesReferencia no mês corrente quando compra no C6 (fechamento 14) é feita no dia 9 (9 < 14)", () => {
    const mes = computeTransactionMesReferencia("2026-11-09", "CREDIT_CARD", 14);
    expect(mes).toBe("2026-11");
  });

  it("calcula mesReferencia no próximo mês quando compra no C6 (fechamento 14) é feita no dia 14 ou após (>= 14)", () => {
    const mesFechamento = computeTransactionMesReferencia("2026-11-14", "CREDIT_CARD", 14);
    expect(mesFechamento).toBe("2026-12");

    const mesApos = computeTransactionMesReferencia("2026-11-15", "CREDIT_CARD", 14);
    expect(mesApos).toBe("2026-12");
  });

  it("mesReferenciaDe resolve o fechamento correto do cartão pelo account_id e nome", () => {
    upsertCard({ id: "card_c6", nome: "C6", limite: 5000, fechamento: 14, vencimento: 21 });

    const tx: Transaction = {
      id: "tx-c6-test",
      tipo: "despesa",
      valor: 302.96,
      categoria: "Outros",
      conta: "Crédito",
      descricao: "Faculdade cartao c6",
      data: "2026-11-09",
      account_id: "card_c6",
    };

    expect(mesReferenciaDe(tx)).toBe("2026-11");

    const doNovembro = transacoesDoMes([tx], "2026-11");
    expect(doNovembro).toHaveLength(1);
    expect(doNovembro[0].valor).toBe(302.96);

    const doDezembro = transacoesDoMes([tx], "2026-12");
    expect(doDezembro).toHaveLength(0);
  });

  it("adiciona transação no cartão C6 com fechamento 14 e data 09/11 garantindo mesReferencia 2026-11", () => {
    upsertCard({ id: "card_c6_real", nome: "C6", limite: 5000, fechamento: 14, vencimento: 21 });

    addTransaction({
      tipo: "despesa",
      valor: 302.96,
      categoria: "Outros",
      conta: "Crédito",
      descricao: "Faculdade cartao c6",
      data: "2026-11-09",
      account_id: "card_c6_real",
    });

    const raw = localStorage.getItem("fin-transactions-v1") ?? "[]";
    const txs: Transaction[] = JSON.parse(raw);
    const saved = txs.find((t) => t.descricao === "Faculdade cartao c6");
    expect(saved).toBeDefined();
    expect(saved?.mesReferencia).toBe("2026-11");
  });
});
