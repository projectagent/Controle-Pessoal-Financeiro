import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Pencil, UsersRound, Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { brl, calcularSaldoAtual, totalAReceber, updateMonthlySpendingLimit, useContacts, useDashboardSummary, useFinanceSettings, useTransactionAccounts, useTransactions } from "@/lib/finance";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Controle Financeiro Pessoal" },
      { name: "description", content: "Saldo, receitas, despesas e gastos por categoria." },
      { property: "og:title", content: "Dashboard — Controle Financeiro Pessoal" },
      { property: "og:description", content: "Saldo, receitas, despesas e gastos por categoria." },
    ],
  }),
  component: Dashboard,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)"];

function Dashboard() {
  const txs = useTransactions();
  const contacts = useContacts();
  const accounts = useTransactionAccounts();
  const settings = useFinanceSettings();
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitInput, setLimitInput] = useState(String(settings.monthly_spending_limit));
  const [accountFilter, setAccountFilter] = useState("__all_accounts__");
  const month = new Date().toISOString().slice(0, 7);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const { summary: sqlSummary } = useDashboardSummary(month);

  const scopedTransactions = accountFilter === "__all_accounts__" ? txs : txs.filter((transaction) => transaction.account_id === accountFilter);
  const isDefaultView = accountFilter === "__all_accounts__";

  // When viewing all accounts, metrics are powered directly by SQLite SQL aggregations
  const saldo = isDefaultView && sqlSummary
    ? sqlSummary.current_balance
    : calcularSaldoAtual(scopedTransactions, hojeIso);

  const doMes = scopedTransactions.filter((t) => t.data.startsWith(month));
  const recentes = doMes
    .filter((t) => !t.contact_id)
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
    .slice(0, 6);

  const receitas = isDefaultView && sqlSummary
    ? sqlSummary.monthly.total_income
    : doMes.filter((t) => t.tipo === "receita").reduce((s, t) => s + t.valor, 0);

  const despesasPessoais = doMes.filter((t) => t.tipo === "despesa" && !t.contact_id);

  const despesas = isDefaultView && sqlSummary
    ? sqlSummary.monthly.personal_expenses
    : despesasPessoais.reduce((s, t) => s + t.valor, 0);

  const aReceber = isDefaultView && sqlSummary
    ? sqlSummary.monthly.third_party_pending
    : totalAReceber(contacts, scopedTransactions);

  const porCat = isDefaultView && sqlSummary && sqlSummary.categories.length > 0
    ? sqlSummary.categories.map((c) => ({ name: c.categoria, value: c.total }))
    : Object.entries(
        despesasPessoais.reduce<Record<string, number>>((a, t) => ((a[t.categoria] = (a[t.categoria] ?? 0) + t.valor), a), {}),
      ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const rawPct = (despesas / settings.monthly_spending_limit) * 100;
  const pct = Math.round(rawPct);
  const progressValue = Math.min(100, rawPct);
  const progressColor = rawPct >= 90 ? "bg-rose-500" : rawPct >= 70 ? "bg-amber-500" : "bg-emerald-500";

  const saveLimit = (event: React.FormEvent) => {
    event.preventDefault();
    const nextLimit = Number(limitInput);
    if (!(nextLimit > 0) || !Number.isFinite(nextLimit)) {
      toast.error("Informe um limite mensal maior que zero");
      return;
    }
    updateMonthlySpendingLimit(nextLimit);
    toast.success("Meta mensal atualizada");
    setLimitDialogOpen(false);
  };

  const cards = [
    { label: "Saldo Atual", value: saldo, icon: Wallet, cls: "text-foreground" },
    { label: "Receitas do Mês", value: receitas, icon: ArrowUpRight, cls: "text-income" },
    { label: "Despesas do Mês", value: despesas, icon: ArrowDownRight, cls: "text-expense" },
    { label: "Total a Receber de Terceiros", value: aReceber, icon: UsersRound, cls: "text-amber-500" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Visualizar:</span>
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger className="w-full max-w-xs"><SelectValue placeholder="Total geral" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all_accounts__">Total geral</SelectItem>
            {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}{account.type === "CREDIT_CARD" ? " · Cartão" : " · Conta"}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, cls }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">{label}<Icon className={`size-4 ${cls}`} /></div>
            <p className={`mt-3 font-display text-2xl font-semibold ${cls}`}>{brl(value)}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-3">
          <h2 className="font-medium">Despesas por Categoria</h2>
          {porCat.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Nenhuma despesa neste mês.</p>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
              <div className="h-56 w-56 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={porCat} dataKey="value" innerRadius={60} outerRadius={95} paddingAngle={3} stroke="none">
                      {porCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => brl(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }} itemStyle={{ color: "var(--foreground)" }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-2 text-sm">
                {porCat.map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 text-muted-foreground">{c.name}</span>
                    <span>{brl(c.value)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Meta de Gastos do Mês</h2>

          
              <p className="mt-1 text-sm text-muted-foreground">{pct}% atingido</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Ajustar limite mensal"
              title="Ajustar limite mensal"
              onClick={() => { setLimitInput(String(settings.monthly_spending_limit)); setLimitDialogOpen(true); }}
            >
              <Pencil className="size-4" />
            </Button>
          </div>
          <Progress value={progressValue} indicatorClassName={progressColor} className="mt-6 h-3" />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
            <span>{brl(despesas)}</span><span>{brl(settings.monthly_spending_limit)}</span>
          </div>
        

          <section className="mt-6 border-t border-border pt-4">
            <div className="pb-3">
              <h2 className="font-medium">Transações recentes</h2>
            </div>
            {recentes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma transação pessoal registrada neste mês.</p>
            ) : (
              <div className="divide-y divide-border">
                {recentes.map((transaction) => (
                  <div key={transaction.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{transaction.descricao}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{transaction.data.split("-").reverse().join("/")}</span>
                        <span>{transaction.categoria}</span>
                        {transaction.installment_group_id && transaction.parcela != null && transaction.totalParcelas != null && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">{transaction.parcela}/{transaction.totalParcelas}</span>
                        )}
                      </div>
                    </div>
                    <span className={`shrink-0 font-semibold tabular-nums ${transaction.tipo === "receita" ? "text-income" : "text-expense"}`}>
                      {transaction.tipo === "receita" ? "+" : "−"} {brl(transaction.valor)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Dialog open={limitDialogOpen} onOpenChange={setLimitDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajustar limite geral de gastos</DialogTitle></DialogHeader>
          <form onSubmit={saveLimit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="monthly-spending-limit">Limite mensal (R$)</Label>
              <Input
                id="monthly-spending-limit"
                type="number"
                min="0.01"
                step="0.01"
                value={limitInput}
                onChange={(event) => setLimitInput(event.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLimitDialogOpen(false)}>Cancelar</Button>
              <Button type="submit">Salvar limite</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
