import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDbPath = path.resolve(__dirname, '../database.sqlite');
const PORT = process.env.PORT || 3001;

export function computeMesReferencia(dateStr, accountType, closingDay, explicitMes) {
  if (accountType === 'CREDIT_CARD') {
    const rawDate = (dateStr || '').slice(0, 10);
    const [year, month, day] = rawDate.split('-').map(Number);
    const closing = Number(closingDay) || 5;
    if (day >= closing) {
      const dt = new Date(year, month, 1);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
    } else {
      return `${year}-${String(month).padStart(2, '0')}`;
    }
  }
  return explicitMes || (dateStr ? dateStr.slice(0, 7) : new Date().toISOString().slice(0, 7));
}

export function serializeTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    description: row.description,
    category: row.category,
    date: row.date,
    mesReferencia: row.mesReferencia || (row.date ? row.date.slice(0, 7) : null),
    is_recurring: Boolean(row.is_recurring),
    is_paid: Boolean(row.is_paid),
    current_installment: row.current_installment != null ? Number(row.current_installment) : null,
    total_installments: row.total_installments != null ? Number(row.total_installments) : null,
    asset_value: row.asset_value != null ? Number(row.asset_value) : null,
    installment_group_id: row.installment_group_id || null,
    account_id: row.account_id || null,
    contact_id: row.contact_id || null,
    // Frontend compatibility aliases:
    tipo: row.type,
    valor: Number(row.amount),
    descricao: row.description,
    categoria: row.category,
    data: row.date,
    parcela: row.current_installment != null ? Number(row.current_installment) : undefined,
    totalParcelas: row.total_installments != null ? Number(row.total_installments) : undefined,
    valorBem: row.asset_value != null ? Number(row.asset_value) : undefined,
    grupoParcelasId: row.installment_group_id || undefined,
    expense_owner: row.contact_id ? 'Terceiros' : 'Próprio',
  };
}

export function normalizeTransactionInput(body) {
  return {
    id: body.id || Math.random().toString(36).slice(2) + Date.now().toString(36),
    type: body.type || body.tipo || 'despesa',
    amount: Number(body.amount ?? body.valor ?? 0),
    description: (body.description ?? body.descricao ?? '').trim(),
    category: body.category || body.categoria || 'Outros',
    date: body.date || body.data || new Date().toISOString().slice(0, 10),
    mesReferencia: body.mesReferencia || body.mes_referencia || null,
    is_recurring: body.is_recurring ? 1 : 0,
    is_paid: body.is_paid ? 1 : 0,
    current_installment: body.current_installment ?? body.parcela ?? null,
    total_installments: body.total_installments ?? body.totalParcelas ?? null,
    asset_value: body.asset_value ?? body.valorBem ?? null,
    installment_group_id: body.installment_group_id || body.grupoParcelasId || null,
    account_id: body.account_id || null,
    contact_id: body.contact_id || null,
  };
}

