# Project: Controle-Pessoal-Financeiro — mesReferencia Expense Grouping

## Architecture
- **Stack**: TypeScript, React 19, Vite, TanStack Router, Tailwind CSS, Express, SQLite3, Vitest.
- **Data Flow**:
  1. Frontend UI (`ManualTransactionDialog` in `extrato.tsx` or Chat in `index.tsx`) captures transaction data.
  2. For credit cards, backend calculates `mesReferencia` based on `dia_transacao >= closing_day` (next month 'YYYY-MM'); for other methods, frontend passes selected `mesReferencia` (defaults to transaction month).
  3. Backend (`server/server.js`) persists transactions to `database.sqlite` with `mesReferencia TEXT`.
  4. Dashboard (`dashboard.tsx`) passes selected filter month (`mes`, 'YYYY-MM') to `useDashboardSummary(mes)`.
  5. Backend queries `/api/dashboard/summary` and `/api/transactions` filter by `mesReferencia = ?`.
  6. Frontend client helpers (`transacoesDoMes`) filter by `(t.mesReferencia || t.data.slice(0, 7)) === mes`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | SQLite Schema Update (R1) | Add `mesReferencia TEXT` to `transactions` table and `closing_day INTEGER DEFAULT 5` to `accounts` table via idempotent `PRAGMA table_info` checks | M1 | ORIGINAL_REQUEST §R1 |
| F2 | Retroactive Migration (R1) | Backfill existing 141 transactions in `database.sqlite` where `mesReferencia IS NULL`. Credit cards with `day >= closing_day` receive next month; other transactions receive transaction month | M1 | ORIGINAL_REQUEST §R1 |
| F3 | Backend Insertion Logic (R2) | In `POST /api/transactions`, compute `mesReferencia` for credit cards (`day >= closing_day` -> next month; else current month). For other payment methods, accept client-provided `mesReferencia` | M1 | ORIGINAL_REQUEST §R2 |
| F4 | Backend Dashboard Query Update (R3) | Update `GET /api/dashboard/summary` and `GET /api/transactions` to filter and group by `mesReferencia = ?` instead of `date LIKE ?` | M1 | ORIGINAL_REQUEST §R3 |
| F5 | Type Definitions Update (R2/R4) | Add `mesReferencia` to `Transaction` (`src/lib/finance.ts`) and `ApiTransaction` (`src/lib/api.ts`) | M2 | ORIGINAL_REQUEST §R2, §R4 |
| F6 | Domain Helpers & Card Closing Rule (R1/R2) | Update `faturaDe` (`src/lib/finance.ts`) and `cartoes.tsx` to use `>=` (`d >= fechamento`). Update `transacoesDoMes` to filter by `mesReferencia`. Update `gerarParcelasUnitarias` to advance `mesReferencia` per installment | M2 | ORIGINAL_REQUEST §R1, §R2 |
| F7 | Manual Expense Form Input (R4) | Add `mesReferencia` month picker (`<Input type="month" ... />`) to `ManualTransactionDialog` in `src/routes/extrato.tsx` and pass to `addTransaction` | M2 | ORIGINAL_REQUEST §R4 |
| F8 | Dashboard Month Filter Integration (R3/R4) | Verify Dashboard component passes selected month to `useDashboardSummary` and displays recent transactions filtered by `mesReferencia` | M2 | ORIGINAL_REQUEST §R3, §R4 |
| F9 | Vitest Unit & Integration Tests | Comprehensive automated tests in `src/test/finance.test.ts` and `src/test/server-api.test.ts` covering calculation, closing day boundaries, month rollovers, schema, and dashboard queries | M3 | ORIGINAL_REQUEST Acceptance Criteria |
| F10 | Full Test Suite Execution | 100% of tests passing with `npm.cmd run test` and zero regressions | M3 | ORIGINAL_REQUEST Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend & SQLite Engine | SQLite schema migration, retroactive backfill, transaction insertion logic, dashboard summary queries (`server/server.js`, `src/lib/api.ts`) | none | DONE |
| M2 | Domain & React UI | Types, `finance.ts` helpers (`transacoesDoMes`, `faturaDe >=`, `gerarParcelasUnitarias`, `totalAReceberMes`), `ManualTransactionDialog` month picker in `extrato.tsx`, card closing fix in `cartoes.tsx` | M1 | DONE |
| M3 | Test Suite & Verification | Vitest unit and HTTP integration tests (`finance.test.ts`, `server-api.test.ts`, adversarial suites), 100% test pass via `npm.cmd run test` (134/134 passed), clean build, clean forensic audit | M1, M2 | DONE |

## Interface Contracts
### `server/server.js` ↔ Client API (`src/lib/api.ts`)
- `ApiTransaction`: `{ id: string; type: string; amount: number; description: string; category: string; date: string; mesReferencia?: string | null; account_id?: string | null; ... }`
- `POST /api/transactions`: Request body includes `mesReferencia?: string`. Response returns inserted transaction with calculated/assigned `mesReferencia`.
- `GET /api/dashboard/summary?month=YYYY-MM`: Returns summary aggregated where `mesReferencia = ?`.
- `GET /api/transactions?month=YYYY-MM`: Returns transactions where `mesReferencia = ?`.

### Domain Model (`src/lib/finance.ts`) ↔ UI Components
- `Transaction`: contains optional `mesReferencia?: string` (format 'YYYY-MM').
- `transacoesDoMes(transactions: Transaction[], mes: string)`: returns `transactions.filter(t => (t.mesReferencia || t.data.slice(0, 7)) === mes)`.
- `faturaDe(transacao, cartoes)`: uses `d >= c.fechamento ? 1 : 0` to determine reference invoice month.

## Code Layout
- `server/server.js`: SQLite connection, migrations, API endpoints (`/api/transactions`, `/api/dashboard/summary`).
- `src/lib/api.ts`: API client interfaces and fetch methods.
- `src/lib/finance.ts`: Core data structures, calculation functions, reactive store.
- `src/routes/dashboard.tsx`: Main financial dashboard view and month filter.
- `src/routes/extrato.tsx`: Manual transaction dialog and statement list.
- `src/routes/cartoes.tsx`: Credit card views and statement invoice calculations.
- `src/test/finance.test.ts`: Vitest domain unit tests.
- `src/test/server-api.test.ts`: Vitest API & database integration tests.

