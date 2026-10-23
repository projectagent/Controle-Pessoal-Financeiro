import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  brl, CATEGORIAS, cartaoDe, deleteCard, faturaAberta, faturaDe, limiteUsado, removeTransaction,
  updateTransaction, upsertCard, useCards, useTransactions, type Cartao, type Transaction,
} from "@/lib/finance";

export const Route = createFileRoute("/cartoes")({
  head: () => ({
    meta: [
      { title: "Cartões — FalaGrana" },
      { name: "description", content: "Faturas e limites dos seus cartões de crédito, com parcelas organizadas por mês." },
      { property: "og:title", content: "Cartões — FalaGrana" },
      { property: "og:description", content: "Faturas e limites dos seus cartões de crédito, com parcelas organizadas por mês." },
    ],
  }),
  component: Cartoes,
});

const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function Cartoes() {
  const txs = useTransactions();
  const cards = useCards();
  const [selId, setSelId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [cardForm, setCardForm] = useState<Partial<Cartao> | null>(null);
  const [toDelete, setToDelete] = useState<Cartao | null>(null);
  const [txEdit, setTxEdit] = useState<Transaction | null>(null);

  const cartao = cards.find((c) => c.id === selId) ?? cards[0];

  const header = (
    <div className="flex items-center justify-between">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Cartões</h1>
      <Button onClick={() => setCardForm({})}><Plus className="size-4" /> Novo Cartão</Button>
    </div>
  );

  const dialogs = (
    <>
      <CardDialog value={cardForm} onClose={() => setCardForm(null)} onSaved={(id) => id && setSelId(id)} />
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {toDelete?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>Essa ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!toDelete) return;
                if (deleteCard(toDelete.id)) {
                  toast.success("Cartão excluído");
                  if (selId === toDelete.id) setSelId(null);
                } else {
                  toast.error("Não é possível excluir", { description: "Existem transações vinculadas a este cartão." });
                }
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TxDialog tx={txEdit} onClose={() => setTxEdit(null)} />
    </>
  );

  if (!cartao) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        {header}
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          Nenhum cartão cadastrado. Clique em "Novo Cartão" para começar.
        </div>
        {dialogs}
      </div>
    );
  }

  const hoje = new Date();
  const base = new Date(hoje.getFullYear(), hoje.getMonth() + (hoje.getDate() > cartao.fechamento ? 1 : 0) + offset, 1);
  const mes = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
  const fechamento = new Date(base.getFullYear(), base.getMonth(), cartao.fechamento);
  const vencimento = new Date(base.getFullYear(), base.getMonth(), cartao.vencimento);
  const aberta = mes >= faturaAberta(cartao, hoje);

  const itens = txs
    .filter((t) => t.conta === "Crédito" && t.tipo === "despesa" && cartaoDe(t, cards) === cartao.id && faturaDe(t, cartao) === mes)
    .sort((a, b) => a.data.localeCompare(b.data));
  const total = itens.reduce((s, t) => s + t.valor, 0);
  const usado = limiteUsado(cartao, txs, cards, hoje);
  const disponivel = cartao.limite - usado;
  const pctLimite = cartao.limite > 0 ? Math.min(100, (usado / cartao.limite) * 100) : 0;
  const mesLabel = base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      {header}

      <div className="flex gap-3 overflow-x-auto pb-1">
        {cards.map((c) => {
          const active = c.id === cartao.id;
          return (
            <div
              key={c.id}
              role="button"
              tabIndex={0}
              onClick={() => { setSelId(c.id); setOffset(0); }}
              onKeyDown={(e) => e.key === "Enter" && (setSelId(c.id), setOffset(0))}
              className={`group flex min-w-56 cursor-pointer flex-col gap-6 rounded-xl border p-4 text-left transition-all ${active ? "border-primary bg-gradient-to-br from-primary/20 to-card shadow-lg" : "border-border bg-card opacity-70 hover:opacity-100"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.nome}</span>
                <CreditCard className={`size-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="flex items-end justify-between">
                <span className="text-xs text-muted-foreground">Limite {brl(c.limite)}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Editar ${c.nome}`} onClick={(e) => { e.stopPropagation(); setCardForm(c); }}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7" aria-label={`Excluir ${c.nome}`} onClick={(e) => { e.stopPropagation(); setToDelete(c); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
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
        <div className="mt-6 border-t border-border pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Limite Usado <span className="text-foreground">{brl(usado)}</span> de {brl(cartao.limite)}</span>
            <span className={disponivel < 0 ? "font-medium text-expense" : "font-medium text-income"}>Limite Disponível: {brl(disponivel)}</span>
          </div>
          <Progress value={pctLimite} className="mt-3 h-2.5" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor</TableHead><TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Nenhuma compra nesta fatura.</TableCell></TableRow>
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
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" aria-label="Editar transação" onClick={() => setTxEdit(t)}><Pencil className="size-4 text-muted-foreground" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Excluir transação" onClick={() => { removeTransaction(t.id); toast.success("Transação excluída"); }}>
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {dialogs}
    </div>
  );
}

function CardDialog({ value, onClose, onSaved }: { value: Partial<Cartao> | null; onClose: () => void; onSaved: (id?: string) => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{value?.id ? "Editar Cartão" : "Novo Cartão"}</DialogTitle></DialogHeader>
        {value && <CardForm key={value.id ?? "new"} initial={value} onDone={(id) => { onSaved(id); onClose(); }} />}
      </DialogContent>
    </Dialog>
  );
}

function CardForm({ initial, onDone }: { initial: Partial<Cartao>; onDone: (id?: string) => void }) {
  const [nome, setNome] = useState(initial.nome ?? "");
  const [limite, setLimite] = useState(initial.limite?.toString() ?? "");
  const [fech, setFech] = useState(initial.fechamento?.toString() ?? "");
  const [venc, setVenc] = useState(initial.vencimento?.toString() ?? "");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const l = Number(limite), f = Number(fech), v = Number(venc);
    if (!nome.trim()) return toast.error("Informe o nome do cartão");
    if (!(l > 0)) return toast.error("Informe um limite maior que zero");
    if (![f, v].every((d) => Number.isInteger(d) && d >= 1 && d <= 31)) return toast.error("Dias devem estar entre 1 e 31");
    upsertCard({ ...(initial.id ? { id: initial.id } : {}), nome: nome.trim(), limite: l, fechamento: f, vencimento: v });
    toast.success(initial.id ? "Cartão atualizado" : "Cartão criado");
    onDone(initial.id);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="c-nome">Nome do Cartão</Label><Input id="c-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Nubank" /></div>
      <div className="grid gap-2"><Label htmlFor="c-lim">Limite Total (R$)</Label><Input id="c-lim" type="number" step="0.01" min="0" value={limite} onChange={(e) => setLimite(e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2"><Label htmlFor="c-fech">Dia de Fechamento</Label><Input id="c-fech" type="number" min="1" max="31" value={fech} onChange={(e) => setFech(e.target.value)} /></div>
        <div className="grid gap-2"><Label htmlFor="c-venc">Dia de Vencimento</Label><Input id="c-venc" type="number" min="1" max="31" value={venc} onChange={(e) => setVenc(e.target.value)} /></div>
      </div>
      <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
    </form>
  );
}

function TxDialog({ tx, onClose }: { tx: Transaction | null; onClose: () => void }) {
  return (
    <Dialog open={!!tx} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar Transação</DialogTitle></DialogHeader>
        {tx && <TxForm key={tx.id} tx={tx} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function TxForm({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const [descricao, setDescricao] = useState(tx.descricao);
  const [valor, setValor] = useState(tx.valor.toString());
  const [categoria, setCategoria] = useState(tx.categoria);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(valor);
    if (!(v > 0)) return toast.error("Informe um valor maior que zero");
    updateTransaction(tx.id, { descricao: descricao.trim() || tx.descricao, valor: v, categoria });
    toast.success("Transação atualizada");
    onDone();
  };
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="t-desc">Descrição</Label><Input id="t-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
      <div className="grid gap-2"><Label htmlFor="t-val">Valor (R$)</Label><Input id="t-val" type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
      <div className="grid gap-2">
        <Label htmlFor="t-cat">Categoria</Label>
        <select id="t-cat" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>
      <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
    </form>
  );
}
