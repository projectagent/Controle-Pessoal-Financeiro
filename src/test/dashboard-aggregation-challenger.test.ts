import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../server/server.js";

describe("Empirical Challenger: Dashboard Aggregation Logic, Invariants & Oracles", () => {
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
  // CHALLENGE 1: Exactness of Segregation & Mathematical Invariant
  // =========================================================================
  describe("Challenge 1: Exactness of Segregation & Mathematical Invariant", () => {
    it("partitions personal expenses into total_cartao vs total_debito_contas exhaustively with zero leak", async () => {
      const testMonth = "2029-01";

      // 1. Setup accounts and contacts
      await runSql(`INSERT INTO accounts (id, name, type, closing_day) VALUES ('acc_cc_1', 'Mastercard Gold', 'CREDIT_CARD', 10)`);
      await runSql(`INSERT INTO accounts (id, name, type, closing_day) VALUES ('acc_chk_1', 'Conta Corrente Inter', 'CHECKING_ACCOUNT', 5)`);
      await runSql(`INSERT INTO contacts (id, name) VALUES ('cnt_alice', 'Alice Cooper')`);

      // 2. Insert distinct categories of transactions
      // a) Personal expense on Credit Card: 450.75
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id)
        VALUES ('tx_p1', 'despesa', 450.75, 'Supermercado CC', 'Alimentação', '2029-01-05', '2029-01', 'acc_cc_1', NULL)
      `);
      // b) Personal expense on Checking Account: 220.50
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id)
        VALUES ('tx_p2', 'despesa', 220.50, 'Farmácia Débito', 'Saúde', '2029-01-06', '2029-01', 'acc_chk_1', NULL)
      `);
      // c) Personal expense with NULL account (cash / unlinked): 85.25
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id)
        VALUES ('tx_p3', 'EXPENSE', 85.25, 'Feira Dinheiro', 'Alimentação', '2029-01-07', '2029-01', NULL, NULL)
      `);
      // d) Personal expense with explicit checking account: 43.50
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id)
        VALUES ('tx_p4', 'despesa', 43.50, 'Banca Revista', 'Lazer', '2029-01-08', '2029-01', 'acc_chk_1', NULL)
      `);
      // e) Third-party expense on Credit Card (unpaid): 600.00 (MUST NOT BE in personal_expenses, total_cartao, or total_debito_contas)
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id, is_paid)
        VALUES ('tx_tp1', 'despesa', 600.00, 'Passagem Alice CC', 'Viagem', '2029-01-09', '2029-01', 'acc_cc_1', 'cnt_alice', 0)
      `);
      // f) Third-party expense on Credit Card (paid): 250.00 (MUST NOT BE in personal_expenses, total_cartao, or total_debito_contas)
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id, is_paid)
        VALUES ('tx_tp2', 'EXPENSE', 250.00, 'Jantar Alice CC Pago', 'Restaurante', '2029-01-10', '2029-01', 'acc_cc_1', 'cnt_alice', 1)
      `);
      // g) Third-party expense on Checking Account (unpaid): 150.00 (MUST NOT BE in personal_expenses, total_cartao, or total_debito_contas)
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id, is_paid)
        VALUES ('tx_tp3', 'despesa', 150.00, 'Pix Alice Débito', 'Outros', '2029-01-11', '2029-01', 'acc_chk_1', 'cnt_alice', 0)
      `);
      // h) Income on Checking Account: 5000.00
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id)
        VALUES ('tx_inc1', 'receita', 5000.00, 'Salário Mensal', 'Salário', '2029-01-05', '2029-01', 'acc_chk_1', NULL)
      `);
      // i) Income on Credit Card (cashback / estorno): 50.00 (MUST NOT count as negative expense or pollute expense buckets)
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id)
        VALUES ('tx_inc2', 'INCOME', 50.00, 'Estorno Cashback CC', 'Reembolso', '2029-01-12', '2029-01', 'acc_cc_1', NULL)
      `);

      // 3. Request API summary for 2029-01
      const { status, body } = await apiRequest<any>("/api/dashboard/summary", {
        query: { month: testMonth },
      });

      expect(status).toBe(200);
      expect(body.month).toBe(testMonth);

      // Expected values:
      // Personal expenses = 450.75 + 220.50 + 85.25 + 43.50 = 800.00
      const expectedPersonal = 800.00;
      // Credit card personal = 450.75
      const expectedCartao = 450.75;
      // Debit/Accounts/Cash personal = 220.50 + 85.25 + 43.50 = 349.25
      const expectedDebito = 349.25;

      expect(body.monthly.personal_expenses).toBeCloseTo(expectedPersonal, 2);
      expect(body.monthly.total_cartao).toBeCloseTo(expectedCartao, 2);
      expect(body.monthly.total_debito_contas).toBeCloseTo(expectedDebito, 2);

      // Root aliases match monthly
      expect(body.total_cartao).toBeCloseTo(expectedCartao, 2);
      expect(body.total_debito_contas).toBeCloseTo(expectedDebito, 2);

      // INVARIANT: personal_expenses === total_cartao + total_debito_contas
      expect(body.monthly.total_cartao + body.monthly.total_debito_contas).toBeCloseTo(
        body.monthly.personal_expenses,
        4
      );

      // Third party:
      // Pending = tx_tp1 (600) + tx_tp3 (150) = 750
      expect(body.monthly.third_party_pending).toBeCloseTo(750.00, 2);
      // Total = tx_tp1 (600) + tx_tp2 (250) + tx_tp3 (150) = 1000
      expect(body.monthly.third_party_total).toBeCloseTo(1000.00, 2);

      // Income = 5000 + 50 = 5050
      expect(body.monthly.total_income).toBeCloseTo(5050.00, 2);

      // Total expenses = Personal (800) + Third Party Total (1000) = 1800
      expect(body.monthly.total_expenses).toBeCloseTo(1800.00, 2);

      // Cleanup
      await runSql(`DELETE FROM transactions WHERE id LIKE 'tx_%'`);
      await runSql(`DELETE FROM contacts WHERE id = 'cnt_alice'`);
      await runSql(`DELETE FROM accounts WHERE id IN ('acc_cc_1', 'acc_chk_1')`);
    });

    it("strictly enforces foreign keys, rejecting non-existent account or contact IDs", async () => {
      await expect(
        runSql(`
          INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id)
          VALUES ('tx_invalid_acc', 'despesa', 50, 'Invalid Acc', 'Outros', '2029-01-01', '2029-01', 'non_existent_acc_123')
        `)
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);

      await expect(
        runSql(`
          INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, contact_id)
          VALUES ('tx_invalid_cnt', 'despesa', 50, 'Invalid Cnt', 'Outros', '2029-01-01', '2029-01', 'non_existent_cnt_123')
        `)
      ).rejects.toThrow(/FOREIGN KEY constraint failed/);
    });
  });

  // =========================================================================
  // CHALLENGE 2: Boundary Months, Year Turnover & Leap Year
  // =========================================================================
  describe("Challenge 2: Boundary Months, Year Turnover & Leap Year", () => {
    it("respects invoice closing dates across year boundaries and leap years", async () => {
      // CC with closing day 15
      await runSql(`INSERT INTO accounts (id, name, type, closing_day) VALUES ('card_close15', 'Visa Close 15', 'CREDIT_CARD', 15)`);
      // CC with closing day 1 (every transaction on or after day 1 rolls to next month)
      await runSql(`INSERT INTO accounts (id, name, type, closing_day) VALUES ('card_close1', 'Elo Close 1', 'CREDIT_CARD', 1)`);
      // CC with closing day 29 (leap year test)
      await runSql(`INSERT INTO accounts (id, name, type, closing_day) VALUES ('card_close29', 'Amex Close 29', 'CREDIT_CARD', 29)`);

      // 1. Year Turnover: 2026-12-14 (before closing 15) vs 2026-12-15 (on closing 15)
      // 2026-12-14 -> mesReferencia = '2026-12'
      await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_dec_before",
          amount: 110,
          description: "Dec Before Closing",
          type: "despesa",
          date: "2026-12-14",
          account_id: "card_close15",
        },
      });
      // 2026-12-15 -> mesReferencia = '2027-01'
      await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_dec_after",
          amount: 220,
          description: "Dec After Closing (Rollover)",
          type: "despesa",
          date: "2026-12-15",
          account_id: "card_close15",
        },
      });

      // 2. Closing Day 1: 2027-01-01 -> rolls to 2027-02
      await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_jan_close1",
          amount: 330,
          description: "Jan Day 1 Roll",
          type: "despesa",
          date: "2027-01-01",
          account_id: "card_close1",
        },
      });

      // 3. Leap Year: 2024-02-28 (before closing 29) vs 2024-02-29 (on closing 29)
      // 2024-02-28 -> mesReferencia = '2024-02'
      await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_leap_28",
          amount: 400,
          description: "Feb 28 Leap",
          type: "despesa",
          date: "2024-02-28",
          account_id: "card_close29",
        },
      });
      // 2024-02-29 -> mesReferencia = '2024-03'
      await apiRequest("/api/transactions", {
        method: "POST",
        body: {
          id: "tx_leap_29",
          amount: 500,
          description: "Feb 29 Leap (Rollover to March)",
          type: "despesa",
          date: "2024-02-29",
          account_id: "card_close29",
        },
      });

      // Assert December 2026 summary
      const resDec = await apiRequest<any>("/api/dashboard/summary", { query: { month: "2026-12" } });
      expect(resDec.body.monthly.personal_expenses).toBe(110);
      expect(resDec.body.monthly.total_cartao).toBe(110);
      expect(resDec.body.monthly.total_debito_contas).toBe(0);
      expect(resDec.body.monthly.total_cartao + resDec.body.monthly.total_debito_contas).toBe(resDec.body.monthly.personal_expenses);

      // Assert January 2027 summary (tx_dec_after = 220, tx_jan_close1 rolled to Feb!)
      const resJan = await apiRequest<any>("/api/dashboard/summary", { query: { month: "2027-01" } });
      expect(resJan.body.monthly.personal_expenses).toBe(220);
      expect(resJan.body.monthly.total_cartao).toBe(220);
      expect(resJan.body.monthly.total_debito_contas).toBe(0);
      expect(resJan.body.monthly.total_cartao + resJan.body.monthly.total_debito_contas).toBe(resJan.body.monthly.personal_expenses);

      // Assert February 2027 summary (tx_jan_close1 = 330)
      const resFeb = await apiRequest<any>("/api/dashboard/summary", { query: { month: "2027-02" } });
      expect(resFeb.body.monthly.personal_expenses).toBe(330);
      expect(resFeb.body.monthly.total_cartao).toBe(330);

      // Assert Leap Year Feb 2024
      const resLeapFeb = await apiRequest<any>("/api/dashboard/summary", { query: { month: "2024-02" } });
      expect(resLeapFeb.body.monthly.personal_expenses).toBe(400);
      expect(resLeapFeb.body.monthly.total_cartao).toBe(400);

      // Assert Leap Year March 2024
      const resLeapMar = await apiRequest<any>("/api/dashboard/summary", { query: { month: "2024-03" } });
      expect(resLeapMar.body.monthly.personal_expenses).toBe(500);
      expect(resLeapMar.body.monthly.total_cartao).toBe(500);

      // Cleanup
      await runSql(`DELETE FROM transactions WHERE id IN ('tx_dec_before', 'tx_dec_after', 'tx_jan_close1', 'tx_leap_28', 'tx_leap_29')`);
      await runSql(`DELETE FROM accounts WHERE id IN ('card_close15', 'card_close1', 'card_close29')`);
    });
  });

  // =========================================================================
  // CHALLENGE 3: Empty Months, Only Credit, Only Debit, Only Income
  // =========================================================================
  describe("Challenge 3: Extreme Cardinality & Null Conditions", () => {
    it("handles completely empty month without crashing or emitting null/NaN", async () => {
      const { status, body } = await apiRequest<any>("/api/dashboard/summary", {
        query: { month: "2099-12" },
      });

      expect(status).toBe(200);
      expect(body.month).toBe("2099-12");
      expect(body.monthly.personal_expenses).toBe(0);
      expect(body.monthly.total_cartao).toBe(0);
      expect(body.monthly.total_debito_contas).toBe(0);
      expect(body.monthly.third_party_pending).toBe(0);
      expect(body.monthly.third_party_total).toBe(0);
      expect(body.monthly.total_expenses).toBe(0);
      expect(body.monthly.total_income).toBe(0);
      expect(body.monthly.balance).toBe(0);
      expect(body.total_cartao).toBe(0);
      expect(body.total_debito_contas).toBe(0);
      expect(body.categories).toEqual([]);
      expect(body.monthly.total_cartao + body.monthly.total_debito_contas).toBe(body.monthly.personal_expenses);
    });

    it("handles month with 100% credit card expenses (0 debit/accounts)", async () => {
      await runSql(`INSERT INTO accounts (id, name, type, closing_day) VALUES ('acc_pure_cc', 'Pure CC', 'CREDIT_CARD', 31)`);
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id)
        VALUES ('tx_pure_cc', 'despesa', 999.99, 'Only CC', 'Outros', '2030-01-10', '2030-01', 'acc_pure_cc')
      `);

      const { body } = await apiRequest<any>("/api/dashboard/summary", { query: { month: "2030-01" } });
      expect(body.monthly.personal_expenses).toBe(999.99);
      expect(body.monthly.total_cartao).toBe(999.99);
      expect(body.monthly.total_debito_contas).toBe(0);
      expect(body.monthly.total_cartao + body.monthly.total_debito_contas).toBe(body.monthly.personal_expenses);

      await runSql(`DELETE FROM transactions WHERE id = 'tx_pure_cc'`);
      await runSql(`DELETE FROM accounts WHERE id = 'acc_pure_cc'`);
    });

    it("handles month with 100% debit/cash expenses (0 credit card)", async () => {
      await runSql(`INSERT INTO accounts (id, name, type, closing_day) VALUES ('acc_pure_chk', 'Pure Chk', 'CHECKING_ACCOUNT', 31)`);
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id)
        VALUES ('tx_pure_chk', 'despesa', 450.00, 'Only Chk', 'Outros', '2030-02-10', '2030-02', 'acc_pure_chk')
      `);

      const { body } = await apiRequest<any>("/api/dashboard/summary", { query: { month: "2030-02" } });
      expect(body.monthly.personal_expenses).toBe(450.00);
      expect(body.monthly.total_cartao).toBe(0);
      expect(body.monthly.total_debito_contas).toBe(450.00);
      expect(body.monthly.total_cartao + body.monthly.total_debito_contas).toBe(body.monthly.personal_expenses);

      await runSql(`DELETE FROM transactions WHERE id = 'tx_pure_chk'`);
      await runSql(`DELETE FROM accounts WHERE id = 'acc_pure_chk'`);
    });
  });

  // =========================================================================
  // CHALLENGE 4: ON DELETE SET NULL Account Lifecycle Resilience
  // =========================================================================
  describe("Challenge 4: Account Deletion & Dynamic Invariant Preservation", () => {
    it("dynamically shifts credit card expense to debito_contas when account is deleted, preserving invariant", async () => {
      const month = "2031-03";
      await runSql(`INSERT INTO accounts (id, name, type, closing_day) VALUES ('acc_ephemeral_cc', 'Ephemeral CC', 'CREDIT_CARD', 31)`);
      await runSql(`
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id)
        VALUES ('tx_eph_1', 'despesa', 750.00, 'Assinatura Software', 'Serviços', '2031-03-05', '2031-03', 'acc_ephemeral_cc')
      `);

      // 1. Before account deletion: belongs to total_cartao
      const resBefore = await apiRequest<any>("/api/dashboard/summary", { query: { month } });
      expect(resBefore.body.monthly.personal_expenses).toBe(750.00);
      expect(resBefore.body.monthly.total_cartao).toBe(750.00);
      expect(resBefore.body.monthly.total_debito_contas).toBe(0);
      expect(resBefore.body.monthly.total_cartao + resBefore.body.monthly.total_debito_contas).toBe(
        resBefore.body.monthly.personal_expenses
      );

      // 2. Delete the account (ON DELETE SET NULL triggers)
      await runSql(`DELETE FROM accounts WHERE id = 'acc_ephemeral_cc'`);

      // Verify transaction account_id is now NULL
      const tx = await getSql(`SELECT account_id FROM transactions WHERE id = 'tx_eph_1'`);
      expect(tx.account_id).toBeNull();

      // 3. After deletion: safely shifts to total_debito_contas, total personal_expenses is constant!
      const resAfter = await apiRequest<any>("/api/dashboard/summary", { query: { month } });
      expect(resAfter.body.monthly.personal_expenses).toBe(750.00);
      expect(resAfter.body.monthly.total_cartao).toBe(0);
      expect(resAfter.body.monthly.total_debito_contas).toBe(750.00);
      expect(resAfter.body.monthly.total_cartao + resAfter.body.monthly.total_debito_contas).toBe(
        resAfter.body.monthly.personal_expenses
      );

      await runSql(`DELETE FROM transactions WHERE id = 'tx_eph_1'`);
    });
  });

  // =========================================================================
  // CHALLENGE 5: Property-Based Randomized Workload & Oracle Simulation
  // =========================================================================
  describe("Challenge 5: Property-Based Randomized Simulation vs Independent JS Oracle", () => {
    it("empirically matches independent oracle across 240 randomized transactions and 6 months", async () => {
      // 1. Setup accounts
      const accounts = [
        { id: "cc_oracle_1", name: "CC Closing 5", type: "CREDIT_CARD", closing_day: 5 },
        { id: "cc_oracle_2", name: "CC Closing 15", type: "CREDIT_CARD", closing_day: 15 },
        { id: "cc_oracle_3", name: "CC Closing 25", type: "CREDIT_CARD", closing_day: 25 },
        { id: "chk_oracle_1", name: "Checking Account 1", type: "CHECKING_ACCOUNT", closing_day: 5 },
        { id: "chk_oracle_2", name: "Checking Account 2", type: "CHECKING_ACCOUNT", closing_day: 5 },
      ];
      for (const a of accounts) {
        await runSql(`INSERT INTO accounts (id, name, type, closing_day) VALUES (?, ?, ?, ?)`, [
          a.id,
          a.name,
          a.type,
          a.closing_day,
        ]);
      }

      await runSql(`INSERT INTO contacts (id, name) VALUES ('contact_tp_1', 'Bob')`);
      await runSql(`INSERT INTO contacts (id, name) VALUES ('contact_tp_2', 'Charlie')`);

      const targetMonths = ["2035-01", "2035-02", "2035-03", "2035-04", "2035-05", "2035-06"];
      const rawRecords: Array<{
        id: string;
        type: string;
        amount: number;
        mesReferencia: string;
        account_id: string | null;
        contact_id: string | null;
        is_paid: number;
      }> = [];

      // Pseudo-random deterministic generator (seeded LCG)
      let seed = 42;
      function nextRandom() {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      }

      const types = ["despesa", "EXPENSE", "receita", "INCOME"];
      const accountOptions = [
        "cc_oracle_1",
        "cc_oracle_2",
        "cc_oracle_3",
        "chk_oracle_1",
        "chk_oracle_2",
        null,
      ];
      const contactOptions = [null, null, "contact_tp_1", "contact_tp_2"]; // 50% personal, 50% third-party

      // Generate 240 synthetic transactions
      for (let i = 0; i < 240; i++) {
        const id = `tx_sim_${i}`;
        const type = types[Math.floor(nextRandom() * types.length)];
        const amount = Math.round((nextRandom() * 500 + 10) * 100) / 100;
        const mesReferencia = targetMonths[Math.floor(nextRandom() * targetMonths.length)];
        const account_id = accountOptions[Math.floor(nextRandom() * accountOptions.length)];
        const contact_id = contactOptions[Math.floor(nextRandom() * contactOptions.length)];
        const is_paid = nextRandom() > 0.5 ? 1 : 0;

        rawRecords.push({
          id,
          type,
          amount,
          mesReferencia,
          account_id,
          contact_id,
          is_paid,
        });

        await runSql(
          `INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, account_id, contact_id, is_paid)
           VALUES (?, ?, ?, 'Sim Tx', 'Geral', '2035-01-10', ?, ?, ?, ?)`,
          [id, type, amount, mesReferencia, account_id, contact_id, is_paid]
        );
      }

      // Map account type lookup
      const accTypeMap = new Map<string, string>();
      for (const a of accounts) {
        accTypeMap.set(a.id, a.type);
      }

      // 2. Run verification for each of the 6 months against independent JS Oracle
      for (const m of targetMonths) {
        const monthTxs = rawRecords.filter((r) => r.mesReferencia === m);

        // Independent JS Oracle calculations:
        let oraclePersonal = 0;
        let oracleCartao = 0;
        let oracleDebito = 0;
        let oracleTpPending = 0;
        let oracleTpTotal = 0;
        let oracleTotalExpenses = 0;
        let oracleIncome = 0;

        for (const t of monthTxs) {
          const isExpense = t.type === "despesa" || t.type === "EXPENSE";
          const isIncome = t.type === "receita" || t.type === "INCOME";
          const isPersonal = isExpense && !t.contact_id;
          const isThirdParty = isExpense && Boolean(t.contact_id);

          if (isIncome) {
            oracleIncome += t.amount;
          }

          if (isExpense) {
            oracleTotalExpenses += t.amount;
          }

          if (isPersonal) {
            oraclePersonal += t.amount;
            const accType = t.account_id ? accTypeMap.get(t.account_id) : undefined;
            if (accType === "CREDIT_CARD") {
              oracleCartao += t.amount;
            } else {
              // Checking account, null account, or unknown account
              oracleDebito += t.amount;
            }
          }

          if (isThirdParty) {
            oracleTpTotal += t.amount;
            if (t.is_paid === 0) {
              oracleTpPending += t.amount;
            }
          }
        }

        // Fetch from API
        const { status, body } = await apiRequest<any>("/api/dashboard/summary", { query: { month: m } });

        expect(status).toBe(200);

        // Assert Oracle Equality (within 0.01 tolerance for floating point accumulation)
        expect(body.monthly.personal_expenses).toBeCloseTo(oraclePersonal, 2);
        expect(body.monthly.total_cartao).toBeCloseTo(oracleCartao, 2);
        expect(body.monthly.total_debito_contas).toBeCloseTo(oracleDebito, 2);
        expect(body.monthly.third_party_pending).toBeCloseTo(oracleTpPending, 2);
        expect(body.monthly.third_party_total).toBeCloseTo(oracleTpTotal, 2);
        expect(body.monthly.total_expenses).toBeCloseTo(oracleTotalExpenses, 2);
        expect(body.monthly.total_income).toBeCloseTo(oracleIncome, 2);

        // Assert Exact Mathematical Invariant for EVERY month
        const diff = Math.abs(
          body.monthly.personal_expenses - (body.monthly.total_cartao + body.monthly.total_debito_contas)
        );
        expect(diff).toBeLessThan(0.0001);
      }

      // Cleanup
      await runSql(`DELETE FROM transactions WHERE id LIKE 'tx_sim_%'`);
      await runSql(`DELETE FROM contacts WHERE id IN ('contact_tp_1', 'contact_tp_2')`);
      await runSql(`DELETE FROM accounts WHERE id LIKE '%_oracle_%'`);
    });
  });

  // =========================================================================
  // CHALLENGE 6: SQL Parameter Safety & Injection Resistance
  // =========================================================================
  describe("Challenge 6: SQL Parameter Safety & Injection Resistance", () => {
    it("handles malicious query parameters safely without leaking or crashing", async () => {
      // Injection attempts in ?month=
      const injectionAttempts = [
        "' OR '1'='1",
        "2026-11' UNION SELECT 1,2,3,4,5,6,7--",
        "'; DROP TABLE transactions; --",
        "../../../etc/passwd",
      ];

      for (const payload of injectionAttempts) {
        const { status, body } = await apiRequest<any>("/api/dashboard/summary", {
          query: { month: payload },
        });

        // The endpoint should either treat it as a literal string returning 0 matches or 200/400, but NEVER execute arbitrary SQL
        expect(status).toBe(200);
        expect(body.monthly.personal_expenses).toBe(0);
        expect(body.monthly.total_cartao).toBe(0);
        expect(body.monthly.total_debito_contas).toBe(0);
        expect(body.monthly.total_cartao + body.monthly.total_debito_contas).toBe(0);
      }

      // Verify transactions table still exists and is healthy
      const count = await getSql("SELECT COUNT(*) as cnt FROM transactions");
      expect(count.cnt).toBeGreaterThanOrEqual(0);
    });
  });
});
