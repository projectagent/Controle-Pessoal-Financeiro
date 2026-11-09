import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { Route as DashboardRoute } from "@/routes/dashboard";
import { Route as ExtratoRoute } from "@/routes/extrato";
import { Route as CartoesRoute } from "@/routes/cartoes";
import { Route as ContasRoute } from "@/routes/contas";
import { Route as TerceirosRoute } from "@/routes/terceiros";
import { api, type DashboardSummaryResponse } from "@/lib/api";
import {
  addTransaction,
  upsertTransactionAccount,
  upsertCard,
  zerarAplicativo,
  type Transaction,
} from "@/lib/finance";

// Mock Recharts ResponsiveContainer to prevent jsdom dimension issues
vi.mock("recharts", async () => {
  const original = await vi.importActual<Record<string, any>>("recharts");
  return {
    ...original,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 400, height: 400 }}>{children}</div>
    ),
  };
});

// Helper to normalize non-breaking spaces across environments
const norm = (str: string | null | undefined) => (str || "").replace(/\u00a0/g, " ");

// Helper to extract the main consolidated amount from a summary card
const getMainAmount = (card: HTMLElement) => {
  const p = card.querySelector("p.font-display");
  return norm(p?.textContent);
};

describe("Challenger 2 — Adversarial Verification of Dashboard Despesas Card Detailing", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));

    localStorage.clear();
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};

    vi.spyOn(api, "resetDatabase").mockResolvedValue({ success: true, message: "ok" });
    await zerarAplicativo();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Adversarial State: Zero Expenses
  // =========================================================================
  describe("1. Zero Expenses State (total_cartao = 0, total_debito = 0, total = 0)", () => {
    it("renders zero values correctly under SQL synced mode without NaN or visual glitch", async () => {
      const mockZeroSummary: DashboardSummaryResponse = {
        month: "2026-11",
        current_balance: 0,
        total_income_all_time: 0,
        total_expenses_all_time: 0,
        total_cartao: 0,
        total_debito_contas: 0,
        monthly: {
          personal_expenses: 0,
          total_cartao: 0,
          total_debito_contas: 0,
          third_party_pending: 0,
          third_party_total: 0,
          total_expenses: 0,
          total_income: 0,
          balance: 0,
        },
        categories: [],
        history: [],
      };

      vi.spyOn(api, "getDashboardSummary").mockResolvedValue(mockZeroSummary);

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      await waitFor(() => {
        expect(screen.getByText("Despesas do Mês")).toBeInTheDocument();
      });

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

      // Main consolidated amount is R$ 0,00
      expect(getMainAmount(card)).toBe("R$ 0,00");

      // Breakdown line exists and displays R$ 0,00 for both credit and debit
      const detalhes = within(card).getByTestId("despesas-detalhes");
      expect(detalhes).toBeInTheDocument();
      const text = norm(detalhes.textContent);
      expect(text).toBe("R$ 0,00 no Crédito | R$ 0,00 no Débito/Pix");

      // Invariant holds
      expect(mockZeroSummary.monthly.total_cartao! + mockZeroSummary.monthly.total_debito_contas!).toBe(
        mockZeroSummary.monthly.personal_expenses
      );
    });

    it("renders zero values correctly under offline client fallback mode", async () => {
      vi.spyOn(api, "getDashboardSummary").mockRejectedValue(new Error("Network Down"));

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      await waitFor(() => {
        expect(screen.getByText("Despesas do Mês")).toBeInTheDocument();
      });

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

      expect(getMainAmount(card)).toBe("R$ 0,00");

      const detalhes = within(card).getByTestId("despesas-detalhes");
      expect(detalhes).toBeInTheDocument();
      const text = norm(detalhes.textContent);
      expect(text).toBe("R$ 0,00 no Crédito | R$ 0,00 no Débito/Pix");
    });
  });

  // =========================================================================
  // 2. Adversarial State: Pure Credit Card Expenses (Zero Debit)
  // =========================================================================
  describe("2. Pure Credit Card Expenses (total_debito_contas = 0)", () => {
    it("renders credit card total and 0,00 for debit in SQL synced mode", async () => {
      const mockSummary: DashboardSummaryResponse = {
        month: "2026-11",
        current_balance: 10000,
        total_income_all_time: 20000,
        total_expenses_all_time: 3450.99,
        total_cartao: 3450.99,
        total_debito_contas: 0,
        monthly: {
          personal_expenses: 3450.99,
          total_cartao: 3450.99,
          total_debito_contas: 0,
          third_party_pending: 0,
          third_party_total: 0,
          total_expenses: 3450.99,
          total_income: 5000,
          balance: 1549.01,
        },
        categories: [{ categoria: "Compras", total: 3450.99 }],
        history: [],
      };

      vi.spyOn(api, "getDashboardSummary").mockResolvedValue(mockSummary);

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

      await waitFor(() => {
        expect(getMainAmount(card)).toBe("R$ 3.450,99");
      });

      const detalhes = within(card).getByTestId("despesas-detalhes");
      const text = norm(detalhes.textContent);
      expect(text).toBe("R$ 3.450,99 no Crédito | R$ 0,00 no Débito/Pix");

      // Invariant
      expect(mockSummary.monthly.total_cartao! + mockSummary.monthly.total_debito_contas!).toBe(
        mockSummary.monthly.personal_expenses
      );
    });

    it("renders credit card total and 0,00 for debit in offline client fallback mode", async () => {
      vi.spyOn(api, "getDashboardSummary").mockRejectedValue(new Error("Network Down"));

      const cardAccId = upsertTransactionAccount("Nubank Black", "CREDIT_CARD")!;

      addTransaction({
        tipo: "despesa",
        valor: 1200.5,
        categoria: "Compras",
        conta: "Crédito",
        descricao: "Compra 1 no Cartão",
        data: "2026-11-04",
        account_id: cardAccId,
        expense_owner: "Próprio",
      });

      addTransaction({
        tipo: "despesa",
        valor: 799.49,
        categoria: "Eletrônicos",
        conta: "Crédito",
        descricao: "Compra 2 no Cartão",
        data: "2026-11-04",
        account_id: cardAccId,
        expense_owner: "Próprio",
      });

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

      // Total = 1200.50 + 799.49 = 1999.99
      await waitFor(() => {
        expect(getMainAmount(card)).toBe("R$ 1.999,99");
      });

      const detalhes = within(card).getByTestId("despesas-detalhes");
      const text = norm(detalhes.textContent);
      expect(text).toBe("R$ 1.999,99 no Crédito | R$ 0,00 no Débito/Pix");
    });
  });

  // =========================================================================
  // 3. Adversarial State: Pure Debit/Cash Expenses (Zero Credit Card)
  // =========================================================================
  describe("3. Pure Debit/Cash Expenses (total_cartao = 0)", () => {
    it("renders debit total and 0,00 for credit in SQL synced mode", async () => {
      const mockSummary: DashboardSummaryResponse = {
        month: "2026-11",
        current_balance: 5000,
        total_income_all_time: 15000,
        total_expenses_all_time: 2180.45,
        total_cartao: 0,
        total_debito_contas: 2180.45,
        monthly: {
          personal_expenses: 2180.45,
          total_cartao: 0,
          total_debito_contas: 2180.45,
          third_party_pending: 0,
          third_party_total: 0,
          total_expenses: 2180.45,
          total_income: 6000,
          balance: 3819.55,
        },
        categories: [{ categoria: "Moradia", total: 2180.45 }],
        history: [],
      };

      vi.spyOn(api, "getDashboardSummary").mockResolvedValue(mockSummary);

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

      await waitFor(() => {
        expect(getMainAmount(card)).toBe("R$ 2.180,45");
      });

      const detalhes = within(card).getByTestId("despesas-detalhes");
      const text = norm(detalhes.textContent);
      expect(text).toBe("R$ 0,00 no Crédito | R$ 2.180,45 no Débito/Pix");

      // Invariant
      expect(mockSummary.monthly.total_cartao! + mockSummary.monthly.total_debito_contas!).toBe(
        mockSummary.monthly.personal_expenses
      );
    });

    it("renders debit total and 0,00 for credit across checking, cash, and pix in offline fallback mode", async () => {
      vi.spyOn(api, "getDashboardSummary").mockRejectedValue(new Error("Network Down"));

      const bankAccId = upsertTransactionAccount("Banco Itaú", "CHECKING_ACCOUNT")!;

      // 1. Bank account checking expense
      addTransaction({
        tipo: "despesa",
        valor: 1100,
        categoria: "Moradia",
        conta: "Débito",
        descricao: "Aluguel",
        data: "2026-11-05",
        mesReferencia: "2026-11",
        account_id: bankAccId,
        expense_owner: "Próprio",
      });

      // 2. Pix expense (unlinked account_id)
      addTransaction({
        tipo: "despesa",
        valor: 350.25,
        categoria: "Serviços",
        conta: "Pix",
        descricao: "Internet Fibra",
        data: "2026-11-07",
        mesReferencia: "2026-11",
        account_id: null,
        expense_owner: "Próprio",
      });

      // 3. Cash expense (unlinked account_id)
      addTransaction({
        tipo: "despesa",
        valor: 80.2,
        categoria: "Alimentação",
        conta: "Dinheiro",
        descricao: "Padaria",
        data: "2026-11-08",
        mesReferencia: "2026-11",
        account_id: null,
        expense_owner: "Próprio",
      });

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

      // Total = 1100 + 350.25 + 80.20 = 1530.45
      await waitFor(() => {
        expect(getMainAmount(card)).toBe("R$ 1.530,45");
      });

      const detalhes = within(card).getByTestId("despesas-detalhes");
      const text = norm(detalhes.textContent);
      expect(text).toBe("R$ 0,00 no Crédito | R$ 1.530,45 no Débito/Pix");
    });
  });

  // =========================================================================
  // 4. Adversarial State: Multi-Vector Offline Fallback & Invariant Integrity
  // =========================================================================
  describe("4. Multi-Vector Offline Fallback, Exclusions, and Invariants", () => {
    it("empirically excludes third-party expenses, incomes, and cross-month transactions from personal breakdown", async () => {
      vi.spyOn(api, "getDashboardSummary").mockRejectedValue(new Error("Network Down"));

      const cardAccId = upsertTransactionAccount("Cartão Visa", "CREDIT_CARD")!;
      const bankAccId = upsertTransactionAccount("Conta Caixa", "CHECKING_ACCOUNT")!;

      // 1. Personal credit expense in 2026-11 (day 4, closing 5 => 2026-11)
      addTransaction({
        tipo: "despesa",
        valor: 500,
        categoria: "Compras",
        conta: "Crédito",
        descricao: "Tênis Pessoal",
        data: "2026-11-04",
        account_id: cardAccId,
        expense_owner: "Próprio",
      });

      // 2. Personal debit expense in 2026-11
      addTransaction({
        tipo: "despesa",
        valor: 250,
        categoria: "Alimentação",
        conta: "Débito",
        descricao: "Supermercado Pessoal",
        data: "2026-11-10",
        mesReferencia: "2026-11",
        account_id: bankAccId,
        expense_owner: "Próprio",
      });

      // 3. Third-party expense on credit card (MUST be excluded)
      addTransaction({
        tipo: "despesa",
        valor: 999,
        categoria: "Outros",
        conta: "Crédito",
        descricao: "Compra para Terceiro no Cartão",
        data: "2026-11-04",
        account_id: cardAccId,
        contact_id: "c-amigo",
        expense_owner: "Terceiros",
        is_paid: false,
      });

      // 4. Third-party expense on bank account (MUST be excluded)
      addTransaction({
        tipo: "despesa",
        valor: 400,
        categoria: "Outros",
        conta: "Pix",
        descricao: "Empréstimo Pix para Terceiro",
        data: "2026-11-10",
        mesReferencia: "2026-11",
        account_id: bankAccId,
        contact_id: "c-amigo",
        expense_owner: "Terceiros",
        is_paid: false,
      });

      // 5. Income transaction on checking account (MUST be excluded from expenses)
      addTransaction({
        tipo: "receita",
        valor: 4000,
        categoria: "Salário",
        conta: "Conta Corrente",
        descricao: "Salário Mensal",
        data: "2026-11-05",
        mesReferencia: "2026-11",
        account_id: bankAccId,
      });

      // 6. Income transaction on credit card (cashback/estorno) (MUST be excluded from expenses)
      addTransaction({
        tipo: "receita",
        valor: 50,
        categoria: "Estorno",
        conta: "Crédito",
        descricao: "Estorno Compra",
        data: "2026-11-04",
        account_id: cardAccId,
      });

      // 7. Personal credit expense in PRIOR month 2026-10 (MUST be excluded from 2026-11)
      addTransaction({
        tipo: "despesa",
        valor: 1500,
        categoria: "Viagem",
        conta: "Crédito",
        descricao: "Passagem Outubro",
        data: "2026-10-04",
        account_id: cardAccId,
        expense_owner: "Próprio",
      });

      // 8. Personal debit expense in NEXT month 2026-12 (MUST be excluded from 2026-11)
      addTransaction({
        tipo: "despesa",
        valor: 700,
        categoria: "Festas",
        conta: "Débito",
        descricao: "Ceia Natal Antecipada",
        data: "2026-12-05",
        mesReferencia: "2026-12",
        account_id: bankAccId,
        expense_owner: "Próprio",
      });

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

      // Only items 1 (500) and 2 (250) are valid November personal expenses = 750
      await waitFor(() => {
        expect(getMainAmount(card)).toBe("R$ 750,00");
      });

      const detalhes = within(card).getByTestId("despesas-detalhes");
      const text = norm(detalhes.textContent);
      expect(text).toBe("R$ 500,00 no Crédito | R$ 250,00 no Débito/Pix");
    });

    it("defensively falls back to client calculations when backend returns legacy summary without total_cartao/total_debito", async () => {
      // Simulate older server version where total_cartao is undefined
      const legacySummary = {
        month: "2026-11",
        current_balance: 5000,
        total_income_all_time: 10000,
        total_expenses_all_time: 5000,
        monthly: {
          personal_expenses: 600,
          third_party_pending: 0,
          third_party_total: 0,
          total_expenses: 600,
          total_income: 3000,
          balance: 2400,
        },
        categories: [],
        history: [],
      } as unknown as DashboardSummaryResponse;

      vi.spyOn(api, "getDashboardSummary").mockResolvedValue(legacySummary);

      const cardAccId = upsertTransactionAccount("Cartão Antigo", "CREDIT_CARD")!;
      addTransaction({
        tipo: "despesa",
        valor: 400,
        categoria: "Compras",
        conta: "Crédito",
        descricao: "Compra Cartão",
        data: "2026-11-04",
        account_id: cardAccId,
        expense_owner: "Próprio",
      });

      addTransaction({
        tipo: "despesa",
        valor: 200,
        categoria: "Moradia",
        conta: "Débito",
        descricao: "Conta de Luz",
        data: "2026-11-06",
        mesReferencia: "2026-11",
        account_id: null,
        expense_owner: "Próprio",
      });

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

      // Main amount comes from sqlSummary.monthly.personal_expenses (600)
      await waitFor(() => {
        expect(getMainAmount(card)).toBe("R$ 600,00");
      });

      // Detalhes should fall back gracefully without displaying NaN
      const detalhes = within(card).getByTestId("despesas-detalhes");
      const text = norm(detalhes.textContent);
      expect(text).not.toContain("NaN");
      expect(text).toBe("R$ 400,00 no Crédito | R$ 200,00 no Débito/Pix");
    });
  });

  // =========================================================================
  // 5. Adversarial State: Rapid Multi-Month Switching Reactivity
  // =========================================================================
  describe("5. Month Switching Reactivity Across Multiple Transitions", () => {
    it("synchronously updates card totals and breakdown through a 5-step month navigation path", async () => {
      const summaries: Record<string, DashboardSummaryResponse> = {
        "2026-09": {
          month: "2026-09",
          current_balance: 1000,
          total_income_all_time: 1000,
          total_expenses_all_time: 1000,
          total_cartao: 100,
          total_debito_contas: 150,
          monthly: {
            personal_expenses: 250,
            total_cartao: 100,
            total_debito_contas: 150,
            third_party_pending: 0,
            third_party_total: 0,
            total_expenses: 250,
            total_income: 1000,
            balance: 750,
          },
          categories: [],
          history: [],
        },
        "2026-10": {
          month: "2026-10",
          current_balance: 2000,
          total_income_all_time: 2000,
          total_expenses_all_time: 2000,
          total_cartao: 500,
          total_debito_contas: 300,
          monthly: {
            personal_expenses: 800,
            total_cartao: 500,
            total_debito_contas: 300,
            third_party_pending: 0,
            third_party_total: 0,
            total_expenses: 800,
            total_income: 2000,
            balance: 1200,
          },
          categories: [],
          history: [],
        },
        "2026-11": {
          month: "2026-11",
          current_balance: 3000,
          total_income_all_time: 3000,
          total_expenses_all_time: 3000,
          total_cartao: 1200,
          total_debito_contas: 800,
          monthly: {
            personal_expenses: 2000,
            total_cartao: 1200,
            total_debito_contas: 800,
            third_party_pending: 0,
            third_party_total: 0,
            total_expenses: 2000,
            total_income: 3000,
            balance: 1000,
          },
          categories: [],
          history: [],
        },
        "2026-12": {
          month: "2026-12",
          current_balance: 4000,
          total_income_all_time: 4000,
          total_expenses_all_time: 4000,
          total_cartao: 2500,
          total_debito_contas: 1500,
          monthly: {
            personal_expenses: 4000,
            total_cartao: 2500,
            total_debito_contas: 1500,
            third_party_pending: 0,
            third_party_total: 0,
            total_expenses: 4000,
            total_income: 4000,
            balance: 0,
          },
          categories: [],
          history: [],
        },
        "2027-01": {
          month: "2027-01",
          current_balance: 5000,
          total_income_all_time: 5000,
          total_expenses_all_time: 5000,
          total_cartao: 300,
          total_debito_contas: 200,
          monthly: {
            personal_expenses: 500,
            total_cartao: 300,
            total_debito_contas: 200,
            third_party_pending: 0,
            third_party_total: 0,
            total_expenses: 500,
            total_income: 5000,
            balance: 4500,
          },
          categories: [],
          history: [],
        },
      };

      vi.spyOn(api, "getDashboardSummary").mockImplementation(async (m) => summaries[m] || summaries["2026-11"]);

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;
      const prevBtn = screen.getByRole("button", { name: "Mês anterior" });
      const nextBtn = screen.getByRole("button", { name: "Próximo mês" });

      // Step 0: Start at 2026-11
      await waitFor(() => {
        expect(screen.getByText("Novembro 2026")).toBeInTheDocument();
        expect(getMainAmount(card)).toBe("R$ 2.000,00");
      });
      let text = norm(within(card).getByTestId("despesas-detalhes").textContent);
      expect(text).toBe("R$ 1.200,00 no Crédito | R$ 800,00 no Débito/Pix");

      // Step 1: Navigate to 2026-12
      await act(async () => {
        fireEvent.click(nextBtn);
      });
      await waitFor(() => {
        expect(screen.getByText("Dezembro 2026")).toBeInTheDocument();
        expect(getMainAmount(card)).toBe("R$ 4.000,00");
      });
      text = norm(within(card).getByTestId("despesas-detalhes").textContent);
      expect(text).toBe("R$ 2.500,00 no Crédito | R$ 1.500,00 no Débito/Pix");

      // Step 2: Navigate across year boundary to 2027-01
      await act(async () => {
        fireEvent.click(nextBtn);
      });
      await waitFor(() => {
        expect(screen.getByText("Janeiro 2027")).toBeInTheDocument();
        expect(getMainAmount(card)).toBe("R$ 500,00");
      });
      text = norm(within(card).getByTestId("despesas-detalhes").textContent);
      expect(text).toBe("R$ 300,00 no Crédito | R$ 200,00 no Débito/Pix");

      // Step 3: Navigate back to 2026-12
      await act(async () => {
        fireEvent.click(prevBtn);
      });
      await waitFor(() => {
        expect(screen.getByText("Dezembro 2026")).toBeInTheDocument();
        expect(getMainAmount(card)).toBe("R$ 4.000,00");
      });
      text = norm(within(card).getByTestId("despesas-detalhes").textContent);
      expect(text).toBe("R$ 2.500,00 no Crédito | R$ 1.500,00 no Débito/Pix");

      // Step 4: Navigate back to 2026-11
      await act(async () => {
        fireEvent.click(prevBtn);
      });
      await waitFor(() => {
        expect(screen.getByText("Novembro 2026")).toBeInTheDocument();
        expect(getMainAmount(card)).toBe("R$ 2.000,00");
      });
      text = norm(within(card).getByTestId("despesas-detalhes").textContent);
      expect(text).toBe("R$ 1.200,00 no Crédito | R$ 800,00 no Débito/Pix");

      // Step 5: Navigate back to 2026-10
      await act(async () => {
        fireEvent.click(prevBtn);
      });
      await waitFor(() => {
        expect(screen.getByText("Outubro 2026")).toBeInTheDocument();
        expect(getMainAmount(card)).toBe("R$ 800,00");
      });
      text = norm(within(card).getByTestId("despesas-detalhes").textContent);
      expect(text).toBe("R$ 500,00 no Crédito | R$ 300,00 no Débito/Pix");
    });
  });

  // =========================================================================
  // 6. Adversarial State: Strict Route Isolation & Zero Leakage
  // =========================================================================
  describe("6. Strict Route Isolation & Element Leak Prevention", () => {
    it("ensures /extrato contains ZERO instances of despesas-detalhes and no credit/debit breakdown string", async () => {
      const ExtratoComponent = ExtratoRoute.options.component!;
      const { container } = render(<ExtratoComponent />);

      expect(screen.queryByTestId("despesas-detalhes")).toBeNull();
      expect(container.textContent).not.toContain("no Crédito | ");
      expect(container.textContent).not.toContain("no Débito/Pix");
    });

    it("ensures /cartoes contains ZERO instances of despesas-detalhes and no credit/debit breakdown string", async () => {
      const CartoesComponent = CartoesRoute.options.component!;
      const { container } = render(<CartoesComponent />);

      expect(screen.queryByTestId("despesas-detalhes")).toBeNull();
      expect(container.textContent).not.toContain("no Crédito | ");
      expect(container.textContent).not.toContain("no Débito/Pix");
    });

    it("ensures /contas contains ZERO instances of despesas-detalhes and no credit/debit breakdown string", async () => {
      const ContasComponent = ContasRoute.options.component!;
      const { container } = render(<ContasComponent />);

      expect(screen.queryByTestId("despesas-detalhes")).toBeNull();
      expect(container.textContent).not.toContain("no Crédito | ");
      expect(container.textContent).not.toContain("no Débito/Pix");
    });

    it("ensures /terceiros contains ZERO instances of despesas-detalhes and no credit/debit breakdown string", async () => {
      const TerceirosComponent = TerceirosRoute.options.component!;
      const { container } = render(<TerceirosComponent />);

      expect(screen.queryByTestId("despesas-detalhes")).toBeNull();
      expect(container.textContent).not.toContain("no Crédito | ");
      expect(container.textContent).not.toContain("no Débito/Pix");
    });

    it("ensures in Dashboard that despesas-detalhes is confined strictly to the Despesas do Mês card", async () => {
      vi.spyOn(api, "getDashboardSummary").mockResolvedValue({
        month: "2026-11",
        current_balance: 1000,
        total_income_all_time: 2000,
        total_expenses_all_time: 500,
        total_cartao: 300,
        total_debito_contas: 200,
        monthly: {
          personal_expenses: 500,
          total_cartao: 300,
          total_debito_contas: 200,
          third_party_pending: 100,
          third_party_total: 100,
          total_expenses: 600,
          total_income: 2000,
          balance: 1400,
        },
        categories: [],
        history: [],
      });

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      await waitFor(() => {
        expect(screen.getByText("Despesas do Mês")).toBeInTheDocument();
      });

      // Total count across the DOM is exactly 1
      const allDetalhes = screen.getAllByTestId("despesas-detalhes");
      expect(allDetalhes).toHaveLength(1);

      // Verify other 3 summary cards do NOT contain despesas-detalhes
      const saldoCard = screen.getByText("Saldo Atual").closest("div.rounded-xl")!;
      expect(within(saldoCard).queryByTestId("despesas-detalhes")).toBeNull();

      const receitasCard = screen.getByText("Receitas do Mês").closest("div.rounded-xl")!;
      expect(within(receitasCard).queryByTestId("despesas-detalhes")).toBeNull();

      const terceirosCard = screen.getByText("Repasse de Terceiros (Mês)").closest("div.rounded-xl")!;
      expect(within(terceirosCard).queryByTestId("despesas-detalhes")).toBeNull();
    });
  });

  // =========================================================================
  // 7. Adversarial State: Decimal Precision and Boundary Invariants
  // =========================================================================
  describe("7. Decimal Precision and Mathematical Invariant", () => {
    it("maintains exact sum equality with fractional cents (e.g. 19.99 and 0.01)", async () => {
      const mockSummary: DashboardSummaryResponse = {
        month: "2026-11",
        current_balance: 1000,
        total_income_all_time: 2000,
        total_expenses_all_time: 20,
        total_cartao: 19.99,
        total_debito_contas: 0.01,
        monthly: {
          personal_expenses: 20,
          total_cartao: 19.99,
          total_debito_contas: 0.01,
          third_party_pending: 0,
          third_party_total: 0,
          total_expenses: 20,
          total_income: 1000,
          balance: 980,
        },
        categories: [],
        history: [],
      };

      vi.spyOn(api, "getDashboardSummary").mockResolvedValue(mockSummary);

      const DashboardComponent = DashboardRoute.options.component!;
      render(<DashboardComponent />);

      const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

      await waitFor(() => {
        expect(getMainAmount(card)).toBe("R$ 20,00");
      });

      const detalhes = within(card).getByTestId("despesas-detalhes");
      const text = norm(detalhes.textContent);
      expect(text).toBe("R$ 19,99 no Crédito | R$ 0,01 no Débito/Pix");

      const sum = mockSummary.monthly.total_cartao! + mockSummary.monthly.total_debito_contas!;
      expect(Math.abs(sum - mockSummary.monthly.personal_expenses)).toBeLessThan(1e-9);
    });
  });
});
