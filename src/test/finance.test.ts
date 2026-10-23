import { describe, expect, it } from "vitest";
import { gerarParcelas, parseMessage } from "@/lib/finance";

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
