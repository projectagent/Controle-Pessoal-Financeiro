import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, CalendarDays, Check, CreditCard, Layers, Send, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { addTransaction, brl, extractFinancialTransactions, type StrictFinancialTransaction, useCards } from "@/lib/finance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chat — Controle Financeiro Pessoal" },
      { name: "description", content: "Registre gastos e receitas conversando, em linguagem natural." },
      { property: "og:title", content: "Chat — Controle Financeiro Pessoal" },
      { property: "og:description", content: "Registre gastos e receitas conversando, em linguagem natural." },
    ],
  }),
  component: ChatPage,
});

type Msg =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "bot"; text: string; extracted?: StrictFinancialTransaction[]; status?: "pending" | "saving" | "saved" | "discarded" };

function ChatPage() {
  const [msgs, setMsgs] = useState<Msg[]>([
    { id: 0, from: "bot", text: "Olá! Me conte o que você gastou ou recebeu e eu registro para você." },
  ]);
  const [text, setText] = useState("");
  const [typing, setTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;

    setText("");
    setMsgs((m) => [...m, { id: Date.now(), from: "user", text: t }]);
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      const extraction = extractFinancialTransactions(t);
      const valid = extraction.transactions.filter((tx) => tx.amount > 0);

      if (valid.length === 0) {
        setMsgs((m) => [...m, { id: Date.now(), from: "bot", text: "Não encontrei um valor válido para registrar. Tente algo como \"Gastei 30 no uber\" ou \"Recebi 1500 de salário\"." }]);
        return;
      }

      setMsgs((m) => [...m, { id: Date.now(), from: "bot", text: "Revise os lançamentos antes de confirmar:", extracted: valid, status: "pending" }]);
    }, 700);
  };

  const update = (id: number, patch: Partial<Extract<Msg, { from: "bot" }>>) =>
    setMsgs((m) => m.map((x) => (x.id === id && x.from === "bot" ? { ...x, ...patch } : x)));

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4 md:p-8">
          {msgs.map((m) =>
            m.from === "user" ? (
              <div key={m.id} className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                {m.text}
              </div>
            ) : m.status === "saved" ? (
              <div key={m.id} className="flex max-w-[90%] gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary"><Bot className="size-4" /></span>
                <div className="rounded-2xl rounded-tl-sm bg-secondary px-4 py-2.5 text-sm text-emerald-600">Lançamento registrado!</div>
              </div>
            ) : m.status === "discarded" ? (
              <div key={m.id} className="flex max-w-[90%] gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary"><Bot className="size-4" /></span>
                <div className="rounded-2xl rounded-tl-sm bg-secondary px-4 py-2.5 text-sm text-muted-foreground">Lançamento descartado.</div>
              </div>
            ) : (
              <div key={m.id} className="flex max-w-[90%] gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary"><Bot className="size-4" /></span>
                <div className="w-full space-y-3">
                  <div className="rounded-2xl rounded-tl-sm bg-secondary px-4 py-2.5 text-sm">{m.text}</div>
                  {m.extracted && (
                    <ConfirmationCard
                      items={m.extracted}
                      status={m.status ?? "pending"}
                      onConfirm={() => update(m.id, { status: "saved" })}
                      onDiscard={() => update(m.id, { status: "discarded" })}
                    />
                  )}
                </div>
              </div>
            ),
          )}
          {typing && (
            <div className="flex gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-secondary text-primary"><Bot className="size-4" /></span>
              <div className="flex items-center gap-2 rounded-2xl bg-secondary px-4 py-3 text-sm text-muted-foreground">
                <span className="text-foreground">Processando...</span>
                <span className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <form onSubmit={send} className="border-t border-border bg-background/80 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex: Gastei 45 no ifood hoje no débito" className="h-11" />
          <Button type="submit" size="icon" className="size-11 shrink-0" aria-label="Enviar"><Send className="size-4" /></Button>
        </div>
      </form>
    </div>
  );
}

function ConfirmationCard({ items, status, onConfirm, onDiscard }: {
  items: StrictFinancialTransaction[];
  status: "pending" | "saving" | "saved" | "discarded";
  onConfirm: () => void;
  onDiscard: () => void;
}) {
  const cards = useCards();
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(status === "saved" || status === "discarded");

  const handleConfirm = () => {
    if (saving || done) return;
    setSaving(true);

    items.forEach((item) => {
      const normalizedAccount = item.account === "Cartão de Crédito" ? "Crédito" : item.account === "Conta Corrente" ? "Débito" : "Débito";
      const conta = normalizedAccount === "Crédito" ? "Crédito" : "Débito";
      const cardId = conta === "Crédito" ? cards[0]?.id : undefined;
      const parcelas = item.installments && item.installments > 1 ? item.installments : 1;
      const tipo = item.type === "INCOME" ? "receita" : "despesa";

      addTransaction(
        {
          tipo,
          valor: Number(item.amount),
          categoria: item.category || "Outros",
          conta,
          descricao: item.description,
          data: item.date || new Date().toISOString().slice(0, 10),
          cartao: cardId,
        },
        parcelas,
      );
    });

    toast.success("Lançamento registrado!");
    setDone(true);
    setSaving(false);
    onConfirm();
  };

  const handleDiscard = () => {
    if (saving || done) return;
    setDone(true);
    onDiscard();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) handleDiscard();
  };

  return (
    <Dialog open={!done && status === "pending"} onOpenChange={handleOpenChange}>
      <DialogContent
        overlayClassName="bg-black/60 backdrop-blur-sm"
        className="max-h-[90vh] max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl duration-300 data-[state=open]:slide-in-from-bottom-4 sm:p-6"
      >
        <DialogHeader className="mb-1 text-center sm:text-center">
          <DialogTitle className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Revisar lançamento{items.length > 1 ? "s" : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {items.map((item, index) => {
            const isIncome = item.type === "INCOME";
            const date = new Date(`${item.date || new Date().toISOString().slice(0, 10)}T00:00:00`);
            const formattedDate = date.toLocaleDateString("pt-BR");

            return (
              <section key={`${item.description}-${index}`} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="pb-5 pt-1 text-center">
                  <p className={`font-display text-4xl font-extrabold tabular-nums sm:text-5xl ${isIncome ? "text-emerald-500" : "text-rose-500"}`}>
                    {brl(item.amount)}
                  </p>
                  <p className="mt-2 text-lg font-medium text-zinc-300">{item.description}</p>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="min-w-0 rounded-lg border border-white/5 bg-white/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Tag className="size-3.5" /> Categoria</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{item.category || "Outros"}</p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-white/5 bg-white/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CreditCard className="size-3.5" /> Conta</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{item.account ?? "Não informada"}</p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-white/5 bg-white/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays className="size-3.5" /> Data</p>
                    <p className="mt-1 text-sm font-semibold text-white">{formattedDate}</p>
                  </div>
                  <div className="min-w-0 rounded-lg border border-white/5 bg-white/5 p-3">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Layers className="size-3.5" /> Parcelas</p>
                    <p className="mt-1 text-sm font-semibold text-white">{item.installments > 1 ? `${item.installments}x` : "À vista"}</p>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-1 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 border-white/10 bg-transparent text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            onClick={handleDiscard}
            disabled={saving || done}
          >
            <Trash2 className="size-4" />
            Descartar
          </Button>
          <Button
            type="button"
            className="flex-1 bg-emerald-600 font-bold text-white transition-colors hover:bg-emerald-700"
            onClick={handleConfirm}
            disabled={saving || done}
          >
            <Check className="size-4" />
            {saving ? "Salvando..." : "Confirmar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
