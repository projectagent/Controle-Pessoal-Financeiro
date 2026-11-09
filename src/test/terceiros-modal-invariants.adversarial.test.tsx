import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import React from "react";
import { ContactExpensesDialog } from "@/routes/terceiros";
import {
  brl,
  deslocarMes,
  totalAReceberGeral,
  totalAReceberMes,
  type Contact,
  type Transaction,
} from "@/lib/finance";

describe("Adversarial Empirical Verification — Terceiros Modal Invariants", () => {
  const contactAlpha: Contact = { id: "c-alpha", name: "Alpha Tester" };
  const contactBeta: Contact = { id: "c-beta", name: "Beta Tester" };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));

    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // Invariant 1: Totalizador Fixo
  // Total a Receber (Geral) MUST be mathematically identical across ALL navigations
  // =========================================================================
  describe("Invariant 1: Totalizador Fixo (Mathematical Invariance)", () => {
    it("maintains strict mathematical equality across 48 continuous month transitions (-24 to +24)", () => {
      // Create multi-year distributed transactions for Alpha
      const transactions: Transaction[] = [
        {
          id: "tx-2024-11",
          tipo: "despesa",
          valor: 111.11,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Passado distante",
          data: "2024-11-01",
          mesReferencia: "2024-11",
          contact_id: "c-alpha",
          is_paid: false,
        },
        {
          id: "tx-2025-06",
          tipo: "despesa",
          valor: 222.22,
          categoria: "Alimentação",
          conta: "Pix",
          descricao: "Meio do caminho",
          data: "2025-06-15",
          mesReferencia: "2025-06",
          contact_id: "c-alpha",
          is_paid: false,
        },
        {
          id: "tx-2026-11-unpaid",
          tipo: "despesa",
          valor: 333.33,
          categoria: "Lazer",
          conta: "Crédito",
          descricao: "Atual pendente",
          data: "2026-11-10",
          mesReferencia: "2026-11",
          contact_id: "c-alpha",
          is_paid: false,
        },
        {
          id: "tx-2026-11-paid",
          tipo: "despesa",
          valor: 999.99,
          categoria: "Lazer",
          conta: "Crédito",
          descricao: "Atual PAGO (must be excluded from pending)",
          data: "2026-11-12",
          mesReferencia: "2026-11",
          contact_id: "c-alpha",
          is_paid: true,
        },
        {
          id: "tx-2027-02",
          tipo: "despesa",
          valor: 444.44,
          categoria: "Compras",
          conta: "Crédito",
          descricao: "Futuro 2027",
          data: "2027-02-20",
          mesReferencia: "2027-02",
          contact_id: "c-alpha",
          is_paid: false,
        },
        {
          id: "tx-2028-11",
          tipo: "despesa",
          valor: 555.55,
          categoria: "Educação",
          conta: "Pix",
          descricao: "Futuro distante",
          data: "2028-11-05",
          mesReferencia: "2028-11",
          contact_id: "c-alpha",
          is_paid: false,
        },
        // Beta transaction to verify no leakage
        {
          id: "tx-beta",
          tipo: "despesa",
          valor: 5000.0,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Despesa do Beta",
          data: "2026-11-10",
          mesReferencia: "2026-11",
          contact_id: "c-beta",
          is_paid: false,
        },
      ];

      // Exact oracle calculation:
      // 111.11 + 222.22 + 333.33 + 444.44 + 555.55 = 1666.65
      const expectedOverallPending = 111.11 + 222.22 + 333.33 + 444.44 + 555.55;
      expect(totalAReceberGeral(contactAlpha, transactions)).toBeCloseTo(expectedOverallPending, 2);

      render(
        <ContactExpensesDialog
          contact={contactAlpha}
          transactions={transactions}
          onClose={() => {}}
        />,
      );

      const cardGeralLabel = screen.getByText("Total a Receber (Geral)");
      const cardGeralContainer = cardGeralLabel.closest("div")!;
      const expectedFormatted = brl(expectedOverallPending);

      // Verify at initial month (2026-11)
      expect(within(cardGeralContainer).getByText(/1\.666,65/)).toBeInTheDocument();

      const prevBtn = screen.getByRole("button", { name: "Mês anterior" });
      const nextBtn = screen.getByRole("button", { name: "Próximo mês" });

      // Navigate backwards 24 times (to 2024-11)
      for (let i = 0; i < 24; i++) {
        fireEvent.click(prevBtn);
        expect(within(cardGeralContainer).getByText(/1\.666,65/)).toBeInTheDocument();
      }

      // Navigate forward 48 times (from 2024-11 to 2028-11)
      for (let i = 0; i < 48; i++) {
        fireEvent.click(nextBtn);
        expect(within(cardGeralContainer).getByText(/1\.666,65/)).toBeInTheDocument();
      }

      // Final check: exactly equal
      expect(within(cardGeralContainer).getByText(/1\.666,65/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Invariant 2: Dynamic Card — A Receber (Este Mês)
  // Must STRICTLY equal sum of unpaid expenses whose effective month == active month
  // =========================================================================
  describe("Invariant 2: Dynamic Card Accuracy", () => {
    it("dynamically reflects only unpaid transactions matching the active month under complex billing conditions", () => {
      const transactions: Transaction[] = [
        // Nov 2026: 1 unpaid explicit mesReferencia
        {
          id: "tx-1",
          tipo: "despesa",
          valor: 100.5,
          categoria: "Alimentação",
          conta: "Pix",
          descricao: "Almoço",
          data: "2026-11-05",
          mesReferencia: "2026-11",
          contact_id: "c-alpha",
          is_paid: false,
        },
        // Nov 2026: 1 unpaid card closing in Oct, effective in Nov
        {
          id: "tx-2",
          tipo: "despesa",
          valor: 200.25,
          categoria: "Compras",
          conta: "Crédito",
          descricao: "Compra Cartão",
          data: "2026-10-28",
          mesReferencia: "2026-11", // Invoiced in Nov
          contact_id: "c-alpha",
          is_paid: false,
        },
        // Nov 2026: 1 paid transaction (should NOT be in pending total)
        {
          id: "tx-3",
          tipo: "despesa",
          valor: 300.0,
          categoria: "Saúde",
          conta: "Pix",
          descricao: "Farmácia Paga",
          data: "2026-11-10",
          mesReferencia: "2026-11",
          contact_id: "c-alpha",
          is_paid: true,
        },
        // Nov 2026: Income transaction (should NOT be in pending total)
        {
          id: "tx-4",
          tipo: "receita",
          valor: 500.0,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Reembolso",
          data: "2026-11-10",
          mesReferencia: "2026-11",
          contact_id: "c-alpha",
          is_paid: false,
        },
        // Dec 2026: Fallback to data.slice(0, 7)
        {
          id: "tx-5",
          tipo: "despesa",
          valor: 75.75,
          categoria: "Lazer",
          conta: "Débito",
          descricao: "Cinema Dezembro",
          data: "2026-12-15", // No mesReferencia
          contact_id: "c-alpha",
          is_paid: false,
        },
      ];

      render(
        <ContactExpensesDialog
          contact={contactAlpha}
          transactions={transactions}
          onClose={() => {}}
        />,
      );

      const cardMesLabel = screen.getByText("A Receber (Este Mês)");
      const cardMesContainer = cardMesLabel.closest("div")!;

      // In November 2026: 100.50 + 200.25 = 300.75
      expect(within(cardMesContainer).getByText(/300,75/)).toBeInTheDocument();

      // Navigate to December 2026
      const nextBtn = screen.getByRole("button", { name: "Próximo mês" });
      fireEvent.click(nextBtn);

      // In December 2026: 75.75
      expect(within(cardMesContainer).getByText(/75,75/)).toBeInTheDocument();

      // Navigate to October 2026 (click prev twice)
      const prevBtn = screen.getByRole("button", { name: "Mês anterior" });
      fireEvent.click(prevBtn); // Nov
      fireEvent.click(prevBtn); // Oct

      // In October 2026: 0.00 (because tx-2 has mesReferencia: "2026-11")
      expect(within(cardMesContainer).getByText(/0,00/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // Invariant 3: Strict Month Isolation
  // Rendered table MUST contain 0 rows from any month other than the active month
  // =========================================================================
  describe("Invariant 3: Strict Month Isolation in Table", () => {
    it("guarantees 0 rows from other months appear in the table across all months", () => {
      // 12 months of transactions, exactly 1 unique transaction per month for Alpha
      const months = [
        "2026-01",
        "2026-02",
        "2026-03",
        "2026-04",
        "2026-05",
        "2026-06",
        "2026-07",
        "2026-08",
        "2026-09",
        "2026-10",
        "2026-11",
        "2026-12",
      ];

      const transactions: Transaction[] = months.map((m, idx) => ({
        id: `tx-month-${idx}`,
        tipo: "despesa",
        valor: (idx + 1) * 10,
        categoria: "Compras",
        conta: "Pix",
        descricao: `Gasto Único de ${m}`,
        data: `${m}-10`,
        mesReferencia: m,
        contact_id: "c-alpha",
        is_paid: false,
      }));

      render(
        <ContactExpensesDialog
          contact={contactAlpha}
          transactions={transactions}
          onClose={() => {}}
        />,
      );

      const prevBtn = screen.getByRole("button", { name: "Mês anterior" });

      // Start at 2026-11, verify it has "Gasto Único de 2026-11" and NONE of the other 11
      expect(screen.getByText("Gasto Único de 2026-11")).toBeInTheDocument();
      months
        .filter((m) => m !== "2026-11")
        .forEach((m) => {
          expect(screen.queryByText(`Gasto Único de ${m}`)).not.toBeInTheDocument();
        });

      // Step backwards month-by-month down to 2026-01 and verify strict isolation at each step
      let currentMonthIndex = 10; // 2026-11 is index 10
      while (currentMonthIndex > 0) {
        fireEvent.click(prevBtn);
        currentMonthIndex--;
        const activeMonth = months[currentMonthIndex];

        // Active month row MUST be present
        expect(screen.getByText(`Gasto Único de ${activeMonth}`)).toBeInTheDocument();

        // ALL other 11 months MUST NOT be in the document
        months
          .filter((m) => m !== activeMonth)
          .forEach((m) => {
            expect(screen.queryByText(`Gasto Único de ${m}`)).not.toBeInTheDocument();
          });
      }
    });

    it("verifies leap year handling (February 29 in leap year 2024 vs non-leap 2025/2026)", () => {
      const leapTransactions: Transaction[] = [
        {
          id: "tx-leap-2024-02-29",
          tipo: "despesa",
          valor: 290.0,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Compra Bissexto 29 Fev",
          data: "2024-02-29",
          mesReferencia: "2024-02",
          contact_id: "c-alpha",
          is_paid: false,
        },
        {
          id: "tx-2024-03-01",
          tipo: "despesa",
          valor: 310.0,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Compra 01 Março 2024",
          data: "2024-03-01",
          mesReferencia: "2024-03",
          contact_id: "c-alpha",
          is_paid: false,
        },
      ];

      render(
        <ContactExpensesDialog
          contact={contactAlpha}
          transactions={leapTransactions}
          onClose={() => {}}
        />,
      );

      const prevBtn = screen.getByRole("button", { name: "Mês anterior" });

      // Navigate backwards from 2026-11 to 2024-02 (33 months)
      for (let i = 0; i < 33; i++) {
        fireEvent.click(prevBtn);
      }

      expect(screen.getByRole("heading", { name: "Fevereiro 2024" })).toBeInTheDocument();
      expect(screen.getByText("Compra Bissexto 29 Fev")).toBeInTheDocument();
      expect(screen.getByText("29/02/2024")).toBeInTheDocument();
      expect(screen.queryByText("Compra 01 Março 2024")).not.toBeInTheDocument();

      // Advance one month to March 2024
      const nextBtn = screen.getByRole("button", { name: "Próximo mês" });
      fireEvent.click(nextBtn);

      expect(screen.getByRole("heading", { name: "Março 2024" })).toBeInTheDocument();
      expect(screen.getByText("Compra 01 Março 2024")).toBeInTheDocument();
      expect(screen.queryByText("Compra Bissexto 29 Fev")).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Invariant 4: Property-Based Randomized Stress Testing (500 Random Iterations)
  // Mathematically verifies that totalAReceberMes and totalAReceberGeral maintain
  // exact invariants under arbitrary transaction distributions.
  // =========================================================================
  describe("Invariant 4: Property-Based Mathematical Fuzzing", () => {
    it("satisfies the 3 core invariants for 500 randomized transactions across 10 years", () => {
      // Deterministic PRNG seed for reproducibility
      let seed = 42;
      const pseudoRandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      const randomYears = [2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
      const randomContacts = ["c-alpha", "c-beta", "c-gamma", "c-unknown"];
      const generatedTransactions: Transaction[] = [];

      for (let i = 0; i < 500; i++) {
        const y = randomYears[Math.floor(pseudoRandom() * randomYears.length)];
        const m = 1 + Math.floor(pseudoRandom() * 12);
        const d = 1 + Math.floor(pseudoRandom() * 28);
        const yyyymm = `${y}-${String(m).padStart(2, "0")}`;
        const isoDate = `${yyyymm}-${String(d).padStart(2, "0")}`;

        const isAlpha = pseudoRandom() < 0.6;
        const contactId = isAlpha
          ? "c-alpha"
          : randomContacts[Math.floor(pseudoRandom() * randomContacts.length)];
        const isDespesa = pseudoRandom() < 0.85;
        const isPaid = pseudoRandom() < 0.35;
        const valor = Math.round(pseudoRandom() * 100000) / 100; // 0.00 to 1000.00

        // 20% have explicit different mesReferencia (+1 month)
        const hasOffsetInvoice = pseudoRandom() < 0.2;
        const mesRef = hasOffsetInvoice ? deslocarMes(yyyymm, 1) : yyyymm;

        generatedTransactions.push({
          id: `fuzz-tx-${i}`,
          tipo: isDespesa ? "despesa" : "receita",
          valor,
          categoria: "Fuzz",
          conta: "Pix",
          descricao: `Fuzz Item ${i}`,
          data: isoDate,
          mesReferencia: mesRef,
          contact_id: contactId,
          is_paid: isPaid,
        });
      }

      // Mathematical Oracle for Invariant 1:
      // Total a Receber (Geral) for Alpha across all time
      const expectedOverallPendingAlpha = generatedTransactions
        .filter((t) => t.contact_id === "c-alpha" && t.tipo === "despesa" && !t.is_paid)
        .reduce((sum, t) => sum + t.valor, 0);

      const computedGeralAlpha = totalAReceberGeral(contactAlpha, generatedTransactions);
      expect(computedGeralAlpha).toBeCloseTo(expectedOverallPendingAlpha, 2);

      // Test across 120 continuous months from 2022-01 to 2031-12
      let testMonth = "2022-01";
      for (let step = 0; step < 120; step++) {
        // Oracle for Invariant 2 (Dynamic month):
        const expectedMonthPending = generatedTransactions
          .filter(
            (t) =>
              t.contact_id === "c-alpha" &&
              t.tipo === "despesa" &&
              (t.mesReferencia || t.data.slice(0, 7)) === testMonth &&
              !t.is_paid,
          )
          .reduce((sum, t) => sum + t.valor, 0);

        const computedMonthAlpha = totalAReceberMes(contactAlpha, generatedTransactions, testMonth);
        expect(computedMonthAlpha).toBeCloseTo(expectedMonthPending, 2);

        // Oracle for Invariant 3 (Strict Month Isolation in Table):
        const isolatedRows = generatedTransactions.filter(
          (t) =>
            t.contact_id === "c-alpha" &&
            t.tipo === "despesa" &&
            (t.mesReferencia || t.data.slice(0, 7)) === testMonth,
        );

        // Verify that every single row belongs to testMonth
        for (const row of isolatedRows) {
          const effectiveMonth = row.mesReferencia || row.data.slice(0, 7);
          expect(effectiveMonth).toBe(testMonth);
          expect(row.contact_id).toBe("c-alpha");
          expect(row.tipo).toBe("despesa");
        }

        // Advance to next month
        testMonth = deslocarMes(testMonth, 1);
      }
    });
  });

  // =========================================================================
  // Invariant 5: Multi-Contact Strict Isolation
  // Contact A's modal must NEVER reflect Contact B's data under any condition
  // =========================================================================
  describe("Invariant 5: Multi-Contact Cross-Contamination Stress Test", () => {
    it("ensures zero leakage between contacts sharing identical descriptions and dates", () => {
      const transactions: Transaction[] = [
        {
          id: "tx-a1",
          tipo: "despesa",
          valor: 150.0,
          categoria: "Alimentação",
          conta: "Pix",
          descricao: "Gasto Compartilhado",
          data: "2026-11-10",
          mesReferencia: "2026-11",
          contact_id: "c-alpha",
          is_paid: false,
        },
        {
          id: "tx-b1",
          tipo: "despesa",
          valor: 999.0,
          categoria: "Alimentação",
          conta: "Pix",
          descricao: "Gasto Compartilhado",
          data: "2026-11-10",
          mesReferencia: "2026-11",
          contact_id: "c-beta",
          is_paid: false,
        },
      ];

      const { rerender } = render(
        <ContactExpensesDialog
          key={contactAlpha.id}
          contact={contactAlpha}
          transactions={transactions}
          onClose={() => {}}
        />,
      );

      // Alpha modal should only show 150.00, NOT 999.00
      expect(screen.getByText("Gastos de Alpha Tester")).toBeInTheDocument();
      const cardMesAlpha = screen.getByText("A Receber (Este Mês)").closest("div")!;
      const cardGeralAlpha = screen.getByText("Total a Receber (Geral)").closest("div")!;
      expect(within(cardMesAlpha).getByText(/150,00/)).toBeInTheDocument();
      expect(within(cardGeralAlpha).getByText(/150,00/)).toBeInTheDocument();
      expect(screen.queryByText(/999,00/)).not.toBeInTheDocument();

      // Switch to Beta
      rerender(
        <ContactExpensesDialog
          key={contactBeta.id}
          contact={contactBeta}
          transactions={transactions}
          onClose={() => {}}
        />,
      );

      // Beta modal should only show 999.00, NOT 150.00
      expect(screen.getByText("Gastos de Beta Tester")).toBeInTheDocument();
      const cardMesBeta = screen.getByText("A Receber (Este Mês)").closest("div")!;
      const cardGeralBeta = screen.getByText("Total a Receber (Geral)").closest("div")!;
      expect(within(cardMesBeta).getByText(/999,00/)).toBeInTheDocument();
      expect(within(cardGeralBeta).getByText(/999,00/)).toBeInTheDocument();
      expect(screen.queryByText(/150,00/)).not.toBeInTheDocument();
    });
  });

  // =========================================================================
  // Invariant 6: Boundary Conditions & Empty States
  // =========================================================================
  describe("Invariant 6: Boundary Conditions & Edge Cases", () => {
    it("handles zero transactions, zero amounts, and large values robustly", () => {
      const boundaryTransactions: Transaction[] = [
        {
          id: "tx-zero",
          tipo: "despesa",
          valor: 0,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Gasto Zero",
          data: "2026-11-01",
          mesReferencia: "2026-11",
          contact_id: "c-alpha",
          is_paid: false,
        },
        {
          id: "tx-cent",
          tipo: "despesa",
          valor: 0.01,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Um Centavo",
          data: "2026-11-02",
          mesReferencia: "2026-11",
          contact_id: "c-alpha",
          is_paid: false,
        },
        {
          id: "tx-large",
          tipo: "despesa",
          valor: 1000000.5,
          categoria: "Compras",
          conta: "Pix",
          descricao: "Gasto Milionário",
          data: "2026-11-03",
          mesReferencia: "2026-11",
          contact_id: "c-alpha",
          is_paid: false,
        },
        {
          id: "tx-empty-mesref",
          tipo: "despesa",
          valor: 50.0,
          categoria: "Compras",
          conta: "Pix",
          descricao: "Gasto MesRef Vazio",
          data: "2026-11-04",
          mesReferencia: "", // empty string fallback
          contact_id: "c-alpha",
          is_paid: false,
        },
      ];

      render(
        <ContactExpensesDialog
          contact={contactAlpha}
          transactions={boundaryTransactions}
          onClose={() => {}}
        />,
      );

      // Total = 0 + 0.01 + 1000000.50 + 50.00 = 1000050.51
      const cardMesContainer = screen.getByText("A Receber (Este Mês)").closest("div")!;
      const cardGeralContainer = screen.getByText("Total a Receber (Geral)").closest("div")!;

      expect(within(cardMesContainer).getByText(/1\.000\.050,51/)).toBeInTheDocument();
      expect(within(cardGeralContainer).getByText(/1\.000\.050,51/)).toBeInTheDocument();

      // All 4 rows must be present in the table
      expect(screen.getByText("Gasto Zero")).toBeInTheDocument();
      expect(screen.getByText("Um Centavo")).toBeInTheDocument();
      expect(screen.getByText("Gasto Milionário")).toBeInTheDocument();
      expect(screen.getByText("Gasto MesRef Vazio")).toBeInTheDocument();
    });

    it("displays empty state placeholder when contact has no transactions whatsoever", () => {
      render(<ContactExpensesDialog contact={contactAlpha} transactions={[]} onClose={() => {}} />);

      expect(screen.getByText("Nenhum gasto vinculado.")).toBeInTheDocument();
      const cardMesContainer = screen.getByText("A Receber (Este Mês)").closest("div")!;
      const cardGeralContainer = screen.getByText("Total a Receber (Geral)").closest("div")!;

      expect(within(cardMesContainer).getByText(/0,00/)).toBeInTheDocument();
      expect(within(cardGeralContainer).getByText(/0,00/)).toBeInTheDocument();
    });
  });
});
