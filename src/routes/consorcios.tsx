import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, FastForward, Pencil, PiggyBank, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { brl, CATEGORIAS, anteciparParcelas, resumirPlanoLongoPrazo, toggleTransactionPaid, updateTransaction, updateTransactionsByInstallmentGroupId, useTransactions, type Transaction } from "@/lib/finance";

export const Route = createFileRoute("/consorcios")({
  head: () => ({
    meta: [
      { title: "Consórcios — Controle Financeiro Pessoal" },
      { name: "description", content: "Acompanhe o progresso de consórcios e financiamentos de longo prazo." },
    ],
  }),
  component: Consorcios,
});

interface Plano {
  key: string;
  groupId: string | null;
  transactions: Transaction[];
}

function Consorcios() {
  const transactions = useTransactions();
  const [editing, setEditing] = useState<Plano | null>(null);
  const [advancing, setAdvancing] = useState<Plano | null>(null);
  const [viewingPlanKey, setViewingPlanKey] = useState<string | null>(null);

  const matching = transactions.filter((transaction) =>
    transaction.tipo === "despesa" && (transaction.categoria === "Consórcio" || transaction.categoria === "Financiamento"),
  );
  const grouped = new Map<string, Plano>();
  for (const transaction of matching) {
    const key = transaction.installment_group_id ?? transaction.id;
    const current = grouped.get(key);
    if (current) current.transactions.push(transaction);
    else grouped.set(key, { key, groupId: transaction.installment_group_id ?? null, transactions: [transaction] });
  }
  const plans = [...grouped.values()].sort((a, b) => a.transactions[0].descricao.localeCompare(b.transactions[0].descricao));
  const viewingPlan = viewingPlanKey ? plans.find((p) => p.key === viewingPlanKey) ?? null : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Consórcios e Financiamentos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Progresso, parcelas e saldo devedor dos seus compromissos de longo prazo.</p>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-14 text-center">
          <PiggyBank className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 font-medium">Nenhum contrato de longo prazo</p>
          <p className="mt-1 text-sm text-muted-foreground">Registre uma despesa nas categorias Consórcio ou Financiamento para acompanhá-la aqui.</p>
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border">
          {plans.map((plan) => {
            const first = [...plan.transactions].sort((a, b) => (a.parcela ?? 0) - (b.parcela ?? 0))[0];
            const summary = resumirPlanoLongoPrazo(plan.transactions);
            const paidCount = summary.parcelaAtual;
            const remaining = Math.max(0, summary.totalParcelas - paidCount);
            const remainingRows = plan.transactions.filter((transaction) => (transaction.parcela ?? 0) > paidCount).length;
            const title = first.descricao || first.categoria;
            const assetValue = plan.transactions.find((transaction) => transaction.asset_value != null)?.asset_value;
            const acquiredEquity = assetValue == null ? null : Math.min(assetValue, summary.totalPago);
            const amountToContemplation = assetValue == null ? null : Math.max(0, assetValue - summary.totalPago);
            const equityPercent = assetValue ? Math.min(100, Math.round((summary.totalPago / assetValue) * 100)) : 0;

            return (
              <article key={plan.key} className="py-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{title}</h2>
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">{first.categoria}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">Parcela atual {brl(summary.valorParcela)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Button variant="outline" size="sm" onClick={() => setViewingPlanKey(plan.key)}>
                      <ReceiptText className="size-4" /> Parcelas
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditing(plan)}><Pencil className="size-4" /> Editar</Button>
                    <Button variant="outline" size="sm" onClick={() => setAdvancing(plan)} disabled={!plan.groupId || remainingRows === 0}>
                      <FastForward className="size-4" /> Antecipar
                    </Button>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{paidCount} de {summary.totalParcelas} parcelas pagas</span>
                    <span className="text-muted-foreground">{summary.percentualConcluido}%</span>
                  </div>
                  <Progress value={summary.percentualConcluido} className="h-2.5" />
                </div>

                {assetValue != null && (
                  <section className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Valor da Carta / Bem</p>
                        <p className="mt-1 font-display text-xl font-semibold tabular-nums text-primary">{brl(assetValue)}</p>
                      </div>
                      <p className="text-sm text-muted-foreground">Pago: {brl(summary.totalPago)} de {brl(assetValue)}</p>
                    </div>
                    <Progress value={equityPercent} className="mt-3 h-2" />
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div><p className="text-xs text-muted-foreground">Patrimônio adquirido (estimado)</p><p className="mt-1 font-semibold tabular-nums">{brl(acquiredEquity ?? 0)}</p></div>
                      <div><p className="text-xs text-muted-foreground">Saldo para contemplação</p><p className="mt-1 font-semibold tabular-nums">{brl(amountToContemplation ?? 0)}</p></div>
                    </div>
                  </section>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="border-l-2 border-income/50 pl-3">
                    <p className="text-xs text-muted-foreground">Total já pago (estimado)</p>
                    <p className="mt-1 font-semibold tabular-nums">{brl(summary.totalPago)}</p>
                  </div>
                  <div className="border-l-2 border-expense/50 pl-3">
                    <p className="text-xs text-muted-foreground">Saldo devedor</p>
                    <p className="mt-1 font-semibold tabular-nums">{brl(summary.saldoDevedor)}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <EditPlanDialog plan={editing} onClose={() => setEditing(null)} />
      <AdvancePlanDialog plan={advancing} onClose={() => setAdvancing(null)} />
      <ParcelasDialog plan={viewingPlan} onClose={() => setViewingPlanKey(null)} />
    </div>
  );
}

function ParcelasDialog({ plan, onClose }: { plan: Plano | null; onClose: () => void }) {
  if (!plan) return null;
  const sorted = [...plan.transactions].sort((a, b) => (a.parcela ?? 0) - (b.parcela ?? 0));
  const paidCount = sorted.filter((t) => t.is_paid).length;

  return (
    <Dialog open={!!plan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Parcelas — {plan.transactions[0].descricao || plan.transactions[0].categoria}
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{paidCount} de {sorted.length} parcelas pagas</span>
          <span className="text-xs">Dê baixa em cada parcela individualmente</span>
        </div>

        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Status</TableHead>
                <TableHead>Parcela</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((t) => (
                <TableRow key={t.id} className={t.is_paid ? "opacity-60 bg-muted/20" : ""}>
                  <TableCell>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={!!t.is_paid}
                      onClick={() => {
                        const next = toggleTransactionPaid(t.id);
                        toast.success(next ? `Parcela ${t.parcela ?? ""} marcada como paga` : `Parcela ${t.parcela ?? ""} marcada como pendente`);
                      }}
                      className={`flex size-5 items-center justify-center rounded border transition-colors ${
                        t.is_paid
                          ? "border-emerald-600 bg-emerald-600 text-white"
                          : "border-input bg-background hover:border-emerald-500 text-transparent hover:text-emerald-500/50"
                      }`}
                      title={t.is_paid ? "Marcar como pendente" : "Dar baixa (Marcar como pago)"}
                    >
                      <Check className="size-3.5 stroke-[3]" />
                    </button>
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className={t.is_paid ? "line-through text-muted-foreground" : ""}>
                      Parcela {t.parcela ?? 1}{t.totalParcelas ? ` de ${t.totalParcelas}` : ""}
                    </span>
                    {t.is_paid && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400 no-underline">
                        <Check className="size-3" /> Pago
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.data.split("-").reverse().join("/")}</TableCell>
                  <TableCell className={`text-right font-medium ${t.is_paid ? "line-through text-muted-foreground" : "text-expense"}`}>
                    {brl(t.valor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditPlanDialog({ plan, onClose }: { plan: Plano | null; onClose: () => void }) {
  return (
    <Dialog open={!!plan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar contrato</DialogTitle></DialogHeader>
        {plan && <EditPlanForm key={plan.key} plan={plan} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditPlanForm({ plan, onClose }: { plan: Plano; onClose: () => void }) {
  const initial = plan.transactions[0];
  const [descricao, setDescricao] = useState(initial.descricao);
  const [valor, setValor] = useState(String(initial.valor));
  const [assetValue, setAssetValue] = useState(initial.asset_value == null ? "" : String(initial.asset_value));
  const [categoria, setCategoria] = useState(initial.categoria);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(valor);
    if (!(amount > 0)) { toast.error("Informe uma parcela maior que zero"); return; }
    const patch = { descricao: descricao.trim() || initial.descricao, valor: amount, categoria };
    const parsedAssetValue = Number(assetValue);
    const assetPatch = assetValue.trim() && Number.isFinite(parsedAssetValue) && parsedAssetValue > 0 ? { asset_value: parsedAssetValue } : {};
    if (plan.groupId) updateTransactionsByInstallmentGroupId(plan.groupId, { ...patch, ...assetPatch });
    else updateTransaction(initial.id, { ...patch, ...assetPatch });
    toast.success("Contrato atualizado");
    onClose();
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2"><Label htmlFor="plan-description">Nome / descrição</Label><Input id="plan-description" value={descricao} onChange={(event) => setDescricao(event.target.value)} /></div>
      <div className="grid gap-2"><Label htmlFor="plan-installment">Valor unitário da parcela (R$)</Label><Input id="plan-installment" type="number" min="0.01" step="0.01" value={valor} onChange={(event) => setValor(event.target.value)} /></div>
      <div className="grid gap-2"><Label htmlFor="plan-asset-value">Valor da Carta / Bem (R$)</Label><Input id="plan-asset-value" type="number" min="0.01" step="0.01" value={assetValue} onChange={(event) => setAssetValue(event.target.value)} placeholder="Opcional" /></div>
      <div className="grid gap-2"><Label htmlFor="plan-category">Categoria</Label><select id="plan-category" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={categoria} onChange={(event) => setCategoria(event.target.value)}>{CATEGORIAS.filter((item) => item === "Consórcio" || item === "Financiamento").map((item) => <option key={item}>{item}</option>)}</select></div>
      <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit">Salvar contrato</Button></DialogFooter>
    </form>
  );
}

function AdvancePlanDialog({ plan, onClose }: { plan: Plano | null; onClose: () => void }) {
  const summary = plan ? resumirPlanoLongoPrazo(plan.transactions) : null;
  const remainingRows = plan?.transactions.filter((transaction) => (transaction.parcela ?? 0) > (summary?.parcelaAtual ?? 0)).length ?? 0;
  const maxAdvance = Math.min(summary?.totalParcelas ? summary.totalParcelas - summary.parcelaAtual : 0, remainingRows);
  const [quantidade, setQuantidade] = useState(1);
  const [valor, setValor] = useState(String(summary?.valorParcela ?? 0));

  useEffect(() => {
    if (!plan || !summary) return;
    setQuantidade(1);
    setValor(String(summary.valorParcela));
  }, [plan?.key]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!plan?.groupId) return;
    const amount = Number(valor);
    if (!(amount > 0)) { toast.error("Informe um valor maior que zero"); return; }
    const count = Math.max(1, Math.min(Number(quantidade) || 1, maxAdvance));
    anteciparParcelas(plan.groupId, count, amount, new Date());
    toast.success("Parcelas antecipadas com sucesso!");
    onClose();
  };

  return (
    <Dialog open={!!plan} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Antecipar parcelas</DialogTitle></DialogHeader>
        {plan && (
          <form onSubmit={submit} className="grid gap-4">
            <p className="text-sm text-muted-foreground">{plan.transactions[0].descricao}</p>
            <div className="grid gap-2"><Label htmlFor="long-plan-count">Quantidade de parcelas</Label><Input id="long-plan-count" type="number" min={1} max={maxAdvance} value={quantidade} onChange={(event) => setQuantidade(Number(event.target.value) || 1)} /><span className="text-xs text-muted-foreground">Máximo de parcelas futuras: {maxAdvance}</span></div>
            <div className="grid gap-2"><Label htmlFor="long-plan-value">Valor unitário com desconto/acréscimo (R$)</Label><Input id="long-plan-value" type="number" min="0.01" step="0.01" value={valor} onChange={(event) => setValor(event.target.value)} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" disabled={!plan.groupId || maxAdvance < 1}>Confirmar antecipação</Button></DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
