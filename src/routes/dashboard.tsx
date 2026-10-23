import { createFileRoute } from "@tanstack/react-router";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Progress } from "@/components/ui/progress";
import { brl, META_GASTOS, useTransactions } from "@/lib/finance";

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
  const month = new Date().toISOString().slice(0, 7);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const saldo = txs.filter((t) => t.data <= hojeIso).reduce((s, t) => s + (t.tipo === "receita" ? t.valor : -t.valor), 0);
  const doMes = txs.filter((t) => t.data.startsWith(month));
  const receitas = doMes.filter((t) => t.tipo === "receita").reduce((s, t) => s + t.valor, 0);
  const despesas = doMes.filter((t) => t.tipo === "despesa").reduce((s, t) => s + t.valor, 0);
  const porCat = Object.entries(
    doMes.filter((t) => t.tipo === "despesa").reduce<Record<string, number>>((a, t) => ((a[t.categoria] = (a[t.categoria] ?? 0) + t.valor), a), {}),
  ).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const pct = Math.min(100, Math.round((despesas / META_GASTOS) * 100));

  const cards = [
    { label: "Saldo Atual", value: saldo, icon: Wallet, cls: "text-foreground" },
    { label: "Receitas do Mês", value: receitas, icon: ArrowUpRight, cls: "text-income" },
    { label: "Despesas do Mês", value: despesas, icon: ArrowDownRight, cls: "text-expense" },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-3">
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
          <h2 className="font-medium">Meta de Gastos</h2>
          <p className="mt-1 text-sm text-muted-foreground">{pct}% atingido</p>
          <Progress value={pct} className="mt-6 h-3" />
          <div className="mt-3 flex justify-between text-xs text-muted-foreground">
            <span>{brl(despesas)}</span><span>{brl(META_GASTOS)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
