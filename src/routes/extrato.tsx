import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { FastForward, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { anteciparParcelas, brl, removeTransaction, removeTransactionsByInstallmentGroupId, useTransactions, type Transaction } from "@/lib/finance";

export const Route = createFileRoute("/extrato")({
  head: () => ({
    meta: [
      { title: "Extrato — Controle Financeiro Pessoal" },
      { name: "description", content: "Todas as suas transações em um só lugar." },
      { property: "og:title", content: "Extrato — Controle Financeiro Pessoal" },
      { property: "og:description", content: "Todas as suas transações em um só lugar." },
    ],
  }),
  component: Extrato,
});

function Extrato() {
  const txs = [...useTransactions()].sort((a, b) => b.data.localeCompare(a.data));
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [txAntecipar, setTxAntecipar] = useState<Transaction | null>(null);

  const handleDelete = () => {
    if (!txToDelete) return;

    if (txToDelete.installment_group_id) {
      removeTransactionsByInstallmentGroupId(txToDelete.installment_group_id);
      toast.success("Compra parcelada excluída com sucesso!");
    } else {
      removeTransaction(txToDelete.id);
      toast.success("Transação excluída");
    }

    setTxToDelete(null);
  };

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
                <TableCell>{t.descricao}{t.totalParcelas && <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{t.parcela}/{t.totalParcelas}</span>}</TableCell>
                <TableCell>{t.categoria}</TableCell>
                <TableCell className="text-muted-foreground">{t.conta}</TableCell>
                <TableCell className={`text-right font-medium ${t.tipo === "receita" ? "text-income" : "text-expense"}`}>
                  {t.tipo === "receita" ? "+" : "−"} {brl(t.valor)}
                </TableCell>
                <TableCell className="flex items-center justify-end gap-1">
                  {t.installment_group_id && (
                    <Button variant="ghost" size="icon" aria-label="Antecipar parcela" onClick={() => setTxAntecipar(t)}>
                      <FastForward className="size-4 text-muted-foreground" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setTxToDelete(t)}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!txToDelete} onOpenChange={(open) => !open && setTxToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{txToDelete?.installment_group_id ? "Excluir compra parcelada?" : "Excluir transação?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {txToDelete?.installment_group_id
                ? "Esta é uma compra parcelada. Deseja excluir todas as parcelas vinculadas a esta compra?"
                : "Essa ação não pode ser desfeita."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {txToDelete?.installment_group_id ? "Excluir todas as parcelas" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AntecipacaoDialog tx={txAntecipar} onClose={() => setTxAntecipar(null)} />
    </div>
  );
}

function AntecipacaoDialog({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  const rows = useTransactions().filter((item) => item.installment_group_id === tx?.installment_group_id);
  const maxParcelas = tx?.installment_group_id
    ? Math.max(1, rows.filter((item) => (item.parcela ?? 0) >= (tx.parcela ?? 1)).length)
    : 1;
  const [quantas, setQuantas] = useState(1);
  const [valor, setValor] = useState(tx?.valor?.toString() ?? "0");

  React.useEffect(() => {
    if (!tx) return;
    setQuantas(1);
    setValor(tx.valor.toString());
  }, [tx]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tx?.installment_group_id) return;

    const count = Math.max(1, Math.min(Number(quantas) || 1, maxParcelas));
    const novoValor = Number(valor);

    if (!(novoValor > 0)) {
      toast.error("Informe um valor maior que zero");
      return;
    }

    anteciparParcelas(tx.installment_group_id, count, novoValor, new Date());
    toast.success("Parcelas antecipadas com sucesso!");
    onClose();
  };

  return (
    <Dialog open={!!tx} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Antecipar parcelas</DialogTitle>
        </DialogHeader>
        {tx && (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="antecipar-qtd">Quantas parcelas (de trás para frente) deseja antecipar?</Label>
              <Input id="antecipar-qtd" type="number" min={1} max={maxParcelas} value={quantas} onChange={(e) => setQuantas(Number(e.target.value) || 1)} />
              <span className="text-xs text-muted-foreground">Máximo: {maxParcelas} parcelas restantes</span>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="antecipar-valor">Valor da parcela com desconto/acréscimo</Label>
              <Input id="antecipar-valor" type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>

            <DialogFooter>
              <Button type="submit">Confirmar antecipação</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
