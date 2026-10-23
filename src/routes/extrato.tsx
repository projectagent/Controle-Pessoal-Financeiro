import { createFileRoute } from "@tanstack/react-router";
import React, { useState } from "react";
import { CalendarX, Check, ChevronLeft, ChevronRight, FastForward, Plus, Repeat, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContactPicker } from "@/components/ContactPicker";
import { TransactionAccountPicker } from "@/components/TransactionAccountPicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { addTransaction, agruparPorDia, anteciparParcelas, brl, deslocarMes, resumoMensalSeparado, transacoesDoMes, ym, cancelarRenovacaoAssinatura, CATEGORIAS, reativarRenovacaoAssinatura, removeTransaction, removeTransactionsByInstallmentGroupId, tipoDaContaTransacao, toggleTransactionPaid, useContacts, useTransactionAccounts, useTransactions, type Transaction, type TxType } from "@/lib/finance";

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
  const accounts = useTransactionAccounts();
  const contacts = useContacts();
  const [accountFilter, setAccountFilter] = useState("__all_accounts__");
  const [manualFormOpen, setManualFormOpen] = useState(false);
  const [filter, setFilter] = useState<"todos" | "proprio" | "terceiros">("todos");
  const [txToDelete, setTxToDelete] = useState<Transaction | null>(null);
  const [txAntecipar, setTxAntecipar] = useState<Transaction | null>(null);
  const [mes, setMes] = useState(() => { const hoje = new Date(); return ym(hoje.getFullYear(), hoje.getMonth()); });
  const visibleTxs = transacoesDoMes(txs, mes).filter((transaction) => {
    if (accountFilter !== "__all_accounts__" && transaction.account_id !== accountFilter) return false;
    if (filter === "proprio") return !transaction.contact_id;
    if (filter === "terceiros") return !!transaction.contact_id;
    return true;
  });
  const dias = agruparPorDia(visibleTxs);
  const resumo = resumoMensalSeparado(transacoesDoMes(txs, mes));
  const [anoSel, mesSel] = mes.split("-").map(Number) as [number, number];
  const mesLabel = new Date(anoSel, mesSel - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
  const mesTitulo = `${mesLabel.charAt(0).toUpperCase()}${mesLabel.slice(1)} ${anoSel}`;

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Extrato</h1>
        <Button onClick={() => setManualFormOpen(true)}><Plus className="size-4" /> Nova transação</Button>
      </div>
      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" size="icon" aria-label="Mês anterior" onClick={() => setMes((m) => deslocarMes(m, -1))}><ChevronLeft className="size-5" /></Button>
        <h2 className="min-w-44 text-center font-display text-lg font-semibold">{mesTitulo}</h2>
        <Button variant="ghost" size="icon" aria-label="Próximo mês" onClick={() => setMes((m) => deslocarMes(m, 1))}><ChevronRight className="size-5" /></Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Total Gastos Mês</p><p className="mt-1 font-display text-xl font-semibold tabular-nums text-expense">{brl(resumo.gastos)}</p><p className="mt-0.5 text-xs text-muted-foreground">Somente despesas suas</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">A Receber (Terceiros)</p><p className="mt-1 font-display text-xl font-semibold tabular-nums text-orange-400">{brl(resumo.aReceber)}</p><p className="mt-0.5 text-xs text-muted-foreground">Pendentes de repasse</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Total Gasto (Geral)</p><p className="mt-1 font-display text-xl font-semibold tabular-nums text-foreground">{brl(resumo.totalGasto)}</p><p className="mt-0.5 text-xs text-muted-foreground">Seus gastos + repasse de terceiros</p></div>
        <div className="rounded-xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Entradas</p><p className="mt-1 font-display text-xl font-semibold tabular-nums text-income">{brl(resumo.entradas)}</p><p className="mt-0.5 text-xs text-muted-foreground">Receitas do mês</p></div>
      </div>
      <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
        <TabsList>
          <TabsTrigger value="todos">Todos</TabsTrigger>
          <TabsTrigger value="proprio">Meus Gastos</TabsTrigger>
          <TabsTrigger value="terceiros">Terceiros</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="max-w-xs">
        <Select value={accountFilter} onValueChange={setAccountFilter}>
          <SelectTrigger><SelectValue placeholder="Todas as contas e cartões" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all_accounts__">Todas as contas e cartões</SelectItem>
            {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}{account.type === "CREDIT_CARD" ? " · Cartão" : " · Conta"}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {dias.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center text-muted-foreground">Nenhuma transação em {mesTitulo}.</div>
      ) : (
        <div className="space-y-6">
          {dias.map(({ data, items }) => {
            const [, mm, dd] = data.split("-").map(Number) as [number, number, number];
            const nomeMes = new Date(anoSel, mm - 1, 1).toLocaleDateString("pt-BR", { month: "long" });
            return (
              <section key={data}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">{dd} de {nomeMes.charAt(0).toUpperCase()}{nomeMes.slice(1)}</h3>
                <div className="divide-y divide-border rounded-xl border border-border bg-card">
                  {items.map((t) => (
                    <div key={t.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${t.is_paid ? "bg-muted/20 opacity-60" : ""}`}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={!!t.is_paid}
                        onClick={() => {
                          const next = toggleTransactionPaid(t.id);
                          toast.success(next ? "Transação marcada como paga" : "Transação marcada como pendente");
                        }}
                        className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                          t.is_paid
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-input bg-background text-transparent hover:border-emerald-500 hover:text-emerald-500/50"
                        }`}
                        title={t.is_paid ? "Marcar como pendente" : "Dar baixa (Marcar como pago)"}
                      >
                        <Check className="size-3.5 stroke-[3]" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={t.is_paid ? "text-muted-foreground line-through" : "font-medium"}>{t.descricao}</span>
                          {t.is_paid && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400"><Check className="size-3" /> Pago</span>}
                          {t.totalParcelas && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{t.parcela}/{t.totalParcelas}</span>}
                          {t.contact_id && <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-400">👤 {contacts.find((contact) => contact.id === t.contact_id)?.name ?? "Terceiro"}</span>}
                          {t.categoria === "Assinatura / Fixo" && (
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${t.is_recurring ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-zinc-500/30 bg-zinc-500/10 text-zinc-400"}`}>
                              <Repeat className="size-3" />{t.is_recurring ? "Renovação ativa" : "Renovação cancelada"}
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {t.categoria} · {accounts.find((account) => account.id === t.account_id)?.name
                            ?? (t.account_id ? "Conta removida" : Object.prototype.hasOwnProperty.call(t, "account_id") ? "Não informado" : t.conta)}
                        </p>
                      </div>
                      <p className={`font-medium tabular-nums ${t.is_paid ? "text-muted-foreground line-through" : t.tipo === "receita" ? "text-income" : t.contact_id ? "text-orange-400" : "text-expense"}`}>
                        {t.tipo === "receita" ? "+" : "−"} {brl(t.valor)}
                      </p>
                      <div className="flex items-center gap-1">
                        {t.categoria === "Assinatura / Fixo" && t.is_recurring && (
                          <Button variant="ghost" size="icon" aria-label="Cancelar Renovação" title="Cancelar Renovação" onClick={() => { cancelarRenovacaoAssinatura(t); toast.success("Renovação cancelada para meses futuros"); }}>
                            <CalendarX className="size-4 text-amber-400" />
                          </Button>
                        )}
                        {t.categoria === "Assinatura / Fixo" && t.is_recurring === false && (
                          <Button variant="ghost" size="icon" aria-label="Reativar Renovação" title="Reativar Renovação" onClick={() => { reativarRenovacaoAssinatura(t); toast.success("Renovação automática reativada"); }}>
                            <Repeat className="size-4 text-emerald-400" />
                          </Button>
                        )}
                        {t.installment_group_id && (
                          <Button variant="ghost" size="icon" aria-label="Antecipar parcela" onClick={() => setTxAntecipar(t)}>
                            <FastForward className="size-4 text-muted-foreground" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setTxToDelete(t)}>
                          <Trash2 className="size-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

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
      <ManualTransactionDialog open={manualFormOpen} onClose={() => setManualFormOpen(false)} />
    </div>
  );
}

function ManualTransactionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tipo, setTipo] = useState<TxType>("despesa");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [categoria, setCategoria] = useState("Outros");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [contactId, setContactId] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(true);

  const resetAndClose = () => {
    setTipo("despesa");
    setDescricao("");
    setValor("");
    setCategoria("Outros");
    setAccountId(null);
    setData(new Date().toISOString().slice(0, 10));
    setContactId(null);
    setIsRecurring(true);
    onClose();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(valor);
    if (!descricao.trim()) { toast.error("Informe uma descrição"); return; }
    if (!(amount > 0)) { toast.error("Informe um valor maior que zero"); return; }
    const accountType = tipoDaContaTransacao(accountId);
    addTransaction({
      tipo,
      valor: amount,
      categoria,
      conta: accountType === "CREDIT_CARD" ? "Crédito" : "Débito",
      descricao: descricao.trim(),
      data,
      account_id: accountId,
      ...(accountType === "CREDIT_CARD" && accountId ? { cartao: accountId } : {}),
      ...(accountType === "CHECKING_ACCOUNT" && accountId ? { conta_bancaria_id: accountId } : {}),
      contact_id: tipo === "despesa" ? contactId : null,
      expense_owner: tipo === "despesa" && contactId ? "Terceiros" : "Próprio",
      ...(categoria === "Assinatura / Fixo" ? { is_recurring: isRecurring } : {}),
    });
    toast.success("Transação cadastrada");
    resetAndClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && resetAndClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova transação</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label htmlFor="manual-tipo">Tipo</Label><select id="manual-tipo" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={tipo} onChange={(event) => setTipo(event.target.value as TxType)}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></div>
            <div className="grid gap-2"><Label htmlFor="manual-valor">Valor (R$)</Label><Input id="manual-valor" type="number" min="0.01" step="0.01" value={valor} onChange={(event) => setValor(event.target.value)} /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="manual-descricao">Descrição</Label><Input id="manual-descricao" value={descricao} onChange={(event) => setDescricao(event.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label htmlFor="manual-categoria">Categoria</Label><select id="manual-categoria" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={categoria} onChange={(event) => setCategoria(event.target.value)}>{CATEGORIAS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="grid gap-2"><Label htmlFor="manual-account">Cartão / Conta</Label><TransactionAccountPicker id="manual-account" value={accountId} onChange={setAccountId} /></div>
          </div>
          <div className="grid gap-2"><Label htmlFor="manual-data">Data</Label><Input id="manual-data" type="date" value={data} onChange={(event) => setData(event.target.value)} /></div>
          {categoria === "Assinatura / Fixo" && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
              <div className="space-y-0.5">
                <Label htmlFor="manual-recurring" className="cursor-pointer text-sm font-medium">
                  Renovação Automática Ativa
                </Label>
                <p className="text-xs text-muted-foreground">
                  Lança automaticamente no início de cada mês
                </p>
              </div>
              <Switch
                id="manual-recurring"
                checked={isRecurring}
                onCheckedChange={setIsRecurring}
              />
            </div>
          )}
          {tipo === "despesa" && <ContactPicker value={contactId} onChange={setContactId} id="manual-contact" />}
          <DialogFooter><Button type="button" variant="outline" onClick={resetAndClose}>Cancelar</Button><Button type="submit">Salvar transação</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
