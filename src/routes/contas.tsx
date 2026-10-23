import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Landmark, Layers, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, deleteBankAccount, deleteCaixinha, saldoDaConta, saldoTotalComCaixinhas, useBankAccounts, useCaixinhas, useTransactions, type Caixinha, type ContaBancaria, type TipoContaBancaria, upsertBankAccount, upsertCaixinha } from "@/lib/finance";

export const Route = createFileRoute("/contas")({
  head: () => ({
    meta: [
      { title: "Contas — Controle Financeiro Pessoal" },
      { name: "description", content: "Gerencie suas contas bancárias e saldos." },
    ],
  }),
  component: Contas,
});

const tipoLabel: Record<TipoContaBancaria, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  dinheiro: "Dinheiro / carteira",
};

function Contas() {
  const accounts = useBankAccounts();
  const caixinhas = useCaixinhas();
  const transactions = useTransactions();
  const [form, setForm] = useState<Partial<ContaBancaria> | null>(null);
  const [toDelete, setToDelete] = useState<ContaBancaria | null>(null);
  const [caixinhaForm, setCaixinhaForm] = useState<Partial<Caixinha> | null>(null);
  const [caixinhaToDelete, setCaixinhaToDelete] = useState<Caixinha | null>(null);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Contas</h1>
          <p className="mt-1 text-sm text-muted-foreground">Contas bancárias e carteiras para organizar seus lançamentos.</p>
        </div>
        <Button onClick={() => setForm({ tipo: "corrente", saldoInicial: 0 })}><Plus className="size-4" /> Nova conta</Button>
      </div>

      {accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <Wallet className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Nenhuma conta cadastrada</p>
          <p className="mt-1 text-sm text-muted-foreground">Cadastre uma conta para vinculá-la aos próximos lançamentos.</p>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {accounts.map((account) => {
            const isNubank = account.instituicao.toLocaleLowerCase("pt-BR").includes("nubank");
            const accountPockets = caixinhas.filter((pocket) => pocket.contaBancariaId === account.id);
            const accountBalance = saldoDaConta(account, transactions);
            const pocketsBalance = accountPockets.reduce((total, pocket) => total + pocket.saldo, 0);

            return (
              <div key={account.id} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-secondary text-primary"><Landmark className="size-5" /></span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{account.nome}</p>
                      <p className="truncate text-sm text-muted-foreground">{[account.instituicao, tipoLabel[account.tipo]].filter(Boolean).join(" · ")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Saldo da conta</p>
                      <p className="font-semibold tabular-nums">{brl(accountBalance)}</p>
                    </div>
                    <Button variant="ghost" size="icon" aria-label={`Editar ${account.nome}`} onClick={() => setForm(account)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${account.nome}`} onClick={() => setToDelete(account)}><Trash2 className="size-4 text-muted-foreground" /></Button>
                  </div>
                </div>

                {isNubank && (
                  <Tabs defaultValue="caixinhas" className="mt-4">
                    <TabsList className="grid w-full grid-cols-2 sm:w-72">
                      <TabsTrigger value="conta">Conta Nubank</TabsTrigger>
                      <TabsTrigger value="caixinhas">Caixinhas</TabsTrigger>
                    </TabsList>
                    <TabsContent value="conta" className="rounded-lg border border-border bg-card/60 p-4">
                      <p className="text-sm text-muted-foreground">Saldo disponível na conta</p>
                      <p className="mt-2 font-display text-2xl font-semibold tabular-nums">{brl(accountBalance)}</p>
                    </TabsContent>
                    <TabsContent value="caixinhas" className="rounded-lg border border-border bg-card/60 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2"><Layers className="size-4 text-primary" /><h2 className="font-medium">Caixinhas Nubank</h2></div>
                        <Button size="sm" variant="outline" onClick={() => setCaixinhaForm({ contaBancariaId: account.id, saldo: 0 })}><Plus className="size-4" /> Nova caixinha</Button>
                      </div>
                      {accountPockets.length === 0 ? (
                        <p className="py-5 text-center text-sm text-muted-foreground">Nenhuma caixinha cadastrada.</p>
                      ) : (
                        <div className="mt-3 divide-y divide-border">
                          {accountPockets.map((pocket) => (
                            <div key={pocket.id} className="flex items-center justify-between gap-3 py-3">
                              <div className="min-w-0"><p className="truncate text-sm font-medium">{pocket.nome}</p><p className="text-xs text-muted-foreground">Saldo da caixinha</p></div>
                              <div className="flex items-center gap-2">
                                <p className="font-semibold tabular-nums">{brl(pocket.saldo)}</p>
                                <Button variant="ghost" size="icon" aria-label={`Editar ${pocket.nome}`} onClick={() => setCaixinhaForm(pocket)}><Pencil className="size-4" /></Button>
                                <Button variant="ghost" size="icon" aria-label={`Excluir ${pocket.nome}`} onClick={() => setCaixinhaToDelete(pocket)}><Trash2 className="size-4 text-muted-foreground" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-2 grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
                        <div><p className="text-xs text-muted-foreground">Saldo na conta</p><p className="mt-1 text-sm font-semibold tabular-nums">{brl(accountBalance)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Saldo nas caixinhas</p><p className="mt-1 text-sm font-semibold tabular-nums">{brl(pocketsBalance)}</p></div>
                        <div className="sm:text-right"><p className="text-xs text-muted-foreground">Saldo total Nubank</p><p className="mt-1 font-display text-lg font-semibold tabular-nums text-primary">{brl(saldoTotalComCaixinhas(accountBalance, accountPockets))}</p></div>
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AccountDialog value={form} onClose={() => setForm(null)} />
      <CaixinhaDialog value={caixinhaForm} onClose={() => setCaixinhaForm(null)} />
      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {toDelete?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>Contas com lançamentos ou caixinhas vinculadas não podem ser excluídas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!toDelete) return;
              if (deleteBankAccount(toDelete.id)) toast.success("Conta excluída");
              else toast.error("Não é possível excluir", { description: "Existem lançamentos ou caixinhas vinculadas a esta conta." });
              setToDelete(null);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!caixinhaToDelete} onOpenChange={(open) => !open && setCaixinhaToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {caixinhaToDelete?.nome}?</AlertDialogTitle>
            <AlertDialogDescription>O saldo informado para esta caixinha também será removido.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              if (!caixinhaToDelete) return;
              deleteCaixinha(caixinhaToDelete.id);
              toast.success("Caixinha excluída");
              setCaixinhaToDelete(null);
            }}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AccountDialog({ value, onClose }: { value: Partial<ContaBancaria> | null; onClose: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{value?.id ? "Editar conta" : "Nova conta"}</DialogTitle></DialogHeader>
        {value && <AccountForm key={value.id ?? "new"} initial={value} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function AccountForm({ initial, onDone }: { initial: Partial<ContaBancaria>; onDone: () => void }) {
  const [nome, setNome] = useState(initial.nome ?? "");
  const [instituicao, setInstituicao] = useState(initial.instituicao ?? "");
  const [tipo, setTipo] = useState<TipoContaBancaria>(initial.tipo ?? "corrente");
  const [saldo, setSaldo] = useState(String(initial.saldoInicial ?? 0));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const saldoInicial = Number(saldo);
    if (!nome.trim()) { toast.error("Informe um nome para a conta"); return; }
    if (!Number.isFinite(saldoInicial)) { toast.error("Informe um saldo inicial válido"); return; }
    upsertBankAccount({
      ...(initial.id ? { id: initial.id } : {}),
      nome: nome.trim(),
      instituicao: instituicao.trim(),
      tipo,
      saldoInicial,
    });
    toast.success(initial.id ? "Conta atualizada" : "Conta cadastrada");
    onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="account-name">Nome da conta</Label><Input id="account-name" value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Conta principal" /></div>
      <div className="grid gap-2"><Label htmlFor="account-institution">Banco ou instituição</Label><Input id="account-institution" value={instituicao} onChange={(event) => setInstituicao(event.target.value)} placeholder="Ex.: Nubank" /></div>
      <div className="grid gap-2">
        <Label htmlFor="account-type">Tipo</Label>
        <select id="account-type" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={tipo} onChange={(event) => setTipo(event.target.value as TipoContaBancaria)}>
          {Object.entries(tipoLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div className="grid gap-2"><Label htmlFor="account-balance">Saldo inicial (R$)</Label><Input id="account-balance" type="number" step="0.01" value={saldo} onChange={(event) => setSaldo(event.target.value)} /></div>
      <DialogFooter><Button type="submit">Salvar conta</Button></DialogFooter>
    </form>
  );
}

function CaixinhaDialog({ value, onClose }: { value: Partial<Caixinha> | null; onClose: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{value?.id ? "Editar caixinha" : "Nova caixinha Nubank"}</DialogTitle></DialogHeader>
        {value && <CaixinhaForm key={value.id ?? value.contaBancariaId} initial={value} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CaixinhaForm({ initial, onDone }: { initial: Partial<Caixinha>; onDone: () => void }) {
  const [nome, setNome] = useState(initial.nome ?? "");
  const [saldo, setSaldo] = useState(String(initial.saldo ?? 0));

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const currentBalance = Number(saldo);
    if (!nome.trim()) { toast.error("Informe um nome para a caixinha"); return; }
    if (!Number.isFinite(currentBalance) || currentBalance < 0) { toast.error("Informe um saldo válido"); return; }
    if (!initial.contaBancariaId) return;

    upsertCaixinha({
      ...(initial.id ? { id: initial.id } : {}),
      contaBancariaId: initial.contaBancariaId,
      nome: nome.trim(),
      saldo: currentBalance,
    });
    toast.success(initial.id ? "Caixinha atualizada" : "Caixinha cadastrada");
    onDone();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="pocket-name">Nome da caixinha</Label><Input id="pocket-name" value={nome} onChange={(event) => setNome(event.target.value)} placeholder="Ex.: Reserva de emergência" /></div>
      <div className="grid gap-2"><Label htmlFor="pocket-balance">Saldo atual (R$)</Label><Input id="pocket-balance" type="number" min="0" step="0.01" value={saldo} onChange={(event) => setSaldo(event.target.value)} /></div>
      <DialogFooter><Button type="submit">Salvar caixinha</Button></DialogFooter>
    </form>
  );
}