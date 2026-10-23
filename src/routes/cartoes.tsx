import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, CARTOES, cartaoDe, faturaDe, useTransactions, ym } from "@/lib/finance";

export const Route = createFileRoute("/cartoes")({
  head: () => ({
    meta: [
      { title: "Cartões — FalaGrana" },
      { name: "description", content: "Faturas dos seus cartões de crédito, com parcelas organizadas por mês." },
      { property: "og:title", content: "Cartões — FalaGrana" },
      { property: "og:description", content: "Faturas dos seus cartões de crédito, com parcelas organizadas por mês." },
    ],
  }),
  component: Cartoes,
});

const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function Cartoes() {
  const txs = useTransactions();
  const [sel, setSel] = useState(CARTOES[0]!.nome);
  const [offset, setOffset] = useState(0);
  const cartao = CARTOES.find((c) => c.nome === sel)!;

  // Current invoice = the one that hasn't closed yet today.
  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth() + (hoje.getDate() > cartao.fechamento ? 1 : 0) + offset, 1);
  const mes = ym(base.getFullYear(), base.getMonth());
  const fechamento = new Date(base.getFullYear(), base.getMonth(), cartao.fechamento);
  const vencimento = new Date(base.getFullYear(), base.getMonth(), cartao.vencimento);
  const aberta = hoje <= fechamento;

  const itens = txs
    .filter((t) => t.conta === "Crédito" && t.tipo === "despesa" && cartaoDe(t) === sel && faturaDe(t, cartao) === mes)
    .sort((a, b) => a.data.localeCompare(b.data));
  const total = itens.reduce((s, t) => s + t.valor, 0);
  const mesLabel = base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Cartões</h1>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {CARTOES.map((c) => {
          const active = c.nome === sel;
          return (
            <button
              key={c.nome}
              onClick={() => { setSel(c.nome); setOffset(0); }}
              className={`flex min-w-52 flex-col gap-6 rounded-xl border p-4 text-left transition-all ${active ? "border-primary bg-gradient-to-br from-primary/20 to-card shadow-lg" : "border-border bg-card opacity-70 hover:opacity-100"}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.nome}</span>
                <CreditCard className={`size-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <span className="font-display text-sm tracking-widest text-muted-foreground">•••• {c.final}</span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Resumo da Fatura {offset === 0 ? "Atual" : ""}</h2>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Fatura anterior" onClick={() => setOffset((o) => o - 1)}><ChevronLeft className="size-4" /></Button>
            <span className="w-36 text-center text-sm capitalize text-muted-foreground">{mesLabel}</span>
            <Button variant="ghost" size="icon" aria-label="Próxima fatura" onClick={() => setOffset((o) => o + 1)}><ChevronRight className="size-4" /></Button>
          </div>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium ${aberta ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
              {aberta ? "Aberta" : "Fechada"}
            </span>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Vencimento</p>
            <p className="mt-1 font-medium">{fmt(vencimento)}</p>
            <p className="text-xs text-muted-foreground">Fecha em {fmt(fechamento)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Valor Total</p>
            <p className="mt-1 font-display text-2xl font-semibold text-expense">{brl(total)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-muted-foreground">Nenhuma compra nesta fatura.</TableCell></TableRow>
            )}
            {itens.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-muted-foreground">{t.data.split("-").reverse().join("/")}</TableCell>
                <TableCell>
                  {t.descricao}
                  {t.totalParcelas && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{t.parcela}/{t.totalParcelas}</span>}
                </TableCell>
                <TableCell>{t.categoria}</TableCell>
                <TableCell className="text-right font-medium text-expense">{brl(t.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
