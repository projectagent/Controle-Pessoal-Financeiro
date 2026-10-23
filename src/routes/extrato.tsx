import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, removeTransaction, useTransactions } from "@/lib/finance";

export const Route = createFileRoute("/extrato")({
  head: () => ({
    meta: [
      { title: "Extrato — FalaGrana" },
      { name: "description", content: "Todas as suas transações em um só lugar." },
      { property: "og:title", content: "Extrato — FalaGrana" },
      { property: "og:description", content: "Todas as suas transações em um só lugar." },
    ],
  }),
  component: Extrato,
});

function Extrato() {
  const txs = [...useTransactions()].sort((a, b) => b.data.localeCompare(a.data));
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Extrato</h1>
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead>
              <TableHead>Conta</TableHead><TableHead className="text-right">Valor</TableHead><TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {txs.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Nenhuma transação.</TableCell></TableRow>
            )}
            {txs.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="text-muted-foreground">{t.data.split("-").reverse().join("/")}</TableCell>
                <TableCell>{t.descricao}</TableCell>
                <TableCell>{t.categoria}</TableCell>
                <TableCell className="text-muted-foreground">{t.conta}</TableCell>
                <TableCell className={`text-right font-medium ${t.tipo === "receita" ? "text-income" : "text-expense"}`}>
                  {t.tipo === "receita" ? "+" : "−"} {brl(t.valor)}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => removeTransaction(t.id)}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
