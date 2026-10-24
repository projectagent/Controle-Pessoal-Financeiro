import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, Pencil, UsersRound, Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  brl,
  calcularSaldoAtual,
  deslocarMes,
  transacoesDoMes,
  updateMonthlySpendingLimit,
  useDashboardSummary,
  useFinanceSettings,
  useTransactions,
  ym,
} from "@/lib/finance";

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

const COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#e11d48", // rose
];

function Dashboard() {
  const txs = useTransactions();
  const settings = useFinanceSettings();
  const [limitDialogOpen, setLimitDialogOpen] = useState(false);
  const [limitInput, setLimitInput] = useState(String(settings.monthly_spending_limit));
  const [mes, setMes] = useState(() => {
    const hoje = new Date();
    return ym(hoje.getFullYear(), hoje.getMonth());
  });

  const hojeIso = new Date().toISOString().slice(0, 10);
  const { summary: sqlSummary } = useDashboardSummary(mes);
  const isSqlSynced = sqlSummary?.month === mes;

  const [anoSel, mesSel] = mes.split("-").map(Number) as [number, number];
  const mesLabel = new Date(anoSel, mesSel - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  const mesTitulo = `${mesLabel.charAt(0).toUpperCase()}${mesLabel.slice(1)} ${anoSel}`;

  // Strict monthly isolation for transactions
  const doMes = transacoesDoMes(txs, mes);

  // 1. Saldo Atual: evaluates all realized cash flow to date (excludes future installments)
  const saldo = isSqlSynced ? sqlSummary.current_balance : calcularSaldoAtual(txs, hojeIso);

  // 2. Receitas do Mês: strictly within selected month
  const receitas = isSqlSynced
    ? sqlSummary.monthly.total_income
    : doMes.filter((t) => t.tipo === "receita").reduce((s, t) => s + t.valor, 0);

  // 3. Despesas do Mês: personal expenses strictly within selected month (never includes third party)
  const despesasPessoais = doMes.filter((t) => t.tipo === "despesa" && !t.contact_id);
  const despesas = isSqlSynced
    ? sqlSummary.monthly.personal_expenses
    : despesasPessoais.reduce((s, t) => s + t.valor, 0);

  // 4. Repasse de Terceiros: valor mensal (do mês selecionado) e valor total acumulado (geral)
  const aReceberMes = isSqlSynced && sqlSummary?.monthly?.third_party_pending !== undefined
    ? Number(sqlSummary.monthly.third_party_pending)
    : doMes
        .filter((t) => t.tipo === "despesa" && (Boolean(t.contact_id) || t.expense_owner === "Terceiros") && !t.is_paid)
        .reduce((s, t) => s + t.valor, 0);

  const aReceberTotal = isSqlSynced && (sqlSummary as any)?.total_a_receber_geral !== undefined
    ? Number((sqlSummary as any).total_a_receber_geral)
    : txs
        .filter((t) => t.tipo === "despesa" && (Boolean(t.contact_id) || t.expense_owner === "Terceiros") && !t.is_paid)
        .reduce((s, t) => s + t.valor, 0);

  // 5. Recent transactions strictly within selected month
  const recentes = doMes
    .filter((t) => !t.contact_id)
    .sort((a, b) => b.data.localeCompare(a.data) || b.id.localeCompare(a.id))
    .slice(0, 6);

  // 6. Strict category breakdown: group strictly by category column/property
  // Different categories (e.g. "Consórcio" and "Assinatura / Fixo") NEVER merge into one slice
  const catMap = new Map<string, number>();
  for (const t of despesasPessoais) {
    const rawCat = t.categoria || (t as { category?: string }).category || "Outros";
    const cat = String(rawCat).trim() || "Outros";
    const valor = Number(t.valor ?? 0);
    catMap.set(cat, (catMap.get(cat) ?? 0) + valor);
  }
  const porCatClient = [...catMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const porCat = isSqlSynced && sqlSummary.categories && sqlSummary.categories.length > 0
    ? sqlSummary.categories.map((c) => ({
        name: (c.categoria || (c as { category?: string }).category || "Outros").trim(),
        value: Number(c.total),
      }))
    : porCatClient;

  // 7. Spending limit progress strictly based on monthly expenses
  const rawPct = settings.monthly_spending_limit > 0 ? (despesas / settings.monthly_spending_limit) * 100 : 0;
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

  const cards: Array<{
    label: string;
    value: number;
    secondaryLabel?: string;
    secondaryValue?: number;
    icon: typeof Wallet;
    cls: string;
  }> = [
    { label: "Saldo Atual", value: saldo, icon: Wallet, cls: "text-foreground" },
    { label: "Receitas do Mês", value: receitas, icon: ArrowUpRight, cls: "text-income" },
    { label: "Despesas do Mês", value: despesas, icon: ArrowDownRight, cls: "text-expense" },
    {
      label: "Repasse de Terceiros (Mês)",
      value: aReceberMes,
      secondaryLabel: "Total acumulado",
      secondaryValue: aReceberTotal,
      icon: UsersRound,
      cls: "text-amber-500",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
      </div>

      {/* Month Navigator */}
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Mês anterior"
          onClick={() => setMes((m) => deslocarMes(m, -1))}
        >
          <ChevronLeft className="size-5" />
        </Button>
        <h2 className="min-w-44 text-center font-display text-lg font-semibold">{mesTitulo}</h2>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Próximo mês"
          onClick={() => setMes((m) => deslocarMes(m, 1))}
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, secondaryLabel, secondaryValue, icon: Icon, cls }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              {label}
              <Icon className={`size-4 ${cls}`} />
            </div>
            <p className={`mt-3 font-display text-2xl font-semibold tabular-nums ${cls}`}>{brl(value)}</p>
            {secondaryLabel && secondaryValue !== undefined && (
              <div className="mt-2 flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
                <span>{secondaryLabel}</span>
                <span className="font-semibold tabular-nums text-foreground">{brl(secondaryValue)}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Charts & Limits */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-5 lg:col-span-3">
          <h2 className="font-medium">Despesas por Categoria</h2>
          {porCat.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">Nenhuma despesa em {mesTitulo}.</p>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
              <div className="h-56 w-56 shrink-0">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={porCat}
                      dataKey="value"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {porCat.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => brl(v)}
                      contentStyle={{
                        background: "var(--popover)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        color: "var(--foreground)",
                      }}
                      itemStyle={{ color: "var(--foreground)" }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="w-full space-y-2 text-sm">
                {porCat.map((c, i) => (
                  <li key={c.name} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 truncate text-muted-foreground">{c.name}</span>
                    <span className="tabular-nums font-medium">{brl(c.value)}</span>
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
              onClick={() => {
                setLimitInput(String(settings.monthly_spending_limit));
                setLimitDialogOpen(true);
              }}
            >
              <Pencil className="size-4" />
            </Button>
          </div>
          <Progress value={progressValue} indicatorClassName={progressColor} className="mt-6 h-3" />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
            <span>{brl(despesas)}</span>
            <span>{brl(settings.monthly_spending_limit)}</span>
          </div>

          <section className="mt-6 border-t border-border pt-4">
            <div className="pb-3">
              <h2 className="font-medium">Transações recentes</h2>
            </div>
            {recentes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma transação pessoal registrada em {mesTitulo}.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {recentes.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{transaction.descricao}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{transaction.data.split("-").reverse().join("/")}</span>
                        <span>{transaction.categoria}</span>
                        {transaction.installment_group_id && transaction.parcela != null && transaction.totalParcelas != null && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
                            {transaction.parcela}/{transaction.totalParcelas}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${
                        transaction.tipo === "receita" ? "text-income" : "text-expense"
                      }`}
                    >
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
          <DialogHeader>
            <DialogTitle>Ajustar limite geral de gastos</DialogTitle>
          </DialogHeader>
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
              <Button type="button" variant="outline" onClick={() => setLimitDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar limite</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