export function createApp(options = {}) {
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const targetDbPath = options.dbPath ?? (options.db ? null : (isTest ? ':memory:' : defaultDbPath));
  const silent = Boolean(options.silent);

  const db = options.db ?? new sqlite3.Database(targetDbPath, (err) => {
    if (err) {
      if (!silent) console.error('Failed to open database at', targetDbPath, err);
    } else {
      if (!silent) console.log(`Connected to SQLite database at: ${targetDbPath}`);
    }
  });

  // Helper for db run promises
  function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  // Helper for db all promises
  function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Helper for db get promises
  function getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  function closeDatabase() {
    return new Promise((resolve, reject) => {
      db.close((err) => (err ? reject(err) : resolve()));
    });
  }

  // Schema creation and retroactive migration
  async function initDatabase() {
    await runAsync('PRAGMA foreign_keys = ON;');

    await runAsync(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('CREDIT_CARD', 'CHECKING_ACCOUNT')),
        closing_day INTEGER DEFAULT 5
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS contacts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS transactions (
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
      )
    `);

    // Check and add mesReferencia if table already existed without it
    const txColumns = await allAsync('PRAGMA table_info(transactions)');
    if (!txColumns.some((c) => c.name === 'mesReferencia')) {
      await runAsync('ALTER TABLE transactions ADD COLUMN mesReferencia TEXT');
    }

    // Check and add closing_day if table already existed without it
    const accColumns = await allAsync('PRAGMA table_info(accounts)');
    if (!accColumns.some((c) => c.name === 'closing_day')) {
      await runAsync('ALTER TABLE accounts ADD COLUMN closing_day INTEGER DEFAULT 5');
    }

    // Retroactive migration for all existing rows where mesReferencia is NULL or empty
    const pendingMigration = await allAsync(`
      SELECT t.id, t.date, t.account_id, a.type AS account_type, COALESCE(a.closing_day, 5) AS closing_day
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.mesReferencia IS NULL OR t.mesReferencia = ''
    `);

    for (const row of pendingMigration) {
      const targetYm = computeMesReferencia(
        row.date,
        row.account_type,
        row.closing_day,
        null
      );
      await runAsync('UPDATE transactions SET mesReferencia = ? WHERE id = ?', [targetYm, row.id]);
    }
  }

  const app = express();
  app.use(cors());
  app.use(express.json());

  // -------------------------------------------------------------
  // API Endpoints
  // -------------------------------------------------------------

  // Accounts CRUD
  app.get('/api/accounts', async (req, res) => {
    try {
      const rows = await allAsync('SELECT id, name, type, closing_day FROM accounts ORDER BY name ASC');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/accounts', async (req, res) => {
    try {
      const { name, type, closing_day, closingDay, fechamento } = req.body;
      if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
      const id = req.body.id || Math.random().toString(36).slice(2) + Date.now().toString(36);
      const cDay = closing_day ?? closingDay ?? fechamento ?? 5;
      await runAsync('INSERT INTO accounts (id, name, type, closing_day) VALUES (?, ?, ?, ?)', [id, name.trim(), type, Number(cDay) || 5]);
      const created = await getAsync('SELECT * FROM accounts WHERE id = ?', [id]);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/accounts/:id', async (req, res) => {
    try {
      const { name, type, closing_day, closingDay, fechamento } = req.body;
      const { id } = req.params;
      const cDay = closing_day ?? closingDay ?? fechamento;
      await runAsync(
        'UPDATE accounts SET name = COALESCE(?, name), type = COALESCE(?, type), closing_day = COALESCE(?, closing_day) WHERE id = ?',
        [name?.trim(), type, cDay != null ? Number(cDay) : null, id]
      );
      const updated = await getAsync('SELECT * FROM accounts WHERE id = ?', [id]);
      if (!updated) return res.status(404).json({ error: 'Account not found' });

      if (cDay != null && updated.type === 'CREDIT_CARD') {
        const txs = await allAsync('SELECT id, date FROM transactions WHERE account_id = ?', [id]);
        for (const tx of txs) {
          const newMes = computeMesReferencia(tx.date, 'CREDIT_CARD', Number(cDay), null);
          await runAsync('UPDATE transactions SET mesReferencia = ? WHERE id = ?', [newMes, tx.id]);
        }
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/accounts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await runAsync('DELETE FROM accounts WHERE id = ?', [id]);
      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Contacts CRUD
  app.get('/api/contacts', async (req, res) => {
    try {
      const rows = await allAsync('SELECT id, name FROM contacts ORDER BY name ASC');
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/contacts', async (req, res) => {
    try {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      const id = req.body.id || Math.random().toString(36).slice(2) + Date.now().toString(36);
      await runAsync('INSERT INTO contacts (id, name) VALUES (?, ?)', [id, name.trim()]);
      const created = await getAsync('SELECT * FROM contacts WHERE id = ?', [id]);
      res.status(201).json(created);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/contacts/:id', async (req, res) => {
    try {
      const { name } = req.body;
      const { id } = req.params;
      await runAsync('UPDATE contacts SET name = ? WHERE id = ?', [name.trim(), id]);
      const updated = await getAsync('SELECT * FROM contacts WHERE id = ?', [id]);
      if (!updated) return res.status(404).json({ error: 'Contact not found' });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/contacts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await runAsync('DELETE FROM contacts WHERE id = ?', [id]);
      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Transactions CRUD
  app.get('/api/transactions', async (req, res) => {
    try {
      const { month, contact_id, account_id, category, is_paid } = req.query;
      let sql = 'SELECT * FROM transactions WHERE 1=1';
      const params = [];

      if (month) {
        sql += ' AND mesReferencia = ?';
        params.push(month);
      }
      if (contact_id) {
        sql += ' AND contact_id = ?';
        params.push(contact_id);
      }
      if (account_id) {
        sql += ' AND account_id = ?';
        params.push(account_id);
      }
      if (category) {
        sql += ' AND category = ?';
        params.push(category);
      }
      if (is_paid !== undefined) {
        sql += ' AND is_paid = ?';
        params.push(Number(is_paid));
      }

      sql += ' ORDER BY date DESC, id DESC';
      const rows = await allAsync(sql, params);
      res.json(rows.map(serializeTransaction));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/transactions/:id', async (req, res) => {
    try {
      const row = await getAsync('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
      if (!row) return res.status(404).json({ error: 'Transaction not found' });
      res.json(serializeTransaction(row));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/transactions', async (req, res) => {
    try {
      const items = Array.isArray(req.body) ? req.body : [req.body];
      const inserted = [];

      for (const raw of items) {
        const t = normalizeTransactionInput(raw);
        let account = null;
        if (t.account_id) {
          account = await getAsync('SELECT type, COALESCE(closing_day, 5) AS closing_day FROM accounts WHERE id = ?', [t.account_id]);
        }
        t.mesReferencia = computeMesReferencia(
          t.date,
          account?.type,
          account?.closing_day,
          raw.mesReferencia || raw.mes_referencia
        );

        await runAsync(
          `INSERT INTO transactions (
            id, type, amount, description, category, date, mesReferencia,
            is_recurring, is_paid, current_installment, total_installments,
            asset_value, installment_group_id, account_id, contact_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.id,
            t.type,
            t.amount,
            t.description,
            t.category,
            t.date,
            t.mesReferencia,
            t.is_recurring,
            t.is_paid,
            t.current_installment,
            t.total_installments,
            t.asset_value,
            t.installment_group_id,
            t.account_id,
            t.contact_id,
          ]
        );
        const row = await getAsync('SELECT * FROM transactions WHERE id = ?', [t.id]);
        inserted.push(serializeTransaction(row));
      }

      if (Array.isArray(req.body)) {
        res.status(201).json(inserted);
      } else {
        res.status(201).json(inserted[0]);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/transactions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const existing = await getAsync('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!existing) return res.status(404).json({ error: 'Transaction not found' });

      const normalized = normalizeTransactionInput({ ...existing, ...req.body, id });
      let account = null;
      if (normalized.account_id) {
        account = await getAsync('SELECT type, COALESCE(closing_day, 5) AS closing_day FROM accounts WHERE id = ?', [normalized.account_id]);
      }
      normalized.mesReferencia = computeMesReferencia(
        normalized.date,
        account?.type,
        account?.closing_day,
        req.body.mesReferencia || req.body.mes_referencia || existing.mesReferencia
      );

      await runAsync(
        `UPDATE transactions SET
          type = ?, amount = ?, description = ?, category = ?, date = ?, mesReferencia = ?,
          is_recurring = ?, is_paid = ?, current_installment = ?, total_installments = ?,
          asset_value = ?, installment_group_id = ?, account_id = ?, contact_id = ?
        WHERE id = ?`,
        [
          normalized.type,
          normalized.amount,
          normalized.description,
          normalized.category,
          normalized.date,
          normalized.mesReferencia,
          normalized.is_recurring,
          normalized.is_paid,
          normalized.current_installment,
          normalized.total_installments,
          normalized.asset_value,
          normalized.installment_group_id,
          normalized.account_id,
          normalized.contact_id,
          id,
        ]
      );

      const updated = await getAsync('SELECT * FROM transactions WHERE id = ?', [id]);
      res.json(serializeTransaction(updated));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/transactions/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await runAsync('DELETE FROM transactions WHERE id = ?', [id]);
      res.json({ success: true, id });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update an entire group of installments
  app.put('/api/transactions/group/:installment_group_id', async (req, res) => {
    try {
      const { installment_group_id } = req.params;
      const { description, descricao, amount, valor, category, categoria, contact_id } = req.body;
      const fields = [];
      const params = [];

      if (description || descricao) {
        fields.push('description = ?');
        params.push((description || descricao).trim());
      }
      if (amount !== undefined || valor !== undefined) {
        fields.push('amount = ?');
        params.push(Number(amount ?? valor));
      }
      if (category || categoria) {
        fields.push('category = ?');
        params.push((category || categoria).trim());
      }
      if (contact_id !== undefined) {
        fields.push('contact_id = ?');
        params.push(contact_id || null);
      }

      if (fields.length > 0) {
        params.push(installment_group_id);
        await runAsync('UPDATE transactions SET ' + fields.join(', ') + ' WHERE installment_group_id = ?', params);
      }

      const rows = await allAsync('SELECT * FROM transactions WHERE installment_group_id = ?', [installment_group_id]);
      res.json(rows.map(serializeTransaction));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete an entire group of installments (consortium / financing)
  app.delete('/api/transactions/group/:installment_group_id', async (req, res) => {
    try {
      const { installment_group_id } = req.params;
      const result = await runAsync('DELETE FROM transactions WHERE installment_group_id = ?', [installment_group_id]);
      res.json({ success: true, installment_group_id, changes: result.changes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Toggle paid status
  app.patch('/api/transactions/:id/toggle-paid', async (req, res) => {
    try {
      const { id } = req.params;
      const current = await getAsync('SELECT is_paid FROM transactions WHERE id = ?', [id]);
      if (!current) return res.status(404).json({ error: 'Transaction not found' });

      const nextPaid = current.is_paid ? 0 : 1;
      await runAsync('UPDATE transactions SET is_paid = ? WHERE id = ?', [nextPaid, id]);
      const updated = await getAsync('SELECT * FROM transactions WHERE id = ?', [id]);
      res.json(serializeTransaction(updated));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Toggle recurring status
  app.patch('/api/transactions/:id/toggle-recurring', async (req, res) => {
    try {
      const { id } = req.params;
      const current = await getAsync('SELECT is_recurring FROM transactions WHERE id = ?', [id]);
      if (!current) return res.status(404).json({ error: 'Transaction not found' });

      const nextRecurring = current.is_recurring ? 0 : 1;
      await runAsync('UPDATE transactions SET is_recurring = ? WHERE id = ?', [nextRecurring, id]);
      const updated = await getAsync('SELECT * FROM transactions WHERE id = ?', [id]);
      res.json(serializeTransaction(updated));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Process recurring subscriptions from previous month
  app.post('/api/transactions/process-recurring', async (req, res) => {
    try {
      const rawTarget = req.body?.targetDate || req.body?.date;
      const now = rawTarget ? new Date(rawTarget) : new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth(); // 0-based
      const prevDate = new Date(curYear, curMonth - 1, 1);
      const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
      const curYm = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;
      const maxDays = new Date(curYear, curMonth + 1, 0).getDate();

      const prevRecurring = await allAsync(
        `SELECT * FROM transactions 
         WHERE category = 'Assinatura / Fixo' AND is_recurring = 1 AND date LIKE ?`,
        [`${prevYm}%`]
      );

      const created = [];
      const accountCache = new Map();

      for (const t of prevRecurring) {
        // Check if already created this month
        const exists = await getAsync(
          `SELECT id FROM transactions 
           WHERE description = ? AND category = 'Assinatura / Fixo' AND date LIKE ?`,
          [t.description, `${curYm}%`]
        );

        if (!exists) {
          const origDay = Number(t.date.slice(8, 10)) || 1;
          const targetDay = Math.min(origDay, maxDays);
          const newDate = `${curYm}-${String(targetDay).padStart(2, '0')}`;
          const newId = Math.random().toString(36).slice(2) + Date.now().toString(36);

          let account = null;
          if (t.account_id) {
            if (!accountCache.has(t.account_id)) {
              const acc = await getAsync(
                'SELECT type, COALESCE(closing_day, 5) AS closing_day FROM accounts WHERE id = ?',
                [t.account_id]
              );
              accountCache.set(t.account_id, acc);
            }
            account = accountCache.get(t.account_id);
          }

          const mesReferencia = computeMesReferencia(newDate, account?.type, account?.closing_day);

          await runAsync(
            `INSERT INTO transactions (
              id, type, amount, description, category, date, mesReferencia,
              is_recurring, is_paid, account_id, contact_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
            [newId, t.type, t.amount, t.description, t.category, newDate, mesReferencia, t.account_id, t.contact_id]
          );

          const row = await getAsync('SELECT * FROM transactions WHERE id = ?', [newId]);
          created.push(serializeTransaction(row));
        }
      }

      res.json({ success: true, processedCount: created.length, items: created });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // -------------------------------------------------------------
  // Dedicated Dashboard and Third-Party SQL Aggregation Endpoints
  // -------------------------------------------------------------

  // Dashboard summary calculated entirely with SQL:
  app.get('/api/dashboard/summary', async (req, res) => {
    try {
      const month = req.query.month || new Date().toISOString().slice(0, 7);

      // 1. Current balance (all time up to today):
      const todayIso = new Date().toISOString().slice(0, 10);
      const balanceResult = await getAsync(`
        SELECT 
          COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') AND (date <= ? OR is_paid = 1) THEN amount ELSE 0 END), 0) -
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL AND (date <= ? OR is_paid = 1) THEN amount ELSE 0 END), 0) AS current_balance,
          COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') AND (date <= ? OR is_paid = 1) THEN amount ELSE 0 END), 0) AS total_income_all_time,
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL AND (date <= ? OR is_paid = 1) THEN amount ELSE 0 END), 0) AS total_expenses_all_time
        FROM transactions
      `, [todayIso, todayIso, todayIso, todayIso]);

      // 2. Monthly aggregates (filtered strictly by mesReferencia):
      const monthlyResult = await getAsync(
        `
        SELECT
          -- Personal expenses (contact_id IS NULL)
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.contact_id IS NULL THEN t.amount ELSE 0 END), 0) AS personal_expenses,
          -- Total Cartão (Personal expenses on credit card)
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.contact_id IS NULL AND a.type = 'CREDIT_CARD' THEN t.amount ELSE 0 END), 0) AS total_cartao,
          -- Total Débito/Contas (Personal expenses on checking accounts, cash, or unlinked)
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.contact_id IS NULL AND COALESCE(a.type, '') != 'CREDIT_CARD' THEN t.amount ELSE 0 END), 0) AS total_debito_contas,
          -- Third party pending
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.contact_id IS NOT NULL AND t.is_paid = 0 THEN t.amount ELSE 0 END), 0) AS third_party_pending,
          -- Third party total (pending + paid)
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.contact_id IS NOT NULL THEN t.amount ELSE 0 END), 0) AS third_party_total,
          -- Total expenses (personal + third party)
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') THEN t.amount ELSE 0 END), 0) AS total_expenses,
          -- Total income this month
          COALESCE(SUM(CASE WHEN (t.type = 'receita' OR t.type = 'INCOME') THEN t.amount ELSE 0 END), 0) AS total_income
        FROM transactions t
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.mesReferencia = ?
      `,
        [month]
      );

      // 3. Category breakdown for personal expenses (filtered by mesReferencia):
      const categoriesResult = await allAsync(
        `
        SELECT TRIM(category) AS category, SUM(amount) AS total
        FROM transactions
        WHERE (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL AND mesReferencia = ?
        GROUP BY TRIM(category)
        ORDER BY total DESC
      `,
        [month]
      );

      // 4. Monthly history (last 6 months up to current month):
      const historyResult = await allAsync(`
        SELECT 
          mesReferencia AS month,
          COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL THEN amount ELSE 0 END), 0) AS expense
        FROM transactions
        WHERE mesReferencia <= ?
        GROUP BY mesReferencia
        ORDER BY month DESC
        LIMIT 6
      `, [month]);

      res.json({
        month,
        current_balance: Number(balanceResult.current_balance || 0),
        total_income_all_time: Number(balanceResult.total_income_all_time || 0),
        total_expenses_all_time: Number(balanceResult.total_expenses_all_time || 0),
        total_cartao: Number(monthlyResult.total_cartao || 0),
        total_debito_contas: Number(monthlyResult.total_debito_contas || 0),
        monthly: {
          personal_expenses: Number(monthlyResult.personal_expenses || 0),
          total_cartao: Number(monthlyResult.total_cartao || 0),
          total_debito_contas: Number(monthlyResult.total_debito_contas || 0),
          third_party_pending: Number(monthlyResult.third_party_pending || 0),
          third_party_total: Number(monthlyResult.third_party_total || 0),
          total_expenses: Number(monthlyResult.total_expenses || 0),
          total_income: Number(monthlyResult.total_income || 0),
          balance: Number((monthlyResult.total_income || 0) - (monthlyResult.personal_expenses || 0)),
        },
        categories: categoriesResult.map((c) => ({
          categoria: c.category,
          category: c.category,
          total: Number(c.total),
        })),
        history: historyResult.reverse().map((h) => ({
          month: h.month,
          income: Number(h.income),
          expense: Number(h.expense),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Third-party summary calculated entirely with SQL:
  app.get('/api/third-party/summary', async (req, res) => {
    try {
      const month = req.query.month || new Date().toISOString().slice(0, 7);

      const contactsSummary = await allAsync(
        `
        SELECT 
          c.id,
          c.name,
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.is_paid = 0 THEN t.amount ELSE 0 END), 0) AS total_a_receber_geral,
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.is_paid = 0 AND t.mesReferencia = ? THEN t.amount ELSE 0 END), 0) AS total_a_receber_mes,
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.is_paid = 1 THEN t.amount ELSE 0 END), 0) AS total_pago_historico,
          COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') THEN t.amount ELSE 0 END), 0) AS total_geral,
          COUNT(t.id) as total_transacoes
        FROM contacts c
        LEFT JOIN transactions t ON c.id = t.contact_id
        GROUP BY c.id, c.name
        ORDER BY c.name ASC
      `,
        [month]
      );

      const overall = await getAsync(
        `
        SELECT 
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 THEN amount ELSE 0 END), 0) AS total_a_receber_geral,
          COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 AND mesReferencia = ? THEN amount ELSE 0 END), 0) AS total_a_receber_mes
        FROM transactions
      `,
        [month]
      );

      res.json({
        month,
        total_a_receber_geral: Number(overall.total_a_receber_geral || 0),
        total_a_receber_mes: Number(overall.total_a_receber_mes || 0),
        contacts: contactsSummary.map((item) => ({
          id: item.id,
          name: item.name,
          total_a_receber_geral: Number(item.total_a_receber_geral),
          total_a_receber_mes: Number(item.total_a_receber_mes),
          total_pago_historico: Number(item.total_pago_historico),
          total_geral: Number(item.total_geral),
          total_transacoes: Number(item.total_transacoes),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Database Reset (Danger Zone)
  // Clears all operational tables while keeping schema structure intact
  async function handleDatabaseReset(req, res) {
    try {
      await runAsync('PRAGMA foreign_keys = OFF;');
      await runAsync('DELETE FROM transactions;');
      await runAsync('DELETE FROM contacts;');
      await runAsync('DELETE FROM accounts;');
      await runAsync('PRAGMA foreign_keys = ON;');
      await runAsync('VACUUM;');
      if (!silent) console.log('Database operational tables cleared.');
      res.json({
        success: true,
        message: 'Todos os dados foram apagados com sucesso.',
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      if (!silent) console.error('Failed to reset database:', err);
      res.status(500).json({ error: err.message });
    }
  }

  app.delete('/api/database/reset', handleDatabaseReset);
  app.post('/api/database/reset', handleDatabaseReset);

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  return {
    app,
    db,
    initDatabase,
    closeDatabase,
    runAsync,
    allAsync,
    getAsync,
  };
}

// Default singleton instance for direct script imports
const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
const defaultInstance = createApp({
  dbPath: isTestEnv ? ':memory:' : defaultDbPath,
  silent: isTestEnv,
});

export const app = defaultInstance.app;
export const db = defaultInstance.db;
export const initDatabase = defaultInstance.initDatabase;
export const closeDatabase = defaultInstance.closeDatabase;
export const runAsync = defaultInstance.runAsync;
export const allAsync = defaultInstance.allAsync;
export const getAsync = defaultInstance.getAsync;

export default createApp;

// Auto-start server only when executed directly via Node CLI
const isMain = Boolean(
  process.argv[1] &&
  (path.resolve(process.argv[1]) === path.resolve(__filename) ||
   process.argv[1].endsWith('server.js')) &&
  process.env.NODE_ENV !== 'test' &&
  !process.env.VITEST
);

if (isMain) {
  defaultInstance.initDatabase()
    .then(() => {
      defaultInstance.app.listen(PORT, () => {
        console.log(`Backend server running on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error('Database initialization failed:', err);
      process.exit(1);
    });
}
