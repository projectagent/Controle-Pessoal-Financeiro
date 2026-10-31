import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import {
  addTransaction,
  computeTransactionMesReferencia,
  totalAReceberMes,
  upsertCard,
  upsertTransactionAccount,
  loadTransactionAccounts,
  loadCards,
  type Transaction,
  type Contact,
} from "@/lib/finance";
import { Route as ExtratoRoute } from "@/routes/extrato";

describe("Challenger It2_2 Empirical Adversarial Stress Test Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};
  });

  // =========================================================================
  // 1. Credit Card mesReferencia Override & Split-Brain Prevention
  // =========================================================================
  describe("Objective 1: Credit Card mesReferencia Enforcement & Override", () => {
    it("empirically overrides explicit mesReferencia ('2026-10') to '2026-11' for post-closing purchase ('2026-10-25', closing 5)", () => {
      upsertCard({ id: "card-closing-5", nome: "Cartão Fechamento 5", limite: 2000, fechamento: 5, vencimento: 15 });
      upsertTransactionAccount("Cartão Fechamento 5", "CREDIT_CARD");

      // Malicious or manual caller attempts to pass mesReferencia: "2026-10"
      addTransaction({
        tipo: "despesa",
        valor: 250.75,
        categoria: "Compras",
        conta: "Crédito",
        descricao: "Tentativa de Forçar Mês Antigo",
        data: "2026-10-25",
        mesReferencia: "2026-10",
        account_id: "card-closing-5",
      });

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Tentativa de Forçar Mês Antigo");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2026-11");
      expect(saved?.mesReferencia).not.toBe("2026-10");
    });

    it("empirically overrides explicit mesReferencia on the exact closing day (d == closingDay)", () => {
      upsertCard({ id: "card-closing-10", nome: "Cartão Fechamento 10", limite: 3000, fechamento: 10, vencimento: 20 });
      upsertTransactionAccount("Cartão Fechamento 10", "CREDIT_CARD");

      addTransaction({
        tipo: "despesa",
        valor: 99.9,
        categoria: "Alimentação",
        conta: "Crédito",
        descricao: "Compra no Exato Dia de Fechamento",
        data: "2026-10-10",
        mesReferencia: "2026-10",
        account_id: "card-closing-10",
      });

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Compra no Exato Dia de Fechamento");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2026-11");
    });

    it("empirically advances December purchases post-closing to January of next year despite explicit mesReferencia", () => {
      upsertCard({ id: "card-closing-5", nome: "Cartão Fechamento 5", limite: 2000, fechamento: 5, vencimento: 15 });
      upsertTransactionAccount("Cartão Fechamento 5", "CREDIT_CARD");

      addTransaction({
        tipo: "despesa",
        valor: 1200,
        categoria: "Lazer",
        conta: "Crédito",
        descricao: "Ceia de Fim de Ano Forçada",
        data: "2026-12-28",
        mesReferencia: "2026-12",
        account_id: "card-closing-5",
      });

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Ceia de Fim de Ano Forçada");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2027-01");
    });

    it("enforces invoice rule before closing day (d < closingDay) ignoring caller's future mesReferencia", () => {
      upsertCard({ id: "card-closing-10", nome: "Cartão Fechamento 10", limite: 3000, fechamento: 10, vencimento: 20 });
      upsertTransactionAccount("Cartão Fechamento 10", "CREDIT_CARD");

      addTransaction({
        tipo: "despesa",
        valor: 45.0,
        categoria: "Transporte",
        conta: "Crédito",
        descricao: "Gasolina Antes do Fechamento",
        data: "2026-10-09",
        mesReferencia: "2026-12", // Caller tries to push it to December
        account_id: "card-closing-10",
      });

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Gasolina Antes do Fechamento");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2026-10");
    });

    it("advances mesReferencia across all installments when purchasing post-closing in installments", () => {
      upsertCard({ id: "card-closing-5", nome: "Cartão Fechamento 5", limite: 5000, fechamento: 5, vencimento: 15 });
      upsertTransactionAccount("Cartão Fechamento 5", "CREDIT_CARD");

      addTransaction(
        {
          tipo: "despesa",
          valor: 100,
          categoria: "Compras",
          conta: "Crédito",
          descricao: "Smartphone Parcelado",
          data: "2026-10-25",
          mesReferencia: "2026-10", // Adversarial explicit param
          account_id: "card-closing-5",
        },
        3
      );

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const installments = txs
        .filter((t) => t.descricao === "Smartphone Parcelado")
        .sort((a, b) => (a.parcela ?? 0) - (b.parcela ?? 0));

      expect(installments).toHaveLength(3);
      expect(installments[0].mesReferencia).toBe("2026-11");
      expect(installments[1].mesReferencia).toBe("2026-12");
      expect(installments[2].mesReferencia).toBe("2027-01");
    });

    it("correctly identifies credit card from cartao property and overrides explicit mesReferencia", () => {
      upsertCard({ id: "card-custom", nome: "Cartão Personalizado", limite: 4000, fechamento: 8, vencimento: 18 });

      addTransaction({
        tipo: "despesa",
        valor: 80,
        categoria: "Saúde",
        conta: "Crédito",
        cartao: "card-custom",
        descricao: "Remédio Cartão Específico",
        data: "2026-05-15",
        mesReferencia: "2026-05", // Adversarial explicit param
      });

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Remédio Cartão Específico");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2026-06");
    });
  });

  // =========================================================================
  // 2. Checking Account & Non-Card Transactions Preserve Explicit mesReferencia
  // =========================================================================
  describe("Objective 2: Checking Account & Non-Card mesReferencia Preservation", () => {
    it("empirically preserves explicit mesReferencia for CHECKING_ACCOUNT transactions", () => {
      upsertTransactionAccount("Conta Bancária Principal", "CHECKING_ACCOUNT");
      const account = loadTransactionAccounts().find((a) => a.name === "Conta Bancária Principal")!;

      addTransaction({
        tipo: "despesa",
        valor: 1500,
        categoria: "Moradia",
        conta: "Débito",
        descricao: "Aluguel Mês Seguinte",
        data: "2026-10-25",
        mesReferencia: "2026-11", // Explicitly assigned to November budget
        account_id: account.id,
      });

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Aluguel Mês Seguinte");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2026-11");
    });

    it("empirically preserves backdated explicit mesReferencia for CHECKING_ACCOUNT", () => {
      upsertTransactionAccount("Conta Bancária Principal", "CHECKING_ACCOUNT");
      const account = loadTransactionAccounts().find((a) => a.name === "Conta Bancária Principal")!;

      addTransaction({
        tipo: "despesa",
        valor: 320,
        categoria: "Outros",
        conta: "Débito",
        descricao: "Conta de Luz Atrasada",
        data: "2026-10-25",
        mesReferencia: "2026-08", // Late payment assigned to August
        account_id: account.id,
      });

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Conta de Luz Atrasada");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2026-08");
    });

    it("defaults to transaction date month when mesReferencia is omitted for CHECKING_ACCOUNT", () => {
      upsertTransactionAccount("Conta Bancária Principal", "CHECKING_ACCOUNT");
      const account = loadTransactionAccounts().find((a) => a.name === "Conta Bancária Principal")!;

      addTransaction({
        tipo: "despesa",
        valor: 60,
        categoria: "Alimentação",
        conta: "Débito",
        descricao: "Padaria Débito Sem Mês Explícito",
        data: "2026-10-25",
        account_id: account.id,
      });

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Padaria Débito Sem Mês Explícito");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2026-10");
    });

    it("empirically preserves explicit mesReferencia for CASH and INVESTMENT accounts", () => {
      upsertTransactionAccount("Carteira Dinheiro", "CASH");
      const cashAcc = loadTransactionAccounts().find((a) => a.name === "Carteira Dinheiro")!;

      addTransaction({
        tipo: "despesa",
        valor: 50,
        categoria: "Lazer",
        conta: "Dinheiro",
        descricao: "Feira de Domingo Mês Futuro",
        data: "2026-10-25",
        mesReferencia: "2026-11",
        account_id: cashAcc.id,
      });

      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Feira de Domingo Mês Futuro");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2026-11");
    });
  });

  // =========================================================================
  // 3. Strict Filtering in totalAReceberMes
  // =========================================================================
  describe("Objective 3: totalAReceberMes Strict Isolation by mesReferencia", () => {
    const contactA: Contact = { id: "contact-alice", name: "Alice" };
    const contactB: Contact = { id: "contact-bob", name: "Bob" };

    it("strictly isolates receivables by mesReferencia with zero leakage from transaction creation date", () => {
      const mockTransactions: Transaction[] = [
        // Tx1: Created on Oct 25, but billed to Nov (Credit Card purchase post-closing) -> R$ 200
        {
          id: "t1",
          tipo: "despesa",
          valor: 200,
          categoria: "Compras",
          conta: "Crédito",
          descricao: "Compra Alice Outubro p/ Fatura Novembro",
          data: "2026-10-25",
          mesReferencia: "2026-11",
          contact_id: contactA.id,
          expense_owner: "Terceiros",
          is_paid: false,
        },
        // Tx2: Created on Nov 5, but explicitly billed to Oct (Checking account late reimbursement) -> R$ 150
        {
          id: "t2",
          tipo: "despesa",
          valor: 150,
          categoria: "Outros",
          conta: "Débito",
          descricao: "Repasse Alice Novembro ref Outubro",
          data: "2026-11-05",
          mesReferencia: "2026-10",
          contact_id: contactA.id,
          expense_owner: "Terceiros",
          is_paid: false,
        },
        // Tx3: October transaction, but already PAID -> R$ 300 (must be excluded)
        {
          id: "t3",
          tipo: "despesa",
          valor: 300,
          categoria: "Alimentação",
          conta: "Débito",
          descricao: "Almoço Alice Pago",
          data: "2026-10-10",
          mesReferencia: "2026-10",
          contact_id: contactA.id,
          expense_owner: "Terceiros",
          is_paid: true,
        },
        // Tx4: October income -> R$ 500 (must be excluded, not a despesa)
        {
          id: "t4",
          tipo: "receita",
          valor: 500,
          categoria: "Salário",
          conta: "Pix",
          descricao: "Entrada Alice",
          data: "2026-10-15",
          mesReferencia: "2026-10",
          contact_id: contactA.id,
          expense_owner: "Terceiros",
          is_paid: false,
        },
        // Tx5: October transaction for Bob -> R$ 400 (must be excluded when querying Alice)
        {
          id: "t5",
          tipo: "despesa",
          valor: 400,
          categoria: "Compras",
          conta: "Débito",
          descricao: "Compra Bob Outubro",
          data: "2026-10-15",
          mesReferencia: "2026-10",
          contact_id: contactB.id,
          expense_owner: "Terceiros",
          is_paid: false,
        },
        // Tx6: Legacy transaction without mesReferencia, data in Oct -> R$ 50 (falls back to data.slice(0, 7))
        {
          id: "t6",
          tipo: "despesa",
          valor: 50,
          categoria: "Farmácia",
          conta: "Débito",
          descricao: "Remédio Alice Sem mesReferencia",
          data: "2026-10-02",
          contact_id: contactA.id,
          expense_owner: "Terceiros",
          is_paid: false,
        },
      ];

      // October evaluation:
      // Tx2 (150) + Tx6 (50) = 200
      // Tx1 is excluded because mesReferencia is 2026-11 despite data being 2026-10-25!
      const totalOutubro = totalAReceberMes(contactA, mockTransactions, "2026-10");
      expect(totalOutubro).toBe(200);

      // November evaluation:
      // Tx1 (200)
      // Tx2 is excluded because mesReferencia is 2026-10 despite data being 2026-11-05!
      const totalNovembro = totalAReceberMes(contactA, mockTransactions, "2026-11");
      expect(totalNovembro).toBe(200);

      // December evaluation:
      // Zero transactions
      const totalDezembro = totalAReceberMes(contactA, mockTransactions, "2026-12");
      expect(totalDezembro).toBe(0);

      // Multi-contact list evaluation:
      // In October, Alice has 200, Bob has 400 -> total 600
      const totalAmbosOutubro = totalAReceberMes([contactA, contactB], mockTransactions, "2026-10");
      expect(totalAmbosOutubro).toBe(600);
    });
  });

  // =========================================================================
  // 4. ManualTransactionDialog UI Component Interaction Verification
  // =========================================================================
  describe("Objective 4: ManualTransactionDialog UI Behavior", () => {
    it("renders Extrato and verifies credit card disables month picker with closing day badge", async () => {
      // Setup card and checking account
      upsertCard({ id: "card-ui-test", nome: "Cartão UI", limite: 5000, fechamento: 8, vencimento: 18 });
      upsertTransactionAccount("Cartão UI", "CREDIT_CARD");
      upsertTransactionAccount("Banco UI", "CHECKING_ACCOUNT");

      const ExtratoComponent = ExtratoRoute.options.component!;
      render(<ExtratoComponent />);

      // Open ManualTransactionDialog
      const novaTransacaoBtn = screen.getByRole("button", { name: /nova transação/i });
      fireEvent.click(novaTransacaoBtn);

      // Verify Dialog is open via dialog heading
      expect(screen.getByRole("heading", { name: "Nova transação" })).toBeInTheDocument();

      const mesInput = screen.getByLabelText("Mês de Referência") as HTMLInputElement;
      expect(mesInput).toBeInTheDocument();
      // Initially no account selected, input is not disabled
      expect(mesInput.disabled).toBe(false);

      // Select Credit Card via Radix Combobox inside dialog
      const combobox = document.getElementById("manual-account")!;
      expect(combobox).toBeInTheDocument();
      fireEvent.click(combobox);

      const cardOption = await screen.findByRole("option", { name: /cartão ui/i });
      fireEvent.click(cardOption);

      // After selecting credit card:
      await waitFor(() => {
        expect(mesInput.disabled).toBe(true);
        expect(screen.getByText("Fatura dia 8")).toBeInTheDocument();
      });

      // Change date to after closing day: 2026-10-15
      const dataInput = screen.getByLabelText("Data") as HTMLInputElement;
      fireEvent.change(dataInput, { target: { value: "2026-10-15" } });

      await waitFor(() => {
        expect(mesInput.value).toBe("2026-11");
        expect(screen.getByText(/compras a partir do dia 8 entram no mês seguinte \(2026-11\)/i)).toBeInTheDocument();
      });

      // Switch to Checking Account
      fireEvent.click(document.getElementById("manual-account")!);
      const bankOption = await screen.findByRole("option", { name: /banco ui/i });
      fireEvent.click(bankOption);

      await waitFor(() => {
        expect(mesInput.disabled).toBe(false);
        expect(screen.queryByText("Fatura dia 8")).not.toBeInTheDocument();
      });

      // Fill in and submit checking account transaction with custom mesReferencia
      const descInput = screen.getByLabelText("Descrição") as HTMLInputElement;
      fireEvent.change(descInput, { target: { value: "Pagamento UI Manual" } });

      const valorInput = screen.getByLabelText("Valor (R$)") as HTMLInputElement;
      fireEvent.change(valorInput, { target: { value: "350" } });

      fireEvent.change(mesInput, { target: { value: "2026-12" } });

      const salvarBtn = screen.getByRole("button", { name: /salvar transação/i });
      fireEvent.click(salvarBtn);

      // Verify that checking account transaction preserved the custom month "2026-12"
      const txs: Transaction[] = JSON.parse(localStorage.getItem("fin-transactions-v1") ?? "[]");
      const saved = txs.find((t) => t.descricao === "Pagamento UI Manual");

      expect(saved).toBeDefined();
      expect(saved?.mesReferencia).toBe("2026-12");
    });
  });
});
