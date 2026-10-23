import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, Database, ShieldAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { zerarAplicativo, useTransactions, useContacts, useTransactionAccounts } from "@/lib/finance";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Controle Financeiro Pessoal" },
      { name: "description", content: "Configurações do sistema e gerenciamento de dados." },
    ],
  }),
  component: Configuracoes,
});

function Configuracoes() {
  const navigate = useNavigate();
  const txs = useTransactions();
  const contacts = useContacts();
  const accounts = useTransactionAccounts();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleReset = async () => {
    if (confirmText.trim() !== "CONFIRMAR") {
      toast.error('Digite exatamente "CONFIRMAR" para prosseguir.');
      return;
    }

    try {
      setIsDeleting(true);
      await zerarAplicativo();
      toast.success("Banco de dados zerado com sucesso! Todos os dados foram apagados.");
      setConfirmOpen(false);
      setConfirmText("");
      // Navigate to dashboard with fresh empty state
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha ao zerar dados: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-4 md:p-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerenciamento do sistema, armazenamento local SQLite e preferências.
        </p>
      </div>

      {/* Resumo do Armazenamento */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md bg-secondary text-primary">
            <Database className="size-4" />
          </span>
          <div>
            <h2 className="font-medium">Armazenamento de Dados</h2>
            <p className="text-xs text-muted-foreground">Banco de dados local físico SQLite (`database.sqlite`)</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Transações Registradas</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums">{txs.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Contas e Cartões</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums">{accounts.length}</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground">Contatos de Terceiros</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums">{contacts.length}</p>
          </div>
        </div>
      </section>

      {/* Zona de Perigo / Danger Zone */}
      <section className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="grid size-9 shrink-0 place-items-center rounded-md bg-rose-500/10 text-rose-500">
            <AlertTriangle className="size-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-medium text-rose-500">Zona de Perigo (Danger Zone)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Esta ação é irreversível e excluirá permanentemente todos os registros do banco de dados operacional
              (transações, parcelas de consórcios, contas bancárias, cartões e contatos), mantendo apenas o schema intacto.
            </p>

            <div className="mt-5">
              <Button
                variant="destructive"
                className="gap-2"
                onClick={() => {
                  setConfirmText("");
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="size-4" />
                Apagar Todos os Dados
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Modal de Alerta Crítico com Dupla Confirmação */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
              <ShieldAlert className="size-6" />
            </div>
            <DialogTitle className="text-center font-display text-lg text-rose-500">
              Atenção: Ação Crítica e Irreversível
            </DialogTitle>
            <DialogDescription className="text-center text-sm text-muted-foreground">
              Você está prestes a limpar todo o banco de dados. Esta operação apagará definitivamente todas as transações,
              contas, cartões e terceiros.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-md border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-400">
              <strong>Importante:</strong> Seus dados não poderão ser recuperados após a conclusão.
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-input" className="text-xs">
                Para confirmar a exclusão definitiva, digite <span className="font-mono font-bold text-foreground">CONFIRMAR</span>:
              </Label>
              <Input
                id="confirm-input"
                placeholder="CONFIRMAR"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                className="font-mono uppercase tracking-wider"
                autoFocus
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={isDeleting}
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={confirmText.trim() !== "CONFIRMAR" || isDeleting}
              onClick={handleReset}
              className="gap-2"
            >
              {isDeleting ? "Apagando dados..." : "Sim, apagar tudo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
