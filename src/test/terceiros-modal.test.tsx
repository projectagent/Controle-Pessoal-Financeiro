import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import React from "react";
import { Route as TerceirosRoute, ContactExpensesDialog } from "@/routes/terceiros";
import { brl, type Contact, type Transaction } from "@/lib/finance";

describe("Terceiros — 'Ver gastos' Modal Refactor", () => {
  const contactCarlos: Contact = { id: "c-carlos", name: "Carlos Silva" };
  const contactAmanda: Contact = { id: "c-amanda", name: "Amanda Souza" };

  const sampleTransactions: Transaction[] = [
    // Carlos - Novembro 2026 (pendente)
    {
      id: "tx-nov-1",
      tipo: "despesa",
      valor: 150,
      categoria: "Alimentação",
      conta: "Pix",
      descricao: "Almoço Novembro Carlos",
      data: "2026-11-10",
      mesReferencia: "2026-11",
      contact_id: "c-carlos",
      expense_owner: "Terceiros",
      is_paid: false,
    },
    // Carlos - Novembro 2026 (compra cartão em Outubro faturada em Novembro, pendente)
    {
      id: "tx-nov-2",
      tipo: "despesa",
      valor: 300,
      categoria: "Compras",
      conta: "Crédito",
      descricao: "Presente Fatura Novembro",
      data: "2026-10-28",
      mesReferencia: "2026-11",
      contact_id: "c-carlos",
      expense_owner: "Terceiros",
      is_paid: false,
    },
    // Carlos - Novembro 2026 (já pago)
    {
      id: "tx-nov-pago",
      tipo: "despesa",
      valor: 50,
      categoria: "Transporte",
      conta: "Débito",
      descricao: "Uber Novembro Já Pago",
      data: "2026-11-05",
      mesReferencia: "2026-11",
      contact_id: "c-carlos",
      expense_owner: "Terceiros",
      is_paid: true,
    },
    // Carlos - Outubro 2026 (pendente com mesReferencia explícito)
    {
      id: "tx-out-1",
      tipo: "despesa",
      valor: 220,
      categoria: "Lazer",
      conta: "Pix",
      descricao: "Show Outubro Carlos",
      data: "2026-10-12",
      mesReferencia: "2026-10",
      contact_id: "c-carlos",
      expense_owner: "Terceiros",
      is_paid: false,
    },
    // Carlos - Outubro 2026 (pendente sem mesReferencia, fallback para data.slice(0, 7))
    {
      id: "tx-out-fallback",
      tipo: "despesa",
      valor: 100,
      categoria: "Outros",
      conta: "Pix",
      descricao: "Jantar Outubro Fallback Data",
      data: "2026-10-20",
      contact_id: "c-carlos",
      expense_owner: "Terceiros",
      is_paid: false,
    },
    // Carlos - Dezembro 2026 (pendente)
    {
      id: "tx-dez-1",
      tipo: "despesa",
      valor: 80,
      categoria: "Saúde",
      conta: "Débito",
      descricao: "Farmácia Dezembro Carlos",
      data: "2026-12-02",
      mesReferencia: "2026-12",
      contact_id: "c-carlos",
      expense_owner: "Terceiros",
      is_paid: false,
    },
    // Carlos - Receita (não deve aparecer na tabela de despesas)
    {
      id: "tx-receita",
      tipo: "receita",
      valor: 500,
      categoria: "Outros",
      conta: "Pix",
      descricao: "Transferência Recebida",
      data: "2026-11-15",
      mesReferencia: "2026-11",
      contact_id: "c-carlos",
      expense_owner: "Terceiros",
      is_paid: false,
    },
    // Amanda - Novembro 2026 (não deve aparecer quando visualizando Carlos)
    {
      id: "tx-amanda-1",
      tipo: "despesa",
      valor: 400,
      categoria: "Compras",
      conta: "Pix",
      descricao: "Celular Amanda Novembro",
      data: "2026-11-12",
      mesReferencia: "2026-11",
      contact_id: "c-amanda",
      expense_owner: "Terceiros",
      is_paid: false,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("fin-contacts-v1", JSON.stringify([contactCarlos, contactAmanda]));
    localStorage.setItem("fin-transactions-v1", JSON.stringify(sampleTransactions));

    // Pin system date to November 15, 2026
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
  // 1. Navegação de Meses e Cabeçalho Inicial
  // =========================================================================
  describe("1. Navegação de Meses no Modal", () => {
    it("abre o modal exibindo o controle de navegação com o mês atual formatado em pt-BR", async () => {
      const TerceirosComponent = TerceirosRoute.options.component!;
      await act(async () => {
        render(<TerceirosComponent />);
      });

      // Open Carlos' expenses modal
      const verGastosButtons = screen.getAllByRole("button", { name: /ver gastos/i });
      act(() => {
        fireEvent.click(verGastosButtons[0]);
      });

      // Check modal heading with contact name
      expect(
        screen.getByRole("heading", { name: `Gastos de ${contactCarlos.name}` }),
      ).toBeInTheDocument();

      // Check month navigation header: capitalized pt-BR month "Novembro 2026"
      const mesHeader = screen.getByRole("heading", { name: "Novembro 2026" });
      expect(mesHeader).toBeInTheDocument();

      // Check navigation buttons with aria-labels
      const prevButton = screen.getByRole("button", { name: "Mês anterior" });
      const nextButton = screen.getByRole("button", { name: "Próximo mês" });
      expect(prevButton).toBeInTheDocument();
      expect(nextButton).toBeInTheDocument();
    });

    it("navega para o mês anterior e próximo ao clicar nos botões de navegação", async () => {
      const TerceirosComponent = TerceirosRoute.options.component!;
      await act(async () => {
        render(<TerceirosComponent />);
      });

      const verGastosButtons = screen.getAllByRole("button", { name: /ver gastos/i });
      act(() => {
        fireEvent.click(verGastosButtons[0]);
      });

      expect(screen.getByRole("heading", { name: "Novembro 2026" })).toBeInTheDocument();

      // Click previous month (<)
      const prevButton = screen.getByRole("button", { name: "Mês anterior" });
      act(() => {
        fireEvent.click(prevButton);
      });

      expect(screen.getByRole("heading", { name: "Outubro 2026" })).toBeInTheDocument();
      expect(screen.queryByRole("heading", { name: "Novembro 2026" })).not.toBeInTheDocument();

      // Click previous month again to September
      act(() => {
        fireEvent.click(prevButton);
      });
      expect(screen.getByRole("heading", { name: "Setembro 2026" })).toBeInTheDocument();

      // Click next month (>) twice back to November
      const nextButton = screen.getByRole("button", { name: "Próximo mês" });
      act(() => {
        fireEvent.click(nextButton);
      });
      expect(screen.getByRole("heading", { name: "Outubro 2026" })).toBeInTheDocument();

      act(() => {
        fireEvent.click(nextButton);
      });
      expect(screen.getByRole("heading", { name: "Novembro 2026" })).toBeInTheDocument();

      // Advance to December
      act(() => {
        fireEvent.click(nextButton);
      });
      expect(screen.getByRole("heading", { name: "Dezembro 2026" })).toBeInTheDocument();
    });

    it("suporta transição de virada de ano (ex: Dezembro 2026 -> Janeiro 2027)", () => {
      render(
        <ContactExpensesDialog
          contact={contactCarlos}
          transactions={sampleTransactions}
          onClose={() => {}}
        />,
      );

      const nextButton = screen.getByRole("button", { name: "Próximo mês" });

      // Move from November 2026 to December 2026
      fireEvent.click(nextButton);
      expect(screen.getByRole("heading", { name: "Dezembro 2026" })).toBeInTheDocument();

      // Move from December 2026 to January 2027
      fireEvent.click(nextButton);
      expect(screen.getByRole("heading", { name: "Janeiro 2027" })).toBeInTheDocument();

      // Move backwards from January 2027 to December 2026
      const prevButton = screen.getByRole("button", { name: "Mês anterior" });
      fireEvent.click(prevButton);
      expect(screen.getByRole("heading", { name: "Dezembro 2026" })).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 2. Filtragem de Transações por Mês Selecionado
  // =========================================================================
  describe("2. Filtragem de Transações na Tabela", () => {
    it("renderiza apenas as despesas pertencentes ao mês ativo no modal", () => {
      render(
        <ContactExpensesDialog
          contact={contactCarlos}
          transactions={sampleTransactions}
          onClose={() => {}}
        />,
      );

      // Active month is November 2026:
      // Carlos' November transactions should be visible
      expect(screen.getByText("Almoço Novembro Carlos")).toBeInTheDocument();
      expect(screen.getByText("Presente Fatura Novembro")).toBeInTheDocument();
      expect(screen.getByText("Uber Novembro Já Pago")).toBeInTheDocument();

      // Transactions from other months must NOT be rendered
      expect(screen.queryByText("Show Outubro Carlos")).not.toBeInTheDocument();
      expect(screen.queryByText("Jantar Outubro Fallback Data")).not.toBeInTheDocument();
      expect(screen.queryByText("Farmácia Dezembro Carlos")).not.toBeInTheDocument();

      // Revenue and other contacts must NOT be rendered
      expect(screen.queryByText("Transferência Recebida")).not.toBeInTheDocument();
      expect(screen.queryByText("Celular Amanda Novembro")).not.toBeInTheDocument();
    });

    it("atualiza a tabela dinamicamente ao navegar entre os meses", () => {
      render(
        <ContactExpensesDialog
          contact={contactCarlos}
          transactions={sampleTransactions}
          onClose={() => {}}
        />,
      );

      // Initial: November
      expect(screen.getByText("Almoço Novembro Carlos")).toBeInTheDocument();

      // Navigate to October
      const prevButton = screen.getByRole("button", { name: "Mês anterior" });
      fireEvent.click(prevButton);

      // In October: show October transactions
      expect(screen.getByText("Show Outubro Carlos")).toBeInTheDocument();
      expect(screen.getByText("Jantar Outubro Fallback Data")).toBeInTheDocument();

      // November transactions are no longer visible
      expect(screen.queryByText("Almoço Novembro Carlos")).not.toBeInTheDocument();
      expect(screen.queryByText("Presente Fatura Novembro")).not.toBeInTheDocument();
      expect(screen.queryByText("Uber Novembro Já Pago")).not.toBeInTheDocument();

      // Navigate to December (click next twice)
      const nextButton = screen.getByRole("button", { name: "Próximo mês" });
      fireEvent.click(nextButton); // Back to November
      fireEvent.click(nextButton); // Forward to December

      // In December: show December transactions
      expect(screen.getByText("Farmácia Dezembro Carlos")).toBeInTheDocument();
      expect(screen.queryByText("Show Outubro Carlos")).not.toBeInTheDocument();
      expect(screen.queryByText("Almoço Novembro Carlos")).not.toBeInTheDocument();
    });

    it("exibe mensagem de lista vazia quando o mês selecionado não tem gastos vinculados", () => {
      render(
        <ContactExpensesDialog
          contact={contactCarlos}
          transactions={sampleTransactions}
          onClose={() => {}}
        />,
      );

      // Advance to January 2027 (no transactions)
      const nextButton = screen.getByRole("button", { name: "Próximo mês" });
      fireEvent.click(nextButton); // Dezembro 2026
      fireEvent.click(nextButton); // Janeiro 2027

      expect(screen.getByText("Nenhum gasto vinculado.")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 3. Resumo Dinâmico — Card "A Receber (Este Mês)"
  // =========================================================================
  describe("3. Resumo Dinâmico do Mês Ativo", () => {
    it("calcula 'A Receber (Este Mês)' refletindo apenas o mês ativo e excluindo itens pagos", () => {
      render(
        <ContactExpensesDialog
          contact={contactCarlos}
          transactions={sampleTransactions}
          onClose={() => {}}
        />,
      );

      // In November 2026:
      // Tx1 (150 pendente) + Tx2 (300 pendente) = 450
      // Tx3 (50 pago) is excluded
      const cardMesLabel = screen.getByText("A Receber (Este Mês)");
      const cardMesContainer = cardMesLabel.closest("div")!;
      expect(within(cardMesContainer).getByText(/450,00/)).toBeInTheDocument();

      // Navigate to October 2026:
      // Tx4 (220 pendente) + Tx5 (100 pendente) = 320
      const prevButton = screen.getByRole("button", { name: "Mês anterior" });
      fireEvent.click(prevButton);

      expect(within(cardMesContainer).getByText(/320,00/)).toBeInTheDocument();

      // Navigate to December 2026:
      // Tx6 (80 pendente) = 80
      const nextButton = screen.getByRole("button", { name: "Próximo mês" });
      fireEvent.click(nextButton); // Novembro
      fireEvent.click(nextButton); // Dezembro

      expect(within(cardMesContainer).getByText(/80,00/)).toBeInTheDocument();

      // Navigate to month with no expenses (Janeiro 2027): R$ 0,00
      fireEvent.click(nextButton);
      expect(within(cardMesContainer).getByText(/0,00/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 4. Totalizador Fixo — Card "Total a Receber (Geral)"
  // =========================================================================
  describe("4. Totalizador Fixo Geral", () => {
    it("mantém 'Total a Receber (Geral)' constante em todas as navegações de mês", () => {
      render(
        <ContactExpensesDialog
          contact={contactCarlos}
          transactions={sampleTransactions}
          onClose={() => {}}
        />,
      );

      // Overall pending for Carlos across all months:
      // Nov: 150 + 300 = 450
      // Out: 220 + 100 = 320
      // Dez: 80
      // Total = 450 + 320 + 80 = 850
      const cardGeralLabel = screen.getByText("Total a Receber (Geral)");
      const cardGeralContainer = cardGeralLabel.closest("div")!;
      expect(within(cardGeralContainer).getByText(/850,00/)).toBeInTheDocument();

      const prevButton = screen.getByRole("button", { name: "Mês anterior" });
      const nextButton = screen.getByRole("button", { name: "Próximo mês" });

      // Navigate back to October 2026
      fireEvent.click(prevButton);
      expect(within(cardGeralContainer).getByText(/850,00/)).toBeInTheDocument();

      // Navigate back to September 2026
      fireEvent.click(prevButton);
      expect(within(cardGeralContainer).getByText(/850,00/)).toBeInTheDocument();

      // Navigate forward to December 2026
      fireEvent.click(nextButton); // Outubro
      fireEvent.click(nextButton); // Novembro
      fireEvent.click(nextButton); // Dezembro
      expect(within(cardGeralContainer).getByText(/850,00/)).toBeInTheDocument();

      // Navigate forward to January 2027
      fireEvent.click(nextButton);
      expect(within(cardGeralContainer).getByText(/850,00/)).toBeInTheDocument();

      // Bottom footer also stays constant at overall pending
      const footerPending = screen.getByText(/Total pendente:/);
      expect(within(footerPending).getByText(/850,00/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 5. Reinicialização de Estado ao Reabrir Modal (key={viewing.id})
  // =========================================================================
  describe("5. Reinicialização do Estado do Mês ao Reabrir Modal", () => {
    it("reseta para o mês atual ao fechar e reabrir o modal do mesmo contato", async () => {
      const TerceirosComponent = TerceirosRoute.options.component!;
      let unmountFn: () => void = () => {};
      await act(async () => {
        const { unmount } = render(<TerceirosComponent />);
        unmountFn = unmount;
      });

      // Open Carlos modal
      const verGastosBtn = screen.getAllByRole("button", { name: /ver gastos/i })[0];
      act(() => {
        fireEvent.click(verGastosBtn);
      });

      expect(screen.getByRole("heading", { name: "Novembro 2026" })).toBeInTheDocument();

      // Change month to October 2026
      const prevButton = screen.getByRole("button", { name: "Mês anterior" });
      act(() => {
        fireEvent.click(prevButton);
      });
      expect(screen.getByRole("heading", { name: "Outubro 2026" })).toBeInTheDocument();

      // Unmount and re-render or close and reopen
      act(() => {
        unmountFn();
      });
      await act(async () => {
        render(<TerceirosComponent />);
      });

      // Reopen Carlos modal
      const reopenBtn = screen.getAllByRole("button", { name: /ver gastos/i })[0];
      act(() => {
        fireEvent.click(reopenBtn);
      });

      // Must be back to November 2026
      expect(screen.getByRole("heading", { name: "Novembro 2026" })).toBeInTheDocument();
    });

    it("reseta para o mês atual ao alternar entre contatos diferentes", () => {
      let currentViewing: Contact | null = contactCarlos;
      const { rerender } = render(
        <ContactExpensesDialog
          key={currentViewing.id}
          contact={currentViewing}
          transactions={sampleTransactions}
          onClose={() => {}}
        />,
      );

      // In Carlos modal, navigate to October
      const prevButton = screen.getByRole("button", { name: "Mês anterior" });
      fireEvent.click(prevButton);
      expect(screen.getByRole("heading", { name: "Outubro 2026" })).toBeInTheDocument();

      // Switch to Amanda
      currentViewing = contactAmanda;
      rerender(
        <ContactExpensesDialog
          key={currentViewing.id}
          contact={currentViewing}
          transactions={sampleTransactions}
          onClose={() => {}}
        />,
      );

      // Amanda's modal must start at November 2026
      expect(screen.getByRole("heading", { name: "Novembro 2026" })).toBeInTheDocument();
      expect(
        screen.getByRole("heading", { name: `Gastos de ${contactAmanda.name}` }),
      ).toBeInTheDocument();
      expect(screen.getByText("Celular Amanda Novembro")).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 6. Interatividade — Baixa de Pagamento (toggleTransactionPaid)
  // =========================================================================
  describe("6. Interatividade de Baixa de Pagamento", () => {
    it("permite dar baixa em uma transação pelo checkbox e atualiza os valores dinamicamente", async () => {
      const TerceirosComponent = TerceirosRoute.options.component!;
      await act(async () => {
        render(<TerceirosComponent />);
      });

      // Open Carlos modal
      act(() => {
        fireEvent.click(screen.getAllByRole("button", { name: /ver gastos/i })[0]);
      });

      // Scope to the opened modal dialog
      const dialog = screen.getByRole("dialog");

      // Initially in November 2026: pending 450 (150 + 300), overall 850
      const cardMesContainer = within(dialog).getByText("A Receber (Este Mês)").closest("div")!;
      const cardGeralContainer = within(dialog)
        .getByText("Total a Receber (Geral)")
        .closest("div")!;
      expect(within(cardMesContainer).getByText(/450,00/)).toBeInTheDocument();
      expect(within(cardGeralContainer).getByText(/850,00/)).toBeInTheDocument();

      // Find the checkbox button for "Almoço Novembro Carlos" (value 150)
      const almoçoRow = within(dialog).getByText("Almoço Novembro Carlos").closest("tr")!;
      const checkboxBtn = within(almoçoRow).getByRole("checkbox");
      expect(checkboxBtn).toHaveAttribute("aria-checked", "false");

      // Click to mark as paid
      act(() => {
        fireEvent.click(checkboxBtn);
      });

      // After payment:
      // "Almoço Novembro Carlos" is now paid
      expect(checkboxBtn).toHaveAttribute("aria-checked", "true");
      // "A Receber (Este Mês)" dynamically drops to 300
      expect(within(cardMesContainer).getByText(/300,00/)).toBeInTheDocument();
      // "Total a Receber (Geral)" drops to 700
      expect(within(cardGeralContainer).getByText(/700,00/)).toBeInTheDocument();
    });
  });

  // =========================================================================
  // 7. Challenger 2: Empirical Boundary Stress Tests
  // =========================================================================
  describe("7. Challenger 2: Stress-Tests Empíricos de Fronteira e Estado", () => {
    it("suporta travessia de longo prazo retrocedendo 24 meses e avançando 36 meses mantendo invariantes", () => {
      const distantTransactions: Transaction[] = [
        {
          id: "tx-past-24",
          tipo: "despesa",
          valor: 120,
          categoria: "Lazer",
          conta: "Pix",
          descricao: "Viagem Passada Novembro 2024",
          data: "2024-11-15",
          mesReferencia: "2024-11",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
        {
          id: "tx-past-17",
          tipo: "despesa",
          valor: 90,
          categoria: "Alimentação",
          conta: "Pix",
          descricao: "Restaurante Junho 2025",
          data: "2025-06-10",
          mesReferencia: "2025-06",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
        {
          id: "tx-now",
          tipo: "despesa",
          valor: 200,
          categoria: "Transporte",
          conta: "Pix",
          descricao: "Passagem Novembro 2026",
          data: "2026-11-12",
          mesReferencia: "2026-11",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
        {
          id: "tx-jan-27",
          tipo: "despesa",
          valor: 350,
          categoria: "Saúde",
          conta: "Pix",
          descricao: "Consulta Janeiro 2027",
          data: "2027-01-05",
          mesReferencia: "2027-01",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
        {
          id: "tx-future-36",
          tipo: "despesa",
          valor: 500,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Futuro Novembro 2029",
          data: "2029-11-20",
          mesReferencia: "2029-11",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
      ];

      render(
        <ContactExpensesDialog
          contact={contactCarlos}
          transactions={distantTransactions}
          onClose={() => {}}
        />,
      );

      // Total pending across all 5 transactions: 120 + 90 + 200 + 350 + 500 = 1260
      const cardGeralContainer = screen.getByText("Total a Receber (Geral)").closest("div")!;
      const cardMesContainer = screen.getByText("A Receber (Este Mês)").closest("div")!;
      expect(within(cardGeralContainer).getByText(/1\.260,00/)).toBeInTheDocument();
      expect(within(cardMesContainer).getByText(/200,00/)).toBeInTheDocument();
      expect(screen.getByText("Passagem Novembro 2026")).toBeInTheDocument();

      const prevBtn = screen.getByRole("button", { name: "Mês anterior" });
      const nextBtn = screen.getByRole("button", { name: "Próximo mês" });

      // Navigate back 24 months (from 2026-11 to 2024-11)
      for (let i = 0; i < 24; i++) {
        fireEvent.click(prevBtn);
        // Totalizador Geral invariant must hold continuously
        expect(within(cardGeralContainer).getByText(/1\.260,00/)).toBeInTheDocument();
      }

      // Assert at 24 months back: Novembro 2024
      expect(screen.getByRole("heading", { name: "Novembro 2024" })).toBeInTheDocument();
      expect(within(cardMesContainer).getByText(/120,00/)).toBeInTheDocument();
      expect(screen.getByText("Viagem Passada Novembro 2024")).toBeInTheDocument();
      expect(screen.queryByText("Passagem Novembro 2026")).not.toBeInTheDocument();

      // Navigate forward 36 months from 2024-11 -> 2027-11
      for (let i = 0; i < 36; i++) {
        fireEvent.click(nextBtn);
        expect(within(cardGeralContainer).getByText(/1\.260,00/)).toBeInTheDocument();
      }

      // Assert at 2027-11
      expect(screen.getByRole("heading", { name: "Novembro 2027" })).toBeInTheDocument();
      expect(within(cardMesContainer).getByText(/0,00/)).toBeInTheDocument();
      expect(screen.getByText("Nenhum gasto vinculado.")).toBeInTheDocument();

      // Navigate forward another 24 months to 2029-11 (36 months after start date 2026-11)
      for (let i = 0; i < 24; i++) {
        fireEvent.click(nextBtn);
        expect(within(cardGeralContainer).getByText(/1\.260,00/)).toBeInTheDocument();
      }

      expect(screen.getByRole("heading", { name: "Novembro 2029" })).toBeInTheDocument();
      expect(within(cardMesContainer).getByText(/500,00/)).toBeInTheDocument();
      expect(screen.getByText("Futuro Novembro 2029")).toBeInTheDocument();
    });

    it("stress-testa viradas consecutivas de ano Dezembro <-> Janeiro e ano bissexto", () => {
      const leapTransactions: Transaction[] = [
        {
          id: "tx-leap-1",
          tipo: "despesa",
          valor: 88,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Compra Ano Bissexto 29 Fev",
          data: "2028-02-29",
          mesReferencia: "2028-02",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
      ];

      render(
        <ContactExpensesDialog
          contact={contactCarlos}
          transactions={leapTransactions}
          onClose={() => {}}
        />,
      );

      const prevBtn = screen.getByRole("button", { name: "Mês anterior" });
      const nextBtn = screen.getByRole("button", { name: "Próximo mês" });

      // Start at November 2026 -> advance to December 2026
      fireEvent.click(nextBtn);
      expect(screen.getByRole("heading", { name: "Dezembro 2026" })).toBeInTheDocument();

      // Oscillate 10 times between December 2026 and January 2027
      for (let i = 0; i < 10; i++) {
        fireEvent.click(nextBtn);
        expect(screen.getByRole("heading", { name: "Janeiro 2027" })).toBeInTheDocument();
        fireEvent.click(prevBtn);
        expect(screen.getByRole("heading", { name: "Dezembro 2026" })).toBeInTheDocument();
      }

      // Navigate forward to Leap Month: Fevereiro 2028 (14 months forward from Dec 2026)
      for (let i = 0; i < 14; i++) {
        fireEvent.click(nextBtn);
      }

      expect(screen.getByRole("heading", { name: "Fevereiro 2028" })).toBeInTheDocument();
      expect(screen.getByText("Compra Ano Bissexto 29 Fev")).toBeInTheDocument();
      const cardMesContainer = screen.getByText("A Receber (Este Mês)").closest("div")!;
      expect(within(cardMesContainer).getByText(/88,00/)).toBeInTheDocument();
    });

    it("garante isolamento estrito de estado ao alternar, fechar e reabrir contatos", async () => {
      const TerceirosComponent = TerceirosRoute.options.component!;
      await act(async () => {
        render(<TerceirosComponent />);
      });

      // 1. Open Carlos modal
      const verGastosButtons = screen.getAllByRole("button", { name: /ver gastos/i });
      act(() => {
        fireEvent.click(verGastosButtons[0]);
      });

      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByRole("heading", { name: `Gastos de ${contactCarlos.name}` }),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole("heading", { name: "Novembro 2026" })).toBeInTheDocument();

      // 2. Navigate Carlos forward 5 months to April 2027
      const nextBtn = within(dialog).getByRole("button", { name: "Próximo mês" });
      for (let i = 0; i < 5; i++) {
        act(() => {
          fireEvent.click(nextBtn);
        });
      }
      expect(within(dialog).getByRole("heading", { name: "Abril 2027" })).toBeInTheDocument();

      // 3. Close dialog via Dialog close / backdrop / trigger
      const closeButtons = within(dialog).getAllByRole("button");
      const dialogCloseBtn = closeButtons.find(
        (btn) =>
          btn.getAttribute("aria-label")?.toLowerCase().includes("fechar") ||
          btn.className.includes("absolute"),
      );
      if (dialogCloseBtn) {
        act(() => {
          fireEvent.click(dialogCloseBtn);
        });
      }

      // Re-query Carlos ver gastos button and click
      const verGastosButtonsAfter = screen.getAllByRole("button", { name: /ver gastos/i });
      act(() => {
        fireEvent.click(verGastosButtonsAfter[0]);
      });

      // Assert month reset back to November 2026
      const dialogReopened = screen.getByRole("dialog");
      expect(
        within(dialogReopened).getByRole("heading", { name: "Novembro 2026" }),
      ).toBeInTheDocument();

      // 4. In Carlos modal, navigate 3 months back to August 2026
      const prevBtn = within(dialogReopened).getByRole("button", { name: "Mês anterior" });
      for (let i = 0; i < 3; i++) {
        act(() => {
          fireEvent.click(prevBtn);
        });
      }
      expect(
        within(dialogReopened).getByRole("heading", { name: "Agosto 2026" }),
      ).toBeInTheDocument();

      // 5. Open Amanda's modal directly
      act(() => {
        fireEvent.click(verGastosButtonsAfter[1]);
      });

      const dialogAmanda = screen.getByRole("dialog");
      expect(
        within(dialogAmanda).getByRole("heading", { name: `Gastos de ${contactAmanda.name}` }),
      ).toBeInTheDocument();
      // Must NOT be August 2026, must be November 2026!
      expect(
        within(dialogAmanda).getByRole("heading", { name: "Novembro 2026" }),
      ).toBeInTheDocument();
      expect(within(dialogAmanda).getByText("Celular Amanda Novembro")).toBeInTheDocument();
      expect(within(dialogAmanda).queryByText("Almoço Novembro Carlos")).not.toBeInTheDocument();
    });

    it("processa com robustez edge cases de dados: mesReferencia ausente/vazio/nulo, valor zero e valores fracionários", () => {
      const edgeCaseTransactions: Transaction[] = [
        // Missing mesReferencia (undefined): fallback to data.slice(0, 7)
        {
          id: "tx-undefined-mes",
          tipo: "despesa",
          valor: 75.5,
          categoria: "Alimentação",
          conta: "Pix",
          descricao: "Gasto com mesReferencia undefined",
          data: "2026-11-04",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
        // Empty string mesReferencia: fallback to data.slice(0, 7)
        {
          id: "tx-empty-mes",
          tipo: "despesa",
          valor: 45.25,
          categoria: "Compras",
          conta: "Pix",
          descricao: "Gasto com mesReferencia vazio",
          data: "2026-11-18",
          mesReferencia: "",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
        // Null mesReferencia: fallback to data.slice(0, 7)
        {
          id: "tx-null-mes",
          tipo: "despesa",
          valor: 30,
          categoria: "Transporte",
          conta: "Pix",
          descricao: "Gasto com mesReferencia nulo",
          data: "2026-11-22",
          mesReferencia: null as unknown as string,
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
        // Zero valor
        {
          id: "tx-zero",
          tipo: "despesa",
          valor: 0,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Gasto com valor zero",
          data: "2026-11-01",
          mesReferencia: "2026-11",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
        // Mixed paid transaction in the same month
        {
          id: "tx-paid",
          tipo: "despesa",
          valor: 100,
          categoria: "Lazer",
          conta: "Pix",
          descricao: "Gasto já quitado",
          data: "2026-11-02",
          mesReferencia: "2026-11",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: true,
        },
        // Another contact (must be isolated out)
        {
          id: "tx-other-contact",
          tipo: "despesa",
          valor: 999,
          categoria: "Compras",
          conta: "Pix",
          descricao: "Gasto de outro terceiro",
          data: "2026-11-15",
          mesReferencia: "2026-11",
          contact_id: "c-other",
          expense_owner: "Terceiros",
          is_paid: false,
        },
        // Non-expense (receita - must be excluded)
        {
          id: "tx-revenue",
          tipo: "receita",
          valor: 800,
          categoria: "Outros",
          conta: "Pix",
          descricao: "Receita de terceiro",
          data: "2026-11-20",
          mesReferencia: "2026-11",
          contact_id: "c-carlos",
          expense_owner: "Terceiros",
          is_paid: false,
        },
      ];

      render(
        <ContactExpensesDialog
          contact={contactCarlos}
          transactions={edgeCaseTransactions}
          onClose={() => {}}
        />,
      );

      // Verify table rows: all 5 despesas of Carlos must be rendered
      expect(screen.getByText("Gasto com mesReferencia undefined")).toBeInTheDocument();
      expect(screen.getByText("Gasto com mesReferencia vazio")).toBeInTheDocument();
      expect(screen.getByText("Gasto com mesReferencia nulo")).toBeInTheDocument();
      expect(screen.getByText("Gasto com valor zero")).toBeInTheDocument();
      expect(screen.getByText("Gasto já quitado")).toBeInTheDocument();

      // Zero valor must render formatted as R$ 0,00 without errors
      expect(screen.getAllByText(/0,00/).length).toBeGreaterThan(0);

      // Excluded items must NOT be present
      expect(screen.queryByText("Gasto de outro terceiro")).not.toBeInTheDocument();
      expect(screen.queryByText("Receita de terceiro")).not.toBeInTheDocument();

      // Assert calculations:
      // Unpaid items for Carlos in 2026-11: 75.50 + 45.25 + 30.00 + 0 = 150.75
      // Paid (100.00) is excluded
      const cardMesContainer = screen.getByText("A Receber (Este Mês)").closest("div")!;
      const cardGeralContainer = screen.getByText("Total a Receber (Geral)").closest("div")!;
      expect(within(cardMesContainer).getByText(/150,75/)).toBeInTheDocument();
      expect(within(cardGeralContainer).getByText(/150,75/)).toBeInTheDocument();

      // Checkbox and paid styling checks
      const paidRow = screen.getByText("Gasto já quitado").closest("tr")!;
      expect(within(paidRow).getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
      expect(within(paidRow).getByText("Pago")).toBeInTheDocument();

      const zeroRow = screen.getByText("Gasto com valor zero").closest("tr")!;
      expect(within(zeroRow).getByRole("checkbox")).toHaveAttribute("aria-checked", "false");
    });
  });
});
