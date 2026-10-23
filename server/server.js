import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../database.sqlite');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database at', dbPath, err);
  } else {
    console.log(`Connected to SQLite database at: ${dbPath}`);
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

function serializeTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    description: row.description,
    category: row.category,
    date: row.date,
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

function normalizeTransactionInput(body) {
  return {
    id: body.id || Math.random().toString(36).slice(2) + Date.now().toString(36),
    type: body.type || body.tipo || 'despesa',
    amount: Number(body.amount ?? body.valor ?? 0),
    description: (body.description ?? body.descricao ?? '').trim(),
    category: body.category || body.categoria || 'Outros',
    date: body.date || body.data || new Date().toISOString().slice(0, 10),
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

// 2. Schema creation
async function initDatabase() {
  await runAsync('PRAGMA foreign_keys = ON;');

  await runAsync(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('CREDIT_CARD', 'CHECKING_ACCOUNT'))
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
}

// -------------------------------------------------------------
// 3. API Endpoints
// -------------------------------------------------------------

// Accounts CRUD
app.get('/api/accounts', async (req, res) => {
  try {
    const rows = await allAsync('SELECT id, name, type FROM accounts ORDER BY name ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/accounts', async (req, res) => {
  try {
    const { name, type } = req.body;
    if (!name || !type) return res.status(400).json({ error: 'Name and type are required' });
    const id = req.body.id || Math.random().toString(36).slice(2) + Date.now().toString(36);
    await runAsync('INSERT INTO accounts (id, name, type) VALUES (?, ?, ?)', [id, name.trim(), type]);
    const created = await getAsync('SELECT * FROM accounts WHERE id = ?', [id]);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/accounts/:id', async (req, res) => {
  try {
    const { name, type } = req.body;
    const { id } = req.params;
    await runAsync('UPDATE accounts SET name = COALESCE(?, name), type = COALESCE(?, type) WHERE id = ?', [name?.trim(), type, id]);
    const updated = await getAsync('SELECT * FROM accounts WHERE id = ?', [id]);
    if (!updated) return res.status(404).json({ error: 'Account not found' });
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
      sql += ' AND date LIKE ?';
      params.push(`${month}%`);
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
      await runAsync(
        `INSERT INTO transactions (
          id, type, amount, description, category, date,
          is_recurring, is_paid, current_installment, total_installments,
          asset_value, installment_group_id, account_id, contact_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          t.type,
          t.amount,
          t.description,
          t.category,
          t.date,
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
    await runAsync(
      `UPDATE transactions SET
        type = ?, amount = ?, description = ?, category = ?, date = ?,
        is_recurring = ?, is_paid = ?, current_installment = ?, total_installments = ?,
        asset_value = ?, installment_group_id = ?, account_id = ?, contact_id = ?
      WHERE id = ?`,
      [
        normalized.type,
        normalized.amount,
        normalized.description,
        normalized.category,
        normalized.date,
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
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth(); // 0-based
    const prevDate = new Date(curYear, curMonth - 1, 1);
    const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
    const curYm = `${curYear}-${String(curMonth + 1).padStart(2, '0')}`;

    const prevRecurring = await allAsync(
      `SELECT * FROM transactions 
       WHERE category = 'Assinatura / Fixo' AND is_recurring = 1 AND date LIKE ?`,
      [`${prevYm}%`]
    );

    const created = [];
    for (const t of prevRecurring) {
      // Check if already created this month
      const exists = await getAsync(
        `SELECT id FROM transactions 
         WHERE description = ? AND category = 'Assinatura / Fixo' AND date LIKE ?`,
        [t.description, `${curYm}%`]
      );

      if (!exists) {
        const day = t.date.slice(8, 10);
        const newDate = `${curYm}-${day}`;
        const newId = Math.random().toString(36).slice(2) + Date.now().toString(36);

        await runAsync(
          `INSERT INTO transactions (
            id, type, amount, description, category, date,
            is_recurring, is_paid, account_id, contact_id
          ) VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
          [newId, t.type, t.amount, t.description, t.category, newDate, t.account_id, t.contact_id]
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
// - Saldo atual: (Receitas) - (Despesas pagas/realizadas, incluindo de terceiros)
// - Gastos Mês: apenas gastos pessoais (contact_id IS NULL)
// - A Receber (Terceiros): gastos de terceiros pendentes (is_paid = 0)
// - Total Gasto (Geral): gastos pessoais + repasses de terceiros
// - Entradas: receitas do mês
// - Despesas por Categoria
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const monthPattern = `${month}%`;

    // 1. Current balance (all time up to today):
    // Receitas realizadas - Despesas pessoais realizadas (date <= today OR is_paid = 1).
    // Parcelas futuras (ex: consórcio até 2031) NUNCA devem abater o saldo de hoje!
    const todayIso = new Date().toISOString().slice(0, 10);
    const balanceResult = await getAsync(`
      SELECT 
        COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') AND (date <= ? OR is_paid = 1) THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL AND (date <= ? OR is_paid = 1) THEN amount ELSE 0 END), 0) AS current_balance,
        COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') AND (date <= ? OR is_paid = 1) THEN amount ELSE 0 END), 0) AS total_income_all_time,
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL AND (date <= ? OR is_paid = 1) THEN amount ELSE 0 END), 0) AS total_expenses_all_time
      FROM transactions
    `, [todayIso, todayIso, todayIso, todayIso]);

    // 2. Monthly aggregates:
    const monthlyResult = await getAsync(
      `
      SELECT
        -- Personal expenses (contact_id IS NULL)
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL THEN amount ELSE 0 END), 0) AS personal_expenses,
        -- Third party pending
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 THEN amount ELSE 0 END), 0) AS third_party_pending,
        -- Third party total (pending + paid)
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL THEN amount ELSE 0 END), 0) AS third_party_total,
        -- Total expenses (personal + third party)
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') THEN amount ELSE 0 END), 0) AS total_expenses,
        -- Total income this month
        COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') THEN amount ELSE 0 END), 0) AS total_income
      FROM transactions
      WHERE date LIKE ?
    `,
      [monthPattern]
    );

    // 3. Category breakdown for personal expenses:
    const categoriesResult = await allAsync(
      `
      SELECT TRIM(category) AS category, SUM(amount) AS total
      FROM transactions
      WHERE (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL AND date LIKE ?
      GROUP BY TRIM(category)
      ORDER BY total DESC
    `,
      [monthPattern]
    );

    // 4. Monthly history (last 6 months up to current month):
    // Impede que parcelas futuras de 2031 poluam o histórico do gráfico
    const historyResult = await allAsync(`
      SELECT 
        SUBSTR(date, 1, 7) AS month,
        COALESCE(SUM(CASE WHEN (type = 'receita' OR type = 'INCOME') THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NULL THEN amount ELSE 0 END), 0) AS expense
      FROM transactions
      WHERE SUBSTR(date, 1, 7) <= ?
      GROUP BY SUBSTR(date, 1, 7)
      ORDER BY month DESC
      LIMIT 6
    `, [month]);

    res.json({
      month,
      current_balance: Number(balanceResult.current_balance || 0),
      total_income_all_time: Number(balanceResult.total_income_all_time || 0),
      total_expenses_all_time: Number(balanceResult.total_expenses_all_time || 0),
      monthly: {
        personal_expenses: Number(monthlyResult.personal_expenses || 0),
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
// Groups by contact to obtain pending, monthly, and historical totals
app.get('/api/third-party/summary', async (req, res) => {
  try {
    const month = req.query.month || new Date().toISOString().slice(0, 7);
    const monthPattern = `${month}%`;

    const contactsSummary = await allAsync(
      `
      SELECT 
        c.id,
        c.name,
        COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.is_paid = 0 THEN t.amount ELSE 0 END), 0) AS total_a_receber_geral,
        COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.is_paid = 0 AND t.date LIKE ? THEN t.amount ELSE 0 END), 0) AS total_a_receber_mes,
        COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') AND t.is_paid = 1 THEN t.amount ELSE 0 END), 0) AS total_pago_historico,
        COALESCE(SUM(CASE WHEN (t.type = 'despesa' OR t.type = 'EXPENSE') THEN t.amount ELSE 0 END), 0) AS total_geral,
        COUNT(t.id) as total_transacoes
      FROM contacts c
      LEFT JOIN transactions t ON c.id = t.contact_id
      GROUP BY c.id, c.name
      ORDER BY c.name ASC
    `,
      [monthPattern]
    );

    const overall = await getAsync(
      `
      SELECT 
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 THEN amount ELSE 0 END), 0) AS total_a_receber_geral,
        COALESCE(SUM(CASE WHEN (type = 'despesa' OR type = 'EXPENSE') AND contact_id IS NOT NULL AND is_paid = 0 AND date LIKE ? THEN amount ELSE 0 END), 0) AS total_a_receber_mes
      FROM transactions
    `,
      [monthPattern]
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
    console.log('Database operational tables cleared.');
    res.json({
      success: true,
      message: 'Todos os dados foram apagados com sucesso.',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to reset database:', err);
    res.status(500).json({ error: err.message });
  }
}

app.delete('/api/database/reset', handleDatabaseReset);
app.post('/api/database/reset', handleDatabaseReset);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Initialize DB and start server
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database initialization failed:', err);
    process.exit(1);
  });
