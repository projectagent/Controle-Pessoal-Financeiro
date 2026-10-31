import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/server.js";

describe("Adversarial Empirical Verification: HTTP & Express Endpoints", () => {
  let server: http.Server;
  let baseUrl: string;
  let closeDb: () => Promise<void>;
  let initDb: () => Promise<void>;
  let runSql: (sql: string, params?: any[]) => Promise<any>;
  let getSql: (sql: string, params?: any[]) => Promise<any>;
  let allSql: (sql: string, params?: any[]) => Promise<any[]>;

  async function apiRequest<T = any>(
    path: string,
    options: {
      method?: string;
      body?: any;
      query?: Record<string, string | number | boolean>;
      rawBody?: string;
      headers?: Record<string, string>;
    } = {}
  ): Promise<{ status: number; body: T; headers: Headers }> {
    let url = `${baseUrl}${path}`;
    if (options.query) {
      const q = new URLSearchParams(
        Object.entries(options.query).map(([k, v]) => [k, String(v)])
      ).toString();
      url += `?${q}`;
    }

    const headers: Record<string, string> = { ...options.headers };
    let bodyContent: string | undefined = undefined;

    if (options.rawBody !== undefined) {
      bodyContent = options.rawBody;
      if (!headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
    } else if (options.body !== undefined) {
      bodyContent = JSON.stringify(options.body);
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: bodyContent,
    });

    const text = await res.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }

    return { status: res.status, body: body as T, headers: res.headers };
  }

  beforeAll(async () => {
    const serverInstance = createApp({ dbPath: ":memory:", silent: true });
    closeDb = serverInstance.closeDatabase;
    initDb = serverInstance.initDatabase;
    runSql = serverInstance.runAsync;
    getSql = serverInstance.getAsync;
    allSql = serverInstance.allAsync;

    await initDb();

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
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
    if (closeDb) {
      await closeDb();
    }
  });

  // =========================================================================
  // 1. createApp Factory & Ephemeral Multi-Instance Isolation
  // =========================================================================
  describe("createApp Factory & Lifecycle", () => {
    it("can spawn independent ephemeral instance without port or database interference", async () => {
      const instance2 = createApp({ dbPath: ":memory:", silent: true });
      await instance2.initDatabase();

      const server2 = http.createServer(instance2.app);
      let port2 = 0;
      await new Promise<void>((resolve) => {
        server2.listen(0, "127.0.0.1", () => {
          port2 = (server2.address() as AddressInfo).port;
          resolve();
        });
      });

      expect(port2).toBeGreaterThan(0);
      const res = await fetch(`http://127.0.0.1:${port2}/api/health`);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");

      await new Promise<void>((resolve, reject) => {
        server2.close((err) => (err ? reject(err) : resolve()));
      });
      await instance2.closeDatabase();
    });

    it("GET /api/health returns 200 with ok status", async () => {
      const { status, body } = await apiRequest("/api/health");
      expect(status).toBe(200);
      expect(body.status).toBe("ok");
      expect(typeof body.time).toBe("string");
    });
  });

  // =========================================================================
  // 2. Setup Test Seed Accounts and Contacts via HTTP
  // =========================================================================
  describe("Accounts and Contacts Seed via HTTP", () => {
    it("creates credit card account (closing day 10)", async () => {
      const { status, body } = await apiRequest("/api/accounts", {
        method: "POST",
        body: {
          id: "card_adv_10",
          name: "Advantage Visa (Closing 10)",
          type: "CREDIT_CARD",
          closing_day: 10,
        },
      });
      expect(status).toBe(201);
      expect(body.id).toBe("card_adv_10");
      expect(body.closing_day).toBe(10);
    });

    it("creates checking account", async () => {
      const { status, body } = await apiRequest("/api/accounts", {
        method: "POST",
        body: {
          id: "acc_adv_chk",
          name: "Advantage Checking",
          type: "CHECKING_ACCOUNT",
        },
      });
      expect(status).toBe(201);
      expect(body.id).toBe("acc_adv_chk");
      expect(body.type).toBe("CHECKING_ACCOUNT");
    });

    it("creates contact for third-party tracking", async () => {
      const { status, body } = await apiRequest("/api/contacts", {
        method: "POST",
        body: {
          id: "contact_lucas",
          name: "Lucas Amigo",
        },
      });
      expect(status).toBe(201);
      expect(body.id).toBe("contact_lucas");
    });
  });

  // =========================================================================
  // 3. POST /api/transactions — Adversarial Ingestion & Boundary Logic
  // =========================================================================
  describe("POST /api/transactions — Adversarial Ingestion & Calculations", () => {
    it("credit card before closing day (day 9 < 10) sets mesReferencia to current month", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_cc_before",
          amount: 80.5,
          description: "Almoço antes fechamento",
          category: "Alimentação",
          date: "2026-04-09",
          account_id: "card_adv_10",
        },
      });
      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-04");
    });

    it("credit card EXACTLY on closing day (day 10 == 10) rolls mesReferencia to next month", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_cc_on",
          amount: 120.0,
          description: "Jantar no dia do fechamento",
          category: "Alimentação",
          date: "2026-04-10",
          account_id: "card_adv_10",
        },
      });
      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-05");
    });

    it("credit card after closing day (day 11 > 10) rolls mesReferencia to next month", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_cc_after",
          amount: 250.0,
          description: "Compras supermercado após fechamento",
          category: "Mercado",
          date: "2026-04-11",
          account_id: "card_adv_10",
        },
      });
      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-05");
    });

    it("credit card December post-closing (2026-12-15) rolls mesReferencia to January of next year (2027-01)", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_cc_dec_rollover",
          amount: 99.9,
          description: "Presente de Natal após fechamento",
          category: "Lazer",
          date: "2026-12-15",
          account_id: "card_adv_10",
        },
      });
      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2027-01");
    });

    it("credit card December pre-closing (2026-12-05) keeps mesReferencia in December (2026-12)", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_cc_dec_pre",
          amount: 55.0,
          description: "Presente de Natal antes fechamento",
          category: "Lazer",
          date: "2026-12-05",
          account_id: "card_adv_10",
        },
      });
      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-12");
    });

    it("checking account preserves explicit mesReferencia provided in payload", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_chk_explicit",
          amount: 1500.0,
          description: "Aluguel pago adiantado",
          category: "Moradia",
          date: "2026-04-28",
          mesReferencia: "2026-05",
          account_id: "acc_adv_chk",
        },
      });
      expect(status).toBe(201);
      expect(body.mesReferencia).toBe("2026-05");
    });

    it("supports batch array insertion of mixed transactions in single HTTP request", async () => {
      const batchPayload = [
        {
          id: "tx_batch_1",
          amount: 30.0,
          description: "Café 1",
          category: "Alimentação",
          date: "2026-04-05",
          account_id: "card_adv_10",
        },
        {
          id: "tx_batch_2",
          amount: 45.0,
          description: "Café 2",
          category: "Alimentação",
          date: "2026-04-15",
          account_id: "card_adv_10",
        },
      ];

      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: batchPayload,
      });

      expect(status).toBe(201);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(2);
      expect(body[0].mesReferencia).toBe("2026-04");
      expect(body[1].mesReferencia).toBe("2026-05");
    });

    it("handles third-party transaction linked to contact_id", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_tp_lucas",
          amount: 300.0,
          description: "Ingresso do show comprado pro Lucas",
          category: "Lazer",
          date: "2026-05-02",
          mesReferencia: "2026-05",
          contact_id: "contact_lucas",
          is_paid: 0,
        },
      });
      expect(status).toBe(201);
      expect(body.contact_id).toBe("contact_lucas");
      expect(body.expense_owner).toBe("Terceiros");
      expect(body.mesReferencia).toBe("2026-05");
    });
  });

  // =========================================================================
  // 4. Adversarial Malformed & Boundary Payloads (No Server Crash)
  // =========================================================================
  describe("Adversarial Malformed & Boundary Payloads", () => {
    it("handles empty object body {} without crashing", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {},
      });
      expect(status).toBe(201);
      expect(body).toBeDefined();
      expect(body.amount).toBe(0);
      expect(body.type).toBe("despesa");
      expect(body.category).toBe("Outros");
      expect(typeof body.id).toBe("string");
    });

    it("handles invalid or non-date string gracefully without crash", async () => {
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          amount: 10,
          description: "Data inválida",
          date: "not-a-valid-date",
        },
      });
      expect(status).toBe(201);
      expect(body).toBeDefined();
    });

    it("sanitizes SQL injection strings in transaction fields without executing SQL", async () => {
      const sqlInjectionDesc = "Test'; DROP TABLE transactions; --";
      const { status, body } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_sqli_test",
          amount: 100,
          description: sqlInjectionDesc,
          category: "Outros' OR '1'='1",
          date: "2026-05-10",
        },
      });

      expect(status).toBe(201);
      expect(body.description).toBe(sqlInjectionDesc);

      // Verify transactions table was NOT dropped
      const countRow = await getSql("SELECT COUNT(*) as count FROM transactions");
      expect(countRow.count).toBeGreaterThan(0);
    });

    it("handles non-existent account_id with graceful foreign key handling or fallback", async () => {
      // account_id REFERENCES accounts(id)
      const { status } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_fk_missing",
          amount: 50,
          description: "Conta inexistente",
          account_id: "non_existent_account_12345",
          date: "2026-05-10",
        },
      });
      // SQLite with foreign_keys = ON should return 500 or error, but NOT crash the process
      expect([201, 500]).toContain(status);

      // Verify server remains alive and responsive after error
      const health = await apiRequest("/api/health");
      expect(health.status).toBe(200);
    });

    it("handles boundary numeric values: negative, zero, and very large amounts", async () => {
      const { status: sNeg, body: bNeg } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          amount: -50.25,
          description: "Estorno negativo",
          date: "2026-05-01",
        },
      });
      expect(sNeg).toBe(201);
      expect(bNeg.amount).toBe(-50.25);

      const { status: sZero, body: bZero } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          amount: 0,
          description: "Transação zero",
          date: "2026-05-01",
        },
      });
      expect(sZero).toBe(201);
      expect(bZero.amount).toBe(0);

      const { status: sBig, body: bBig } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          amount: 999999999.99,
          description: "Transação gigante",
          date: "2026-05-01",
        },
      });
      expect(sBig).toBe(201);
      expect(bBig.amount).toBe(999999999.99);
    });
  });

  // =========================================================================
  // 5. GET /api/transactions — Filtering by mesReferencia
  // =========================================================================
  describe("GET /api/transactions — Query & Month Filtering", () => {
    it("returns transactions filtered strictly by month=2026-05", async () => {
      const { status, body } = await apiRequest<any[]>("/api/transactions", {
        query: { month: "2026-05" },
      });

      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      for (const t of body) {
        expect(t.mesReferencia).toBe("2026-05");
      }
    });

    it("returns empty array for month with no transactions", async () => {
      const { status, body } = await apiRequest<any[]>("/api/transactions", {
        query: { month: "1999-01" },
      });

      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });

    it("handles SQL injection in query params safely", async () => {
      const { status, body } = await apiRequest<any[]>("/api/transactions", {
        query: { month: "' OR 1=1 --" },
      });

      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });
  });

  // =========================================================================
  // 6. GET /api/dashboard/summary — SQL Aggregations by mesReferencia
  // =========================================================================
  describe("GET /api/dashboard/summary — Aggregations and Segregation", () => {
    it("returns correct aggregated summary for 2026-05", async () => {
      // In 2026-05, we have:
      // tx_cc_on (120, personal, Alimentação)
      // tx_cc_after (250, personal, Mercado)
      // tx_chk_explicit (1500, personal, Moradia)
      // tx_batch_2 (45, personal, Alimentação)
      // tx_tp_lucas (300, third-party, contact_lucas, is_paid: 0)
      // tx_sqli_test (100, personal, Outros' OR '1'='1)
      // tx_neg (-50.25, personal)
      // tx_zero (0)
      // tx_big (999999999.99)
      const { status, body } = await apiRequest("/api/dashboard/summary", {
        query: { month: "2026-05" },
      });

      expect(status).toBe(200);
      expect(body.month).toBe("2026-05");
      expect(typeof body.current_balance).toBe("number");
      expect(typeof body.monthly.personal_expenses).toBe("number");
      expect(typeof body.monthly.third_party_pending).toBe("number");
      expect(typeof body.monthly.third_party_total).toBe("number");
      expect(typeof body.monthly.total_expenses).toBe("number");

      // Verify third-party is segregated from personal expenses:
      // third_party_pending includes the 300 for Lucas
      expect(body.monthly.third_party_pending).toBeGreaterThanOrEqual(300);

      // Verify categories array is populated
      expect(Array.isArray(body.categories)).toBe(true);
      expect(body.categories.length).toBeGreaterThan(0);
      for (const cat of body.categories) {
        expect(typeof cat.category).toBe("string");
        expect(typeof cat.total).toBe("number");
      }

      // Verify history array is populated up to 6 months
      expect(Array.isArray(body.history)).toBe(true);
    });

    it("defaults to current month when month query parameter is omitted", async () => {
      const { status, body } = await apiRequest("/api/dashboard/summary");
      expect(status).toBe(200);
      const expectedCurrentYm = new Date().toISOString().slice(0, 7);
      expect(body.month).toBe(expectedCurrentYm);
    });

    it("returns zero metrics and empty categories for non-existent month without crashing", async () => {
      const { status, body } = await apiRequest("/api/dashboard/summary", {
        query: { month: "1980-01" },
      });

      expect(status).toBe(200);
      expect(body.month).toBe("1980-01");
      expect(body.monthly.personal_expenses).toBe(0);
      expect(body.monthly.total_expenses).toBe(0);
      expect(body.categories).toEqual([]);
    });
  });

  // =========================================================================
  // 7. POST /api/transactions/process-recurring — Subscriptions
  // =========================================================================
  describe("POST /api/transactions/process-recurring", () => {
    beforeAll(async () => {
      // Seed a recurring transaction in previous month (2026-07)
      // Account has closing_day = 10
      // Transaction date is 2026-07-15 (> closing_day)
      await runSql(
        `INSERT INTO transactions (
          id, type, amount, description, category, date, mesReferencia,
          is_recurring, is_paid, account_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "tx_rec_spotify",
          "despesa",
          34.9,
          "Spotify Premium",
          "Assinatura / Fixo",
          "2026-07-15",
          "2026-08",
          1,
          1,
          "card_adv_10",
        ]
      );
    });

    it("processes recurring subscriptions for next month with correct closing day mesReferencia", async () => {
      const { status, body } = await apiRequest("/api/transactions/process-recurring", {
        method: "POST",
        body: { targetDate: "2026-08-15" },
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.processedCount).toBe(1);
      expect(body.items.length).toBe(1);

      const created = body.items[0];
      expect(created.description).toBe("Spotify Premium");
      expect(created.date).toBe("2026-08-15");
      // Day is 15, closing is 10 => 15 >= 10, so mesReferencia must be 2026-09
      expect(created.mesReferencia).toBe("2026-09");
      expect(created.is_recurring).toBe(true);
      expect(created.is_paid).toBe(false);
    });

    it("is strictly idempotent: second call in same month does not duplicate recurring items", async () => {
      const { status, body } = await apiRequest("/api/transactions/process-recurring", {
        method: "POST",
        body: { targetDate: "2026-08-15" },
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.processedCount).toBe(0);
      expect(body.items.length).toBe(0);
    });

    it("clamps day to max days of month (e.g. 31st in shorter month)", async () => {
      // Seed recurring on Jan 31
      await runSql(
        `INSERT INTO transactions (
          id, type, amount, description, category, date, mesReferencia,
          is_recurring, is_paid, account_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          "tx_rec_gym",
          "despesa",
          120.0,
          "Academia Mensal",
          "Assinatura / Fixo",
          "2026-01-31",
          "2026-02",
          1,
          1,
          "acc_adv_chk",
        ]
      );

      const { status, body } = await apiRequest("/api/transactions/process-recurring", {
        method: "POST",
        body: { targetDate: "2026-02-15" },
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);
      const gym = body.items.find((i: any) => i.description === "Academia Mensal");
      expect(gym).toBeDefined();
      // 2026 is not a leap year, February has 28 days -> clamped to 2026-02-28
      expect(gym.date).toBe("2026-02-28");
    });
  });

  // =========================================================================
  // 8. /api/database/reset — Danger Zone (DELETE and POST)
  // =========================================================================
  describe("/api/database/reset (POST & DELETE)", () => {
    it("resets all operational tables via POST /api/database/reset while preserving schema", async () => {
      // Verify data exists before reset
      const preCount = await getSql("SELECT COUNT(*) as count FROM transactions");
      expect(preCount.count).toBeGreaterThan(0);

      const { status, body } = await apiRequest("/api/database/reset", {
        method: "POST",
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);

      // Verify all tables were wiped
      const txCount = await getSql("SELECT COUNT(*) as count FROM transactions");
      const accCount = await getSql("SELECT COUNT(*) as count FROM accounts");
      const contactCount = await getSql("SELECT COUNT(*) as count FROM contacts");
      expect(txCount.count).toBe(0);
      expect(accCount.count).toBe(0);
      expect(contactCount.count).toBe(0);

      // Verify table schema is still intact
      const cols = await allSql("PRAGMA table_info(transactions)");
      expect(cols.some((c) => c.name === "mesReferencia")).toBe(true);
    });

    it("database remains fully operational after reset for subsequent operations", async () => {
      // Create new account and transaction after reset
      const { status: sAcc } = await apiRequest("/api/accounts", {
        method: "POST",
        body: { id: "acc_fresh", name: "Fresh Account", type: "CHECKING_ACCOUNT" },
      });
      expect(sAcc).toBe(201);

      const { status: sTx, body: bTx } = await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_fresh_1",
          amount: 500,
          description: "Fresh Income",
          type: "receita",
          category: "Salário",
          date: "2026-09-01",
          account_id: "acc_fresh",
        },
      });
      expect(sTx).toBe(201);
      expect(bTx.mesReferencia).toBe("2026-09");
    });

    it("also supports DELETE /api/database/reset", async () => {
      const { status, body } = await apiRequest("/api/database/reset", {
        method: "DELETE",
      });

      expect(status).toBe(200);
      expect(body.success).toBe(true);

      const txCount = await getSql("SELECT COUNT(*) as count FROM transactions");
      expect(txCount.count).toBe(0);
    });
  });

  // =========================================================================
  // 9. Standard Error Handling & 404 Responses
  // =========================================================================
  describe("Standard Error Handling & 404 Responses", () => {
    it("returns 404 when GET /api/transactions/:id not found", async () => {
      const { status, body } = await apiRequest("/api/transactions/id_does_not_exist_404");
      expect(status).toBe(404);
      expect(body.error).toBe("Transaction not found");
    });

    it("returns 404 when PUT /api/transactions/:id not found", async () => {
      const { status, body } = await apiRequest("/api/transactions/id_does_not_exist_404", {
        method: "PUT",
        body: { description: "Updated" },
      });
      expect(status).toBe(404);
      expect(body.error).toBe("Transaction not found");
    });

    it("returns 404 when toggle-paid target does not exist", async () => {
      const { status, body } = await apiRequest("/api/transactions/id_does_not_exist_404/toggle-paid", {
        method: "PATCH",
      });
      expect(status).toBe(404);
      expect(body.error).toBe("Transaction not found");
    });

    it("returns 404 for unknown route", async () => {
      const { status } = await apiRequest("/api/unknown-nonexistent-endpoint");
      expect(status).toBe(404);
    });
  });
});
