import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/server.js";

describe("Genuine Express and SQLite Backend API Integration", () => {
  let server: http.Server;
  let baseUrl: string;
  let closeDb: () => Promise<void>;
  let initDb: () => Promise<void>;
  let runSql: (sql: string, params?: any[]) => Promise<any>;
  let getSql: (sql: string, params?: any[]) => Promise<any>;
  let allSql: (sql: string, params?: any[]) => Promise<any[]>;

  // Helper for type-safe API requests against real HTTP listener
  async function apiRequest<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      query?: Record<string, string | number | boolean>;
    } = {}
  ): Promise<{ status: number; body: T }> {
    let url = `${baseUrl}${path}`;
    if (options.query) {
      const q = new URLSearchParams(
        Object.entries(options.query).map(([k, v]) => [k, String(v)])
      ).toString();
      url += `?${q}`;
    }
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body: body as T };
  }

  beforeAll(async () => {
    // 1. Create completely isolated test server instance in memory
    const serverInstance = createApp({ dbPath: ":memory:", silent: true });
    closeDb = serverInstance.closeDatabase;
    initDb = serverInstance.initDatabase;
    runSql = serverInstance.runAsync;
    getSql = serverInstance.getAsync;
    allSql = serverInstance.allAsync;

    // 2. Initialize real database schema using server's own initDatabase()
    await initDb();

    // 3. Start ephemeral HTTP server on dynamic port (zero collisions)
    server = http.createServer(serverInstance.app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await closeDb();
  });

  // -------------------------------------------------------------------------
  // 1. Accounts & Contacts Endpoints
  // -------------------------------------------------------------------------
  describe("Accounts and Contacts Endpoints", () => {
    it("creates credit card account with custom closing day via POST /api/accounts", async () => {
      const { status, body } = await apiRequest("/api/accounts", {
        method: "POST",
        body: {
          id: "card_nubank",
          name: "Nubank Platinum",
          type: "CREDIT_CARD",
          closing_day: 10,
        },
      });

      expect(status).toBe(201);
      expect(body.id).toBe("card_nubank");
      expect(body.name).toBe("Nubank Platinum");
      expect(body.type).toBe("CREDIT_CARD");
      expect(body.closing_day).toBe(10);
    });

    it("creates checking account via POST /api/accounts", async () => {
      const { status, body } = await apiRequest("/api/accounts", {
        method: "POST",
        body: {
          id: "acc_itau",
          name: "Itaú Corrente",
          type: "CHECKING_ACCOUNT",
        },
      });

      expect(status).toBe(201);
      expect(body.id).toBe("acc_itau");
      expect(body.type).toBe("CHECKING_ACCOUNT");
    });

    it("creates contact via POST /api/contacts", async () => {
      const { status, body } = await apiRequest("/api/contacts", {
        method: "POST",
        body: {
          id: "contact_joao",
          name: "João Silva",
        },
      });

      expect(status).toBe(201);
      expect(body.id).toBe("contact_joao");
      expect(body.name).toBe("João Silva");
    });
  });

  // -------------------------------------------------------------------------
  // 2. POST /api/transactions (Genuine Route Business Logic Testing)
  // -------------------------------------------------------------------------
  describe("POST /api/transactions — mesReferencia Business Logic", () => {
    it("computes mesReferencia = current month for credit card purchase BEFORE closing day", async () => {
      // Closing day is 10; purchase is on 2026-10-09 (day 9 < 10)
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_before",
          amount: 150,
          description: "Supermercado antes fechamento",
          category: "Alimentação",
          date: "2026-10-09",
          account_id: "card_nubank",
        },
      });

      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-10");
    });

    it("computes mesReferencia = next month for credit card purchase ON closing day", async () => {
      // Closing day is 10; purchase is on 2026-10-10 (day 10 == 10)
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_on",
          amount: 200,
          description: "Farmácia no fechamento",
          category: "Saúde",
          date: "2026-10-10",
          account_id: "card_nubank",
        },
      });

      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-11");
    });

    it("computes mesReferencia = next month for credit card purchase AFTER closing day", async () => {
      // Closing day is 10; purchase is on 2026-10-25 (day 25 > 10)
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_after",
          amount: 450,
          description: "Smartphone após fechamento",
          category: "Compras",
          date: "2026-10-25",
          account_id: "card_nubank",
        },
      });

      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-11");
    });

    it("computes mesReferencia with YEAR ROLLOVER for credit card purchase in December on/after closing day", async () => {
      // Closing day is 10; purchase is on 2026-12-15 (day 15 >= 10) -> rolls to 2027-01
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_dec_rollover",
          amount: 600,
          description: "Presentes de Natal",
          category: "Compras",
          date: "2026-12-15",
          account_id: "card_nubank",
        },
      });

      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2027-01");
    });

    it("respects explicit mesReferencia for non-credit card payment methods", async () => {
      // Non-credit card (Itaú Checking Account) with explicit mesReferencia
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_checking_explicit",
          amount: 1200,
          description: "Aluguel adiantado",
          category: "Moradia",
          date: "2026-10-01",
          mesReferencia: "2026-11",
          account_id: "acc_itau",
        },
      });

      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-11");
    });

    it("falls back to transaction date month for non-credit card when explicit mesReferencia is omitted", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_checking_default",
          amount: 85,
          description: "Padaria débito",
          category: "Alimentação",
          date: "2026-10-18",
          account_id: "acc_itau",
        },
      });

      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-10");
    });

    it("handles batch transaction insertion via POST /api/transactions with array payload", async () => {
      const { status, body } = await apiRequest<any[]>("/api/transactions", {
        method: "POST",
        body: [
          {
            id: "batch_1",
            amount: 50,
            description: "Item Lote 1",
            category: "Outros",
            date: "2026-10-02",
            account_id: "card_nubank",
          },
          {
            id: "batch_2",
            amount: 75,
            description: "Item Lote 2",
            category: "Outros",
            date: "2026-10-12",
            account_id: "card_nubank",
          },
        ],
      });

      expect(status).toBe(201);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(2);
      expect(body[0].mesReferencia).toBe("2026-10"); // day 2 < 10
      expect(body[1].mesReferencia).toBe("2026-11"); // day 12 >= 10
    });
  });

  // -------------------------------------------------------------------------
  // 3. GET /api/transactions (Filtering strictly by mesReferencia)
  // -------------------------------------------------------------------------
  describe("GET /api/transactions — Month Filtering", () => {
    it("filters transactions strictly by mesReferencia query parameter", async () => {
      // Query for October 2026
      const octRes = await apiRequest<any[]>("/api/transactions", {
        query: { month: "2026-10" },
      });
      expect(octRes.status).toBe(200);
      expect(octRes.body.length).toBeGreaterThan(0);
      expect(octRes.body.every((t) => t.mesReferencia === "2026-10")).toBe(true);

      // Verify that tx_on (made on 2026-10-10) is NOT in October results
      const foundOnOct = octRes.body.find((t) => t.id === "tx_on");
      expect(foundOnOct).toBeUndefined();

      // Query for November 2026
      const novRes = await apiRequest<any[]>("/api/transactions", {
        query: { month: "2026-11" },
      });
      expect(novRes.status).toBe(200);
      expect(novRes.body.length).toBeGreaterThan(0);
      expect(novRes.body.every((t) => t.mesReferencia === "2026-11")).toBe(true);

      // Verify that tx_on (made on 2026-10-10) and tx_after (made on 2026-10-25) ARE in November results
      const foundOnNov = novRes.body.find((t) => t.id === "tx_on");
      const foundAfterNov = novRes.body.find((t) => t.id === "tx_after");
      expect(foundOnNov).toBeDefined();
      expect(foundAfterNov).toBeDefined();

      // Query for January 2027
      const janRes = await apiRequest<any[]>("/api/transactions", {
        query: { month: "2027-01" },
      });
      expect(janRes.status).toBe(200);
      const foundDec = janRes.body.find((t) => t.id === "tx_dec_rollover");
      expect(foundDec).toBeDefined();
      expect(foundDec.mesReferencia).toBe("2027-01");
    });
  });

  // -------------------------------------------------------------------------
  // 4. GET /api/dashboard/summary (Aggregation strictly by mesReferencia)
  // -------------------------------------------------------------------------
  describe("GET /api/dashboard/summary — Aggregation Verification", () => {
    it("calculates personal expenses and category breakdowns strictly by mesReferencia", async () => {
      // November summary must include tx_on (200), tx_after (450), tx_checking_explicit (1200), batch_2 (75) = 1925
      const { status, body } = await apiRequest("/api/dashboard/summary", {
        query: { month: "2026-11" },
      });

      expect(status).toBe(200);
      expect(body.month).toBe("2026-11");
      expect(body.monthly.personal_expenses).toBe(1925);

      // Verify category breakdown
      const comprasCat = body.categories.find((c: any) => c.category === "Compras");
      expect(comprasCat).toBeDefined();
      expect(comprasCat.total).toBe(450); // Smartphone

      const moradiaCat = body.categories.find((c: any) => c.category === "Moradia");
      expect(moradiaCat).toBeDefined();
      expect(moradiaCat.total).toBe(1200); // Aluguel
    });

    it("excludes next-month credit card purchases from the current month summary", async () => {
      const { status, body } = await apiRequest("/api/dashboard/summary", {
        query: { month: "2026-10" },
      });

      expect(status).toBe(200);
      // October includes tx_before (150), tx_checking_default (85), batch_1 (50) = 285
      expect(body.monthly.personal_expenses).toBe(285);
    });
  });

  // -------------------------------------------------------------------------
  // 5. GET /api/third-party/summary (Third-Party Pending Grouping)
  // -------------------------------------------------------------------------
  describe("GET /api/third-party/summary — Third-Party Aggregation", () => {
    it("groups third-party expenses by mesReferencia", async () => {
      // Add third-party expense on credit card after closing (day 20 > 10) -> mesReferencia = '2026-11'
      await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_third_party",
          amount: 320,
          description: "Jantar compartilhado",
          category: "Alimentação",
          date: "2026-10-20",
          account_id: "card_nubank",
          contact_id: "contact_joao",
          is_paid: 0,
        },
      });

      // October summary should have 0 for this contact in total_a_receber_mes
      const octSummary = await apiRequest("/api/third-party/summary", {
        query: { month: "2026-10" },
      });
      expect(octSummary.status).toBe(200);
      expect(octSummary.body.total_a_receber_mes).toBe(0);

      // November summary must reflect 320 in total_a_receber_mes
      const novSummary = await apiRequest("/api/third-party/summary", {
        query: { month: "2026-11" },
      });
      expect(novSummary.status).toBe(200);
      expect(novSummary.body.total_a_receber_mes).toBe(320);
      expect(novSummary.body.total_a_receber_geral).toBe(320);

      const contactItem = novSummary.body.contacts.find((c: any) => c.id === "contact_joao");
      expect(contactItem).toBeDefined();
      expect(contactItem.total_a_receber_mes).toBe(320);
    });
  });

  // -------------------------------------------------------------------------
  // 6. POST /api/transactions/process-recurring (Recurring Process Verification)
  // -------------------------------------------------------------------------
  describe("POST /api/transactions/process-recurring", () => {
    it("assigns mesReferencia matching credit card closing day when renewing recurring subscriptions", async () => {
      // 1. Create accounts: card with closing day 5, checking account
      await apiRequest("/api/accounts", {
        method: "POST",
        body: { id: "card_recur", name: "Cartão Recorrente", type: "CREDIT_CARD", closing_day: 5 },
      });
      await apiRequest("/api/accounts", {
        method: "POST",
        body: { id: "bank_recur", name: "Banco Recorrente", type: "CHECKING_ACCOUNT" },
      });

      // 2. Insert recurring transactions in October
      // Subscription 1: Credit card with date 10 (10 >= 5 -> when renewed in November, date 2026-11-10 -> mesReferencia 2026-12)
      await runSql(
        `INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
         VALUES ('sub_cc_after', 'despesa', 55.90, 'Netflix 4K', 'Assinatura / Fixo', '2026-10-10', '2026-11', 1, 0, 'card_recur')`
      );
      // Subscription 2: Credit card with date 3 (3 < 5 -> when renewed in November, date 2026-11-03 -> mesReferencia 2026-11)
      await runSql(
        `INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
         VALUES ('sub_cc_before', 'despesa', 21.90, 'Spotify Premium', 'Assinatura / Fixo', '2026-10-03', '2026-10', 1, 0, 'card_recur')`
      );
      // Subscription 3: Bank account with date 10 (non-card -> date 2026-11-10 -> mesReferencia 2026-11)
      await runSql(
        `INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
         VALUES ('sub_bank', 'despesa', 120.00, 'Gympass Fit', 'Assinatura / Fixo', '2026-10-10', '2026-10', 1, 0, 'bank_recur')`
      );

      // 3. Trigger recurring renewal for November 2026
      const { status, body } = await apiRequest("/api/transactions/process-recurring", {
        method: "POST",
        body: { targetDate: "2026-11-15" },
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.processedCount).toBe(3);

      const netflix = await getSql("SELECT * FROM transactions WHERE description = 'Netflix 4K' AND date LIKE '2026-11%'");
      expect(netflix).toBeDefined();
      expect(netflix.date).toBe("2026-11-10");
      expect(netflix.mesReferencia).toBe("2026-12"); // 10 >= 5 -> Dec invoice

      const spotify = await getSql("SELECT * FROM transactions WHERE description = 'Spotify Premium' AND date LIKE '2026-11%'");
      expect(spotify).toBeDefined();
      expect(spotify.date).toBe("2026-11-03");
      expect(spotify.mesReferencia).toBe("2026-11"); // 3 < 5 -> Nov invoice

      const gympass = await getSql("SELECT * FROM transactions WHERE description = 'Gympass Fit' AND date LIKE '2026-11%'");
      expect(gympass).toBeDefined();
      expect(gympass.date).toBe("2026-11-10");
      expect(gympass.mesReferencia).toBe("2026-11"); // checking account -> Nov
    });
  });

  // -------------------------------------------------------------------------
  // 7. Retroactive Migration Testing (Using server's genuine initDatabase)
  // -------------------------------------------------------------------------
  describe("Retroactive Migration Verification", () => {
    it("executes retroactive migration populating mesReferencia for legacy records", async () => {
      // Insert legacy rows directly into table with NULL mesReferencia
      await runSql(
        `INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, ?)`,
        ["legacy_before", "despesa", 99, "Legacy antes", "Outros", "2026-08-04", "card_nubank"]
      );
      await runSql(
        `INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, 0, 0, ?)`,
        ["legacy_after", "despesa", 199, "Legacy após", "Outros", "2026-08-15", "card_nubank"]
      );

      // Re-run the server's genuine initDatabase()
      await initDb();

      const r1 = await getSql("SELECT mesReferencia FROM transactions WHERE id = 'legacy_before'");
      const r2 = await getSql("SELECT mesReferencia FROM transactions WHERE id = 'legacy_after'");

      expect(r1.mesReferencia).toBe("2026-08"); // 4 < 10 -> same month
      expect(r2.mesReferencia).toBe("2026-09"); // 15 >= 10 -> next month
    });
  });

  // -------------------------------------------------------------------------
  // 8. Database Reset Endpoint
  // -------------------------------------------------------------------------
  describe("DELETE /api/database/reset", () => {
    it("resets operational data while keeping schema structure intact", async () => {
      const { status, body } = await apiRequest("/api/database/reset", {
        method: "DELETE",
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);

      const countTx = await getSql("SELECT COUNT(*) as count FROM transactions");
      const countAcc = await getSql("SELECT COUNT(*) as count FROM accounts");
      const countContact = await getSql("SELECT COUNT(*) as count FROM contacts");

      expect(countTx.count).toBe(0);
      expect(countAcc.count).toBe(0);
      expect(countContact.count).toBe(0);

      // Verify schema is still operational
      const createRes = await apiRequest("/api/accounts", {
        method: "POST",
        body: { id: "new_acc", name: "Conta Pós Reset", type: "CHECKING_ACCOUNT" },
      });
      expect(createRes.status).toBe(201);
    });
  });
});