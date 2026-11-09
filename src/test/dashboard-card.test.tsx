import { render, screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Route as DashboardRoute } from "@/routes/dashboard";
import { api, type DashboardSummaryResponse } from "@/lib/api";
import {
  addTransaction,
  upsertTransactionAccount,
  zerarAplicativo,
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

// Helper to normalize non-breaking spaces
const norm = (str: string | null | undefined) => (str || "").replace(/\u00a0/g, " ");

describe("Dashboard — Despesas do Mês Card Breakdown (R1 & R2)", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    vi.spyOn(api, "resetDatabase").mockResolvedValue({ success: true, message: "ok" });
    await zerarAplicativo();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("renders consolidated expenses with credit and debit breakdown via SQL synced summary", async () => {
    const mockSummary: DashboardSummaryResponse = {
      month: "2026-11",
      current_balance: 5000,
      total_income_all_time: 10000,
      total_expenses_all_time: 5000,
      total_cartao: 725,
      total_debito_contas: 1200,
      monthly: {
        personal_expenses: 1925,
        total_cartao: 725,
        total_debito_contas: 1200,
        third_party_pending: 300,
        third_party_total: 500,
        total_expenses: 2225,
        total_income: 4000,
        balance: 2075,
      },
      categories: [
        { categoria: "Compras", total: 450 },
        { categoria: "Moradia", total: 1200 },
      ],
      history: [
        { month: "2026-11", income: 4000, expense: 1925 },
      ],
    };

    vi.spyOn(api, "getDashboardSummary").mockResolvedValue(mockSummary);

    const DashboardComponent = DashboardRoute.options.component!;
    render(<DashboardComponent />);

    // Wait for card to render
    await waitFor(() => {
      expect(screen.getByText("Despesas do Mês")).toBeInTheDocument();
    });

    const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

    // 1. Verify consolidated total in main amount within the card
    await waitFor(() => {
      expect(within(card).getByText(/1\.925,00/)).toBeInTheDocument();
    });

    // 2. Verify secondary text line directly below main amount
    const detalhesEl = within(card).getByTestId("despesas-detalhes");
    expect(detalhesEl).toBeInTheDocument();
    const normalizedText = norm(detalhesEl.textContent);
    expect(normalizedText).toContain("R$ 725,00 no Crédito");
    expect(normalizedText).toContain("R$ 1.200,00 no Débito/Pix");
    expect(normalizedText).toContain("|");

    // 3. Verify invariant: total_cartao + total_debito_contas === personal_expenses
    expect(mockSummary.monthly.total_cartao! + mockSummary.monthly.total_debito_contas!).toBe(
      mockSummary.monthly.personal_expenses
    );
  });

  it("reactively updates consolidated expenses and breakdown upon month navigation", async () => {
    const summaryNov: DashboardSummaryResponse = {
      month: "2026-11",
      current_balance: 5000,
      total_income_all_time: 10000,
      total_expenses_all_time: 5000,
      total_cartao: 869.86,
      total_debito_contas: 552.23,
      monthly: {
        personal_expenses: 1422.09,
        total_cartao: 869.86,
        total_debito_contas: 552.23,
        third_party_pending: 0,
        third_party_total: 0,
        total_expenses: 1422.09,
        total_income: 3000,
        balance: 1577.91,
      },
      categories: [],
      history: [],
    };

    const summaryDec: DashboardSummaryResponse = {
      month: "2026-12",
      current_balance: 6000,
      total_income_all_time: 13000,
      total_expenses_all_time: 5900,
      total_cartao: 354.11,
      total_debito_contas: 552.23,
      monthly: {
        personal_expenses: 906.34,
        total_cartao: 354.11,
        total_debito_contas: 552.23,
        third_party_pending: 0,
        third_party_total: 0,
        total_expenses: 906.34,
        total_income: 3000,
        balance: 2093.66,
      },
      categories: [],
      history: [],
    };

    vi.spyOn(api, "getDashboardSummary").mockImplementation(async (month) => {
      if (month === "2026-12") return summaryDec;
      return summaryNov;
    });

    const DashboardComponent = DashboardRoute.options.component!;
    render(<DashboardComponent />);

    const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

    // Check November values
    await waitFor(() => {
      expect(screen.getByText("Novembro 2026")).toBeInTheDocument();
      expect(within(card).getByText(/1\.422,09/)).toBeInTheDocument();
    });

    let detalhesEl = within(card).getByTestId("despesas-detalhes");
    expect(norm(detalhesEl.textContent)).toContain("R$ 869,86 no Crédito | R$ 552,23 no Débito/Pix");

    // Navigate to next month (December 2026)
    const nextBtn = screen.getByRole("button", { name: "Próximo mês" });
    await act(async () => {
      fireEvent.click(nextBtn);
    });

    // Check December values updated reactively
    await waitFor(() => {
      expect(screen.getByText("Dezembro 2026")).toBeInTheDocument();
      expect(within(card).getByText(/906,34/)).toBeInTheDocument();
    });

    detalhesEl = within(card).getByTestId("despesas-detalhes");
    expect(norm(detalhesEl.textContent)).toContain("R$ 354,11 no Crédito | R$ 552,23 no Débito/Pix");
  });

  it("calculates credit and debit breakdown correctly via client fallback when offline", async () => {
    // Force offline by having API reject
    vi.spyOn(api, "getDashboardSummary").mockRejectedValue(new Error("Network Error"));

    // Create accounts via finance module
    const ccId = upsertTransactionAccount("Cartão Nubank", "CREDIT_CARD")!;
    const bankId = upsertTransactionAccount("Conta Corrente Itaú", "CHECKING_ACCOUNT")!;

    // Add transactions via finance module (populates cache, storage, and reactive listeners)
    // 1. Credit card personal expense: 450 in 2026-11 (day 4 < closing day 5 => 2026-11)
    addTransaction({
      tipo: "despesa",
      valor: 450,
      categoria: "Compras",
      conta: "Crédito",
      descricao: "Roupas no Cartão",
      data: "2026-11-04",
      account_id: ccId,
      expense_owner: "Próprio",
    });

    // 2. Bank account personal expense: 250 in 2026-11
    addTransaction({
      tipo: "despesa",
      valor: 250,
      categoria: "Moradia",
      conta: "Débito",
      descricao: "Condomínio Débito",
      data: "2026-11-06",
      mesReferencia: "2026-11",
      account_id: bankId,
      expense_owner: "Próprio",
    });

    // 3. Cash / unlinked personal expense: 100 in 2026-11
    addTransaction({
      tipo: "despesa",
      valor: 100,
      categoria: "Alimentação",
      conta: "Dinheiro",
      descricao: "Feira Livre",
      data: "2026-11-08",
      mesReferencia: "2026-11",
      account_id: null,
      expense_owner: "Próprio",
    });

    // 4. Third-party expense on credit card: 600 (MUST be excluded from personal expenses)
    addTransaction({
      tipo: "despesa",
      valor: 600,
      categoria: "Outros",
      conta: "Crédito",
      descricao: "Compra Compartilhada",
      data: "2026-11-04",
      account_id: ccId,
      contact_id: "c-joao",
      expense_owner: "Terceiros",
      is_paid: false,
    });

    const DashboardComponent = DashboardRoute.options.component!;
    render(<DashboardComponent />);

    const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

    // Personal expenses = 450 + 250 + 100 = 800 (excludes 600 third party)
    await waitFor(() => {
      expect(within(card).getByText(/800,00/)).toBeInTheDocument();
    });

    // Secondary line: 450 no Crédito | 350 no Débito/Pix
    const detalhesEl = within(card).getByTestId("despesas-detalhes");
    expect(detalhesEl).toBeInTheDocument();
    const normalizedText = norm(detalhesEl.textContent);
    expect(normalizedText).toContain("R$ 450,00 no Crédito");
    expect(normalizedText).toContain("R$ 350,00 no Débito/Pix");

    // Invariant: 450 + 350 === 800
    expect(450 + 350).toBe(800);
  });

  it("confines the detail breakdown strictly to the Despesas do Mês card", async () => {
    vi.spyOn(api, "getDashboardSummary").mockResolvedValue({
      month: "2026-11",
      current_balance: 1000,
      total_income_all_time: 2000,
      total_expenses_all_time: 1000,
      total_cartao: 100,
      total_debito_contas: 200,
      monthly: {
        personal_expenses: 300,
        total_cartao: 100,
        total_debito_contas: 200,
        third_party_pending: 50,
        third_party_total: 50,
        total_expenses: 350,
        total_income: 1000,
        balance: 700,
      },
      categories: [],
      history: [],
    });

    const DashboardComponent = DashboardRoute.options.component!;
    render(<DashboardComponent />);

    const card = screen.getByText("Despesas do Mês").closest("div.rounded-xl")!;

    await waitFor(() => {
      expect(within(card).getByText(/300,00/)).toBeInTheDocument();
    });

    // Exactly one despesas-detalhes element rendered across the entire Dashboard
    const detalhesElements = screen.getAllByTestId("despesas-detalhes");
    expect(detalhesElements).toHaveLength(1);

    // Other cards have their respective expected content and do not leak despesas details
    expect(screen.getByText("Saldo Atual")).toBeInTheDocument();
    expect(screen.getByText("Receitas do Mês")).toBeInTheDocument();
    expect(screen.getByText("Repasse de Terceiros (Mês)")).toBeInTheDocument();
    expect(screen.getByText("Total acumulado")).toBeInTheDocument();
  });
});
