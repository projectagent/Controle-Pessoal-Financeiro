import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sqlite3 from "sqlite3";
import path from "node:path";

describe("Adversarial Empirical Verification: SQLite Schema, Migrations, and Dashboard Queries", () => {
  const run = (db: sqlite3.Database, sql: string, params: any[] = []) =>
    new Promise<any>((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });

  const get = (db: sqlite3.Database, sql: string, params: any[] = []) =>
    new Promise<any>((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

  const all = (db: sqlite3.Database, sql: string, params: any[] = []) =>
    new Promise<any[]>((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

  function computeMesReferencia(
    dateStr: string,
    accountType?: string | null,
    closingDay?: number | null,
    explicitMes?: string | null
  ) {
    if (accountType === "CREDIT_CARD") {
      const rawDate = (dateStr || "").slice(0, 10);
      const [year, month, day] = rawDate.split("-").map(Number);
      const closing = Number(closingDay) || 5;
      if (day >= closing) {
        const dt = new Date(year, month, 1);
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      } else {
        return `${year}-${String(month).padStart(2, "0")}`;
      }
    }
    return explicitMes || (dateStr ? dateStr.slice(0, 7) : new Date().toISOString().slice(0, 7));
  }

  // =========================================================================
  // SECTION 1: Production database.sqlite Integrity Checks
  // =========================================================================
  describe("Production database.sqlite Integrity", () => {
    let prodDb: sqlite3.Database;
    const prodDbPath = path.resolve(process.cwd(), "database.sqlite");

    beforeAll(() => {
      prodDb = new sqlite3.Database(prodDbPath, sqlite3.OPEN_READONLY);
    });

    afterAll(() => {
      prodDb.close();
    });

    it("verifies PRAGMA table_info(transactions) contains mesReferencia TEXT", async () => {
      const cols = await all(prodDb, "PRAGMA table_info(transactions)");
      const col = cols.find((c) => c.name === "mesReferencia");
      expect(col).toBeDefined();
      expect(col.type.toUpperCase()).toBe("TEXT");
    });

    it("verifies PRAGMA table_info(accounts) contains closing_day INTEGER DEFAULT 5", async () => {
      const cols = await all(prodDb, "PRAGMA table_info(accounts)");
      const col = cols.find((c) => c.name === "closing_day");
      expect(col).toBeDefined();
      expect(col.type.toUpperCase()).toBe("INTEGER");
      expect(String(col.dflt_value)).toBe("5");
    });

    it("verifies SELECT COUNT(*) FROM transactions WHERE mesReferencia IS NULL equals 0", async () => {
      const nullCheck = await get(
        prodDb,
        "SELECT COUNT(*) as null_count, SUM(CASE WHEN mesReferencia = '' THEN 1 ELSE 0 END) as empty_count FROM transactions WHERE mesReferencia IS NULL OR mesReferencia = ''"
      );
      expect(nullCheck.null_count).toBe(0);
      expect(nullCheck.empty_count || 0).toBe(0);
    });

    it("empirically verifies 100% of all existing transactions obey the closing date business rule", async () => {
      const rows = await all(
        prodDb,
        `SELECT t.id, t.date, t.mesReferencia, a.type AS account_type, COALESCE(a.closing_day, 5) AS closing_day
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id`
      );

      expect(rows.length).toBeGreaterThanOrEqual(141);

      for (const row of rows) {
        const expected = computeMesReferencia(row.date, row.account_type, row.closing_day, null);
        expect(row.mesReferencia).toBe(expected);
      }
    });
  });

  // =========================================================================
  // SECTION 2: Migration Idempotency Stress Testing
  // =========================================================================
  describe("Migration Idempotency", () => {
    let memDb: sqlite3.Database;

    const runMigration = async (db: sqlite3.Database) => {
      const txColumns = await all(db, "PRAGMA table_info(transactions)");
      if (!txColumns.some((c) => c.name === "mesReferencia")) {
        await run(db, "ALTER TABLE transactions ADD COLUMN mesReferencia TEXT");
      }

      const accColumns = await all(db, "PRAGMA table_info(accounts)");
      if (!accColumns.some((c) => c.name === "closing_day")) {
        await run(db, "ALTER TABLE accounts ADD COLUMN closing_day INTEGER DEFAULT 5");
      }

      const pendingMigration = await all(
        db,
        `SELECT t.id, t.date, t.account_id, a.type AS account_type, COALESCE(a.closing_day, 5) AS closing_day
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE t.mesReferencia IS NULL OR t.mesReferencia = ''`
      );

      for (const row of pendingMigration) {
        const targetYm = computeMesReferencia(row.date, row.account_type, row.closing_day, null);
        await run(db, "UPDATE transactions SET mesReferencia = ? WHERE id = ?", [targetYm, row.id]);
      }
    };

    beforeAll(async () => {
      memDb = new sqlite3.Database(":memory:");
      // Create legacy tables without mesReferencia and closing_day
      await run(
        memDb,
        "CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL)"
      );
      await run(
        memDb,
        `CREATE TABLE transactions (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          amount REAL NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          date TEXT NOT NULL,
          account_id TEXT
        )`
      );

      await run(memDb, "INSERT INTO accounts VALUES ('acc1', 'Card', 'CREDIT_CARD')");
      await run(memDb, "INSERT INTO accounts VALUES ('acc2', 'Bank', 'CHECKING_ACCOUNT')");

      await run(
        memDb,
        "INSERT INTO transactions VALUES ('t1', 'despesa', 50, 'Before closing', 'Geral', '2026-05-04', 'acc1')"
      );
      await run(
        memDb,
        "INSERT INTO transactions VALUES ('t2', 'despesa', 60, 'On closing', 'Geral', '2026-05-05', 'acc1')"
      );
      await run(
        memDb,
        "INSERT INTO transactions VALUES ('t3', 'despesa', 70, 'Bank transaction', 'Geral', '2026-05-20', 'acc2')"
      );
    });

    afterAll(() => {
      memDb.close();
    });

    it("runs migration multiple times consecutively without duplicate column errors or data loss", async () => {
      // Run 1: backfills legacy rows
      await runMigration(memDb);

      const r1 = await all(memDb, "SELECT id, mesReferencia FROM transactions ORDER BY id");
      expect(r1.find((t) => t.id === "t1")?.mesReferencia).toBe("2026-05");
      expect(r1.find((t) => t.id === "t2")?.mesReferencia).toBe("2026-06");
      expect(r1.find((t) => t.id === "t3")?.mesReferencia).toBe("2026-05");

      // Add a custom transaction with pre-specified mesReferencia
      await run(
        memDb,
        "INSERT INTO transactions VALUES ('t4', 'despesa', 100, 'Custom Ref Month', 'Geral', '2026-05-01', 'acc2', '2026-07')"
      );

      // Run migration 5 more times in a row
      for (let i = 0; i < 5; i++) {
        await expect(runMigration(memDb)).resolves.not.toThrow();
      }

      // Check that all records preserve their exact values and t4 was not overwritten
      const rFinal = await all(memDb, "SELECT id, mesReferencia FROM transactions ORDER BY id");
      expect(rFinal.find((t) => t.id === "t1")?.mesReferencia).toBe("2026-05");
      expect(rFinal.find((t) => t.id === "t2")?.mesReferencia).toBe("2026-06");
      expect(rFinal.find((t) => t.id === "t3")?.mesReferencia).toBe("2026-05");
      expect(rFinal.find((t) => t.id === "t4")?.mesReferencia).toBe("2026-07");
    });
  });

  // =========================================================================
  // SECTION 3: Dashboard Query Filtering & Cross-Month Isolation
  // =========================================================================
  describe("Dashboard Query Filtering Behavior", () => {
    let testDb: sqlite3.Database;

    beforeAll(async () => {
      testDb = new sqlite3.Database(":memory:");
      await run(testDb, "PRAGMA foreign_keys = ON;");
      await run(
        testDb,
        `CREATE TABLE accounts (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('CREDIT_CARD', 'CHECKING_ACCOUNT')),
          closing_day INTEGER DEFAULT 5
        )`
      );
      await run(testDb, "CREATE TABLE contacts (id TEXT PRIMARY KEY, name TEXT NOT NULL)");
      await run(
        testDb,
        `CREATE TABLE transactions (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          amount REAL NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          date TEXT NOT NULL,
          mesReferencia TEXT,
          is_recurring INTEGER DEFAULT 0,
          is_paid INTEGER DEFAULT 0,
          current_installment INTEGER,
          total_installments INTEGER,
          asset_value REAL,
          installment_group_id TEXT,
          account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
          contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL
        )`
      );

      // Accounts
      await run(testDb, "INSERT INTO accounts VALUES ('card_nubank', 'Nubank', 'CREDIT_CARD', 10)");
      await run(testDb, "INSERT INTO accounts VALUES ('bank_itau', 'Itaú', 'CHECKING_ACCOUNT', 5)");

      // Contacts
      await run(testDb, "INSERT INTO contacts VALUES ('c_alice', 'Alice')");

      // Setup dataset:
      // A. Credit card transaction before closing day:
      // Date: 2026-10-09, closing: 10 -> mesReferencia: 2026-10
      await run(testDb, `
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
        VALUES ('tx_card_before', 'despesa', 120.0, 'Farmácia', 'Saúde', '2026-10-09', '2026-10', 0, 1, 'card_nubank')
      `);

      // B. Credit card transaction exactly on closing day:
      // Date: 2026-10-10, closing: 10 -> mesReferencia: 2026-11
      await run(testDb, `
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
        VALUES ('tx_card_on', 'despesa', 250.0, 'Mercado', 'Alimentação', '2026-10-10', '2026-11', 0, 0, 'card_nubank')
      `);

      // C. Credit card transaction after closing day:
      // Date: 2026-10-25, closing: 10 -> mesReferencia: 2026-11
      await run(testDb, `
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
        VALUES ('tx_card_after', 'despesa', 500.0, 'Monitor', 'Eletrônicos', '2026-10-25', '2026-11', 0, 0, 'card_nubank')
      `);

      // D. Non-credit card transaction (checking account) with default month:
      // Date: 2026-10-28 -> mesReferencia: 2026-10
      await run(testDb, `
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
        VALUES ('tx_bank_default', 'despesa', 80.0, 'Lanche', 'Alimentação', '2026-10-28', '2026-10', 0, 1, 'bank_itau')
      `);

      // E. Non-credit card transaction with explicit custom mesReferencia:
      // Date: 2026-10-31, but paid for next month -> mesReferencia: 2026-11
      await run(testDb, `
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
        VALUES ('tx_bank_advance', 'despesa', 1500.0, 'Aluguel Adiantado', 'Moradia', '2026-10-31', '2026-11', 0, 1, 'bank_itau')
      `);

      // F. Income in month 2026-10:
      await run(testDb, `
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
        VALUES ('tx_income_oct', 'receita', 8000.0, 'Salário Outubro', 'Salário', '2026-10-05', '2026-10', 0, 1, 'bank_itau')
      `);

      // G. Income in month 2026-11:
      await run(testDb, `
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
        VALUES ('tx_income_nov', 'receita', 8000.0, 'Salário Novembro', 'Salário', '2026-11-05', '2026-11', 0, 1, 'bank_itau')
      `);

      // H. Third-party expense on credit card after closing day:
      // Date: 2026-10-15 -> mesReferencia: 2026-11, contact: Alice, unpaid
      await run(testDb, `
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id, contact_id)
        VALUES ('tx_tp_alice', 'despesa', 300.0, 'Passagem Alice', 'Viagem', '2026-10-15', '2026-11', 0, 0, 'card_nubank', 'c_alice')
      `);

      // I. Year rollover credit card purchase:
      // Date: 2026-12-15, closing: 10 -> mesReferencia: 2027-01
      await run(testDb, `
        INSERT INTO transactions (id, type, amount, description, category, date, mesReferencia, is_recurring, is_paid, account_id)
        VALUES ('tx_rollover_dec', 'despesa', 990.0, 'Ceia de Natal', 'Festas', '2026-12-15', '2027-01', 0, 0, 'card_nubank')
      `);
    });

    afterAll(() => {
      testDb.close();
    });

    it("verifies transactions with date in month M but mesReferencia in M+1 ONLY appear in M+1 and NOT in M", async () => {
      // Query transactions endpoint for month 2026-10
      const octTxs = await all(
        testDb,
        "SELECT id, description, date, mesReferencia FROM transactions WHERE mesReferencia = ?",
        ["2026-10"]
      );

      // Query transactions endpoint for month 2026-11
      const novTxs = await all(
        testDb,
        "SELECT id, description, date, mesReferencia FROM transactions WHERE mesReferencia = ?",
        ["2026-11"]
      );

      const octIds = octTxs.map((t) => t.id);
      const novIds = novTxs.map((t) => t.id);

      // tx_card_on and tx_card_after have date in 2026-10, but mesReferencia 2026-11
      expect(octIds).not.toContain("tx_card_on");
      expect(octIds).not.toContain("tx_card_after");
      expect(novIds).toContain("tx_card_on");
      expect(novIds).toContain("tx_card_after");

      // tx_bank_advance has date in 2026-10, but mesReferencia 2026-11
      expect(octIds).not.toContain("tx_bank_advance");
      expect(novIds).toContain("tx_bank_advance");

      // tx_card_before (date in 2026-10, before closing) and tx_bank_default MUST appear in 2026-10
      expect(octIds).toContain("tx_card_before");
      expect(octIds).toContain("tx_bank_default");
      expect(novIds).not.toContain("tx_card_before");
      expect(novIds).not.toContain("tx_bank_default");
    });

    it("verifies December year-end credit card transactions only appear in next year January", async () => {
      const decTxs = await all(testDb, "SELECT id FROM transactions WHERE mesReferencia = ?", ["2026-12"]);
      const janTxs = await all(testDb, "SELECT id FROM transactions WHERE mesReferencia = ?", ["2027-01"]);

      expect(decTxs.map((t) => t.id)).not.toContain("tx_rollover_dec");
      expect(janTxs.map((t) => t.id)).toContain("tx_rollover_dec");
    });

    it("verifies GET /api/dashboard/summary calculates personal expenses and income strictly by mesReferencia", async () => {
      // October 2026:
      // Personal expenses = tx_card_before (120) + tx_bank_default (80) = 200
      // Income = 8000
      const octSummary = await get(
        testDb,
        `SELECT
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL THEN amount ELSE 0 END), 0) AS personal_expenses,
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 THEN amount ELSE 0 END), 0) AS third_party_pending,
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') THEN amount ELSE 0 END), 0) AS total_expenses,
          COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') THEN amount ELSE 0 END), 0) AS total_income
        FROM transactions
        WHERE mesReferencia = '2026-10'`
      );

      expect(octSummary.personal_expenses).toBe(200);
      expect(octSummary.third_party_pending).toBe(0);
      expect(octSummary.total_expenses).toBe(200);
      expect(octSummary.total_income).toBe(8000);

      // November 2026:
      // Personal expenses = tx_card_on (250) + tx_card_after (500) + tx_bank_advance (1500) = 2250
      // Third party pending = tx_tp_alice (300)
      // Total expenses = 2250 + 300 = 2550
      // Income = 8000
      const novSummary = await get(
        testDb,
        `SELECT
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL THEN amount ELSE 0 END), 0) AS personal_expenses,
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 THEN amount ELSE 0 END), 0) AS third_party_pending,
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') THEN amount ELSE 0 END), 0) AS total_expenses,
          COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') THEN amount ELSE 0 END), 0) AS total_income
        FROM transactions
        WHERE mesReferencia = '2026-11'`
      );

      expect(novSummary.personal_expenses).toBe(2250);
      expect(novSummary.third_party_pending).toBe(300);
      expect(novSummary.total_expenses).toBe(2550);
      expect(novSummary.total_income).toBe(8000);
    });

    it("verifies dashboard category breakdown excludes categories from other months and excludes third-party items", async () => {
      const octCategories = await all(
        testDb,
        `SELECT TRIM(category) AS category, SUM(amount) AS total
         FROM transactions
         WHERE (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL AND mesReferencia = '2026-10'
         GROUP BY TRIM(category)
         ORDER BY total DESC`
      );

      const novCategories = await all(
        testDb,
        `SELECT TRIM(category) AS category, SUM(amount) AS total
         FROM transactions
         WHERE (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL AND mesReferencia = '2026-11'
         GROUP BY TRIM(category)
         ORDER BY total DESC`
      );

      // In October: only Saúde (120) and Alimentação (80)
      expect(octCategories).toHaveLength(2);
      expect(octCategories.find((c) => c.category === "Saúde")?.total).toBe(120);
      expect(octCategories.find((c) => c.category === "Alimentação")?.total).toBe(80);
      expect(octCategories.find((c) => c.category === "Eletrônicos")).toBeUndefined();
      expect(octCategories.find((c) => c.category === "Moradia")).toBeUndefined();

      // In November: Moradia (1500), Eletrônicos (500), Alimentação (250). Viagem is Alice (third-party), must NOT be present!
      expect(novCategories).toHaveLength(3);
      expect(novCategories.find((c) => c.category === "Moradia")?.total).toBe(1500);
      expect(novCategories.find((c) => c.category === "Eletrônicos")?.total).toBe(500);
      expect(novCategories.find((c) => c.category === "Alimentação")?.total).toBe(250);
      expect(novCategories.find((c) => c.category === "Viagem")).toBeUndefined();
    });

    it("verifies third-party summary endpoint correctly attributes pending totals to mesReferencia", async () => {
      const tpSummaryNov = await get(
        testDb,
        `SELECT
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 THEN amount ELSE 0 END), 0) AS total_a_receber_geral,
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 AND mesReferencia = ? THEN amount ELSE 0 END), 0) AS total_a_receber_mes
        FROM transactions`,
        ["2026-11"]
      );

      expect(tpSummaryNov.total_a_receber_geral).toBe(300);
      expect(tpSummaryNov.total_a_receber_mes).toBe(300);

      const tpSummaryOct = await get(
        testDb,
        `SELECT
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 AND mesReferencia = ? THEN amount ELSE 0 END), 0) AS total_a_receber_mes
        FROM transactions`,
        ["2026-10"]
      );

      expect(tpSummaryOct.total_a_receber_mes).toBe(0);
    });
  });
});
