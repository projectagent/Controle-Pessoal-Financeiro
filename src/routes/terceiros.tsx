import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Pencil, Plus, ReceiptText, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, deleteContact, toggleTransactionPaid, totalAReceberGeral, totalAReceberMes, upsertContact, useContacts, useThirdPartySummary, useTransactions, type Contact } from "@/lib/finance";

export const Route = createFileRoute("/terceiros")({
  head: () => ({
    meta: [
      { title: "Terceiros — Controle Financeiro Pessoal" },
      { name: "description", content: "Acompanhe gastos feitos para outras pessoas e os valores a receber." },
    ],
  }),
  component: Terceiros,
});

function Terceiros() {
  const contacts = useContacts();
  const transactions = useTransactions();
  const [editing, setEditing] = useState<Contact | null | undefined>(undefined);
  const [viewing, setViewing] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<Contact | null>(null);

  const currentMonth = new Date().toISOString().slice(0, 7);
  const { summary: sqlSummary } = useThirdPartySummary(currentMonth);

  const receivableMonth = sqlSummary ? sqlSummary.total_a_receber_mes : totalAReceberMes(contacts, transactions, currentMonth);
  const receivableTotal = sqlSummary ? sqlSummary.total_a_receber_geral : totalAReceberGeral(contacts, transactions);

  const contactTransactions = viewing
    ? transactions
        .filter((transaction) => transaction.contact_id === viewing.id && transaction.tipo === "despesa")
        .sort((a, b) => b.data.localeCompare(a.data))
    : [];

  const viewingPendingMonth = viewing ? totalAReceberMes(viewing, transactions, currentMonth) : 0;
  const viewingPendingTotal = viewing ? totalAReceberGeral(viewing, transactions) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Terceiros</h1>
          <p className="mt-1 text-sm text-muted-foreground">Pessoas e despesas que você pagou e ainda precisa receber.</p>
        </div>
        <Button onClick={() => setEditing(null)}><Plus className="size-4" /> Novo terceiro</Button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">A Receber (Este Mês)</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums text-orange-400">
            {brl(receivableMonth)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Despesas pendentes com vencimento neste mês</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">Total a Receber (Geral)</p>
          <p className="mt-2 font-display text-lg font-medium tabular-nums text-muted-foreground">
            {brl(receivableTotal)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Todas as despesas pendentes acumuladas</p>
        </div>
      </section>

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <UserRound className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Nenhum terceiro cadastrado</p>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre uma pessoa para acompanhar os valores que ela deve.</p>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {contacts.map((contact) => {
            const contactSql = sqlSummary?.contacts.find((c) => c.id === contact.id);
            const amountTotal = contactSql ? contactSql.total_a_receber_geral : totalAReceberGeral(contact, transactions);
            const amountMonth = contactSql ? contactSql.total_a_receber_mes : totalAReceberMes(contact, transactions, currentMonth);

            return (
              <div key={contact.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-primary"><UserRound className="size-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{contact.name}</p>
                    <p className={`mt-0.5 text-sm font-semibold tabular-nums ${amountMonth > 0 ? "text-orange-400" : "text-muted-foreground"}`}>
                      A repassar neste mês: {brl(amountMonth)}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="mr-2 text-right">
                    <p className="text-xs tabular-nums text-muted-foreground">Total a receber (Geral): {brl(amountTotal)}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setViewing(contact)}><ReceiptText className="size-4" /> Ver gastos</Button>
                  <Button variant="ghost" size="icon" aria-label={`Editar ${contact.name}`} onClick={() => setEditing(contact)}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Excluir ${contact.name}`} onClick={() => setDeleting(contact)}><Trash2 className="size-4 text-muted-foreground" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ContactDialog contact={editing} onClose={() => setEditing(undefined)} />

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Gastos de {viewing?.name}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-card/50 p-3">
            <div>
              <p className="text-xs text-muted-foreground">A Receber (Este Mês)</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums text-orange-400">
                {brl(viewingPendingMonth)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total a Receber (Geral)</p>
              <p className="mt-1 font-display text-base font-medium tabular-nums text-muted-foreground">
                {brl(viewingPendingTotal)}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contactTransactions.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum gasto vinculado.</TableCell></TableRow>
                )}
                {contactTransactions.map((transaction) => (
                  <TableRow key={transaction.id} className={transaction.is_paid ? "opacity-60 bg-muted/20" : ""}>
                    <TableCell>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={!!transaction.is_paid}
                        onClick={() => {
                          const next = toggleTransactionPaid(transaction.id);
                          toast.success(next ? "Transação marcada como paga" : "Transação marcada como pendente");
                        }}
                        className={`flex size-5 items-center justify-center rounded border transition-colors ${
                          transaction.is_paid
                            ? "border-emerald-600 bg-emerald-600 text-white"
                            : "border-input bg-background hover:border-emerald-500 text-transparent hover:text-emerald-500/50"
                        }`}
                        title={transaction.is_paid ? "Marcar como pendente" : "Dar baixa (Marcar como pago)"}
                      >
                        <Check className="size-3.5 stroke-[3]" />
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{transaction.data.split("-").reverse().join("/")}</TableCell>
                    <TableCell>
                      <span className={transaction.is_paid ? "line-through text-muted-foreground" : ""}>
                        {transaction.descricao}
                      </span>
                      {transaction.is_paid && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 no-underline">
                          <Check className="size-3" /> Pago
                        </span>
                      )}
                      {transaction.totalParcelas && <span className="ml-2 text-xs text-muted-foreground">{transaction.parcela}/{transaction.totalParcelas}</span>}
                    </TableCell>
                    <TableCell>{transaction.categoria}</TableCell>
                    <TableCell className={`text-right font-medium ${transaction.is_paid ? "line-through text-muted-foreground" : "text-expense"}`}>
                      {brl(transaction.valor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-sm text-muted-foreground">
            <span>Clique no ícone de status para dar baixa ou reverter.</span>
            <span>Total pendente: <strong className="ml-1 text-amber-400">{brl(viewingPendingTotal)}</strong></span>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Um terceiro com despesas vinculadas não pode ser removido. Reatribua ou exclua os gastos primeiro.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!deleting) return;
              if (deleteContact(deleting.id)) toast.success("Terceiro excluído");
              else toast.error("Não é possível excluir", { description: "Existem despesas vinculadas a esta pessoa." });
              setDeleting(null);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ContactDialog({ contact, onClose }: { contact: Contact | null | undefined; onClose: () => void }) {
  return (
    <Dialog open={contact !== undefined} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{contact?.id ? "Editar terceiro" : "Novo terceiro"}</DialogTitle></DialogHeader>
        {contact !== undefined && <ContactForm key={contact?.id ?? "new-contact"} contact={contact} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({ contact, onClose }: { contact: Contact | null; onClose: () => void }) {
  const [name, setName] = useState(contact?.name ?? "");

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { toast.error("Informe o nome da pessoa"); return; }
    const id = upsertContact(name, contact?.id);
    if (!contact && id !== undefined && id !== "") toast.success("Terceiro cadastrado");
    else toast.success("Terceiro atualizado");
    onClose();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="contact-name">Nome</Label><Input id="contact-name" autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: João Silva" /></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar</Button></div>
    </form>
  );
}
