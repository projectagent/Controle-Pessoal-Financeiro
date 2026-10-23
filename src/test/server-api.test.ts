import { describe, it, expect, beforeAll, afterAll } from "vitest";
import sqlite3 from "sqlite3";
import express from "express";
import cors from "cors";

describe("SQLite and Express Backend Integration", () => {
  let db: sqlite3.Database;

  const run = (sql: string, params: any[] = []) =>
    new Promise<any>((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });

  const get = (sql: string, params: any[] = []) =>
    new Promise<any>((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

  const all = (sql: string, params: any[] = []) =>
    new Promise<any[]>((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });

  beforeAll(async () => {
    db = new sqlite3.Database(":memory:");
    await run("PRAGMA foreign_keys = ON;");

    // 1. Accounts schema
    await run(`
      CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('CREDIT_CARD', 'CHECKING_ACCOUNT'))
      )
    `);

    // 2. Contacts schema
    await run(`
      CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    // 3. Transactions schema with foreign keys
    await run(`
      CREATE TABLE transactions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        is_recurring INTEGER DEFAULT 0,
        is_paid INTEGER DEFAULT 0,
        current_installment INTEGER,
        total_installments INTEGER,
        asset_value REAL,
        installment_group_id TEXT,
        account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
        contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL
      )
    `);
  });

  afterAll(() => {
    db.close();
  });

  it("creates accounts and enforces type constraint", async () => {
    await run("INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)", ["acc1", "Nubank", "CREDIT_CARD"]);
    await run("INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)", ["acc2", "Itaú", "CHECKING_ACCOUNT"]);

    const rows = await all("SELECT * FROM accounts ORDER BY name");
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe("Itaú");
    expect(rows[1].name).toBe("Nubank");

    // Invalid type should fail
    await expect(
      run("INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)", ["acc3", "Poupança", "INVALID"])
    ).rejects.toThrow();
  });

  it("creates contacts and links to transactions via foreign keys", async () => {
    await run("INSERT INTO contacts (id, name) VALUES (?, ?)", ["c1", "João"]);
    await run("INSERT INTO contacts (id, name) VALUES (?, ?)", ["c2", "Maria"]);

    const contacts = await all("SELECT * FROM contacts");
    expect(contacts).toHaveLength(2);

    // Insert transaction linked to account and contact
    await run(`
      INSERT INTO transactions (id, type, amount, description, category, date, is_recurring, is_paid, account_id, contact_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ["tx1", "despesa", 100, "Almoço com João", "Alimentação", "2026-10-15", 0, 0, "acc1", "c1"]);

    const tx = await get("SELECT * FROM transactions WHERE id = ?", ["tx1"]);
    expect(tx).toBeDefined();
    expect(tx.amount).toBe(100);
    expect(tx.contact_id).toBe("c1");
    expect(tx.account_id).toBe("acc1");
  });

  it("computes Dashboard SQL summary correctly isolating personal expenses and third-party pending", async () => {
    // Income
    await run(`
      INSERT INTO transactions (id, type, amount, description, category, date, is_recurring, is_paid, account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ["tx2", "receita", 5000, "Salário", "Salário", "2026-10-01", 0, 1, "acc2"]);

    // Personal expense
    await run(`
      INSERT INTO transactions (id, type, amount, description, category, date, is_recurring, is_paid, account_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ["tx3", "despesa", 1500, "Aluguel", "Moradia", "2026-10-05", 0, 1, "acc2"]);

    // Third-party expense already paid
    await run(`
      INSERT INTO transactions (id, type, amount, description, category, date, is_recurring, is_paid, account_id, contact_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ["tx4", "despesa", 50, "Uber João Quitado", "Transporte", "2026-10-10", 0, 1, "acc1", "c1"]);

    // Calculate current balance: Income (5000) - All Expenses (100 + 1500 + 50 = 1650) = 3350
    const balanceResult = await get(`
      SELECT 
        COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') THEN amount ELSE 0 END), 0) AS current_balance
      FROM transactions
    `);
    expect(balanceResult.current_balance).toBe(3350);

    // Calculate monthly breakdown for October 2026
    const monthlyResult = await get(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'despesa' AND contact_id IS NULL THEN amount ELSE 0 END), 0) AS personal_expenses,
        COALESCE(SUM(CASE WHEN type = 'despesa' AND contact_id IS NOT NULL AND is_paid = 0 THEN amount ELSE 0 END), 0) AS third_party_pending,
        COALESCE(SUM(CASE WHEN type = 'despesa' THEN amount ELSE 0 END), 0) AS total_expenses,
        COALESCE(SUM(CASE WHEN type = 'receita' THEN amount ELSE 0 END), 0) AS total_income
      FROM transactions
      WHERE date LIKE '2026-10%'
    `);

    expect(monthlyResult.personal_expenses).toBe(1500); // Only personal
    expect(monthlyResult.third_party_pending).toBe(100); // Only pending third party (tx1)
    expect(monthlyResult.total_expenses).toBe(1650); // 1500 + 100 + 50
    expect(monthlyResult.total_income).toBe(5000);
  });

  it("computes Third-Party SQL summary grouped by contact", async () => {
    const contactsSummary = await all(`
      SELECT 
        c.id,
        c.name,
        COALESCE(SUM(CASE WHEN t.type = 'despesa' AND t.is_paid = 0 THEN t.amount ELSE 0 END), 0) AS total_a_receber_geral,
        COALESCE(SUM(CASE WHEN t.type = 'despesa' AND t.is_paid = 0 AND t.date LIKE '2026-10%' THEN t.amount ELSE 0 END), 0) AS total_a_receber_mes,
        COALESCE(SUM(CASE WHEN t.type = 'despesa' AND t.is_paid = 1 THEN t.amount ELSE 0 END), 0) AS total_pago_historico
      FROM contacts c
      LEFT JOIN transactions t ON c.id = t.contact_id
      GROUP BY c.id, c.name
      ORDER BY c.name ASC
    `);

    const joao = contactsSummary.find((c) => c.name === "João");
    const maria = contactsSummary.find((c) => c.name === "Maria");

    expect(joao?.total_a_receber_geral).toBe(100);
    expect(joao?.total_a_receber_mes).toBe(100);
    expect(joao?.total_pago_historico).toBe(50);

    expect(maria?.total_a_receber_geral).toBe(0);
    expect(maria?.total_a_receber_mes).toBe(0);
  });
  it("resets database deleting all operational records while preserving schema", async () => {
    await run("PRAGMA foreign_keys = OFF;");
    await run("DELETE FROM transactions;");
    await run("DELETE FROM contacts;");
    await run("DELETE FROM accounts;");
    await run("PRAGMA foreign_keys = ON;");

    const txCount = await get("SELECT COUNT(*) as count FROM transactions");
    const accCount = await get("SELECT COUNT(*) as count FROM accounts");
    const contactCount = await get("SELECT COUNT(*) as count FROM contacts");

    expect(txCount.count).toBe(0);
    expect(accCount.count).toBe(0);
    expect(contactCount.count).toBe(0);

    // Schema is still intact and can insert new items
    await run("INSERT INTO accounts (id, name, type) VALUES ('a_new', 'Novo Banco', 'CHECKING_ACCOUNT')");
    const newAcc = await get("SELECT * FROM accounts WHERE id = 'a_new'");
    expect(newAcc.name).toBe("Novo Banco");
  });
});