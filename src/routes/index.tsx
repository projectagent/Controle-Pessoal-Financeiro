import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bot, Check, Pencil, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addTransaction, brl, CARTOES, CATEGORIAS, CONTAS, parseMessage, type Draft } from "@/lib/finance";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Chat — FalaGrana" },
      { name: "description", content: "Registre gastos e receitas conversando, em linguagem natural." },
      { property: "og:title", content: "Chat — FalaGrana" },
      { property: "og:description", content: "Registre gastos e receitas conversando, em linguagem natural." },
    ],
  }),
  component: ChatPage,
});

type Msg =
  | { id: number; from: "user"; text: string }
  | { id: number; from: "bot"; text: string; draft?: Draft; status?: "pending" | "editing" | "saved" };

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
      const draft = parseMessage(t);
      setMsgs((m) => [
        ...m,
        draft
          ? { id: Date.now(), from: "bot", text: "Entendi! Confere os dados:", draft, status: "pending" }
          : { id: Date.now(), from: "bot", text: "Não encontrei um valor na mensagem. Tente algo como \"Gastei 30 no uber\"." },
      ]);
    }, 1000);
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
            ) : (
              <div key={m.id} className="flex max-w-[90%] gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary"><Bot className="size-4" /></span>
                <div className="space-y-3">
                  <div className="rounded-2xl rounded-tl-sm bg-secondary px-4 py-2.5 text-sm">{m.text}</div>
                  {m.draft && (
                    <DraftCard
                      draft={m.draft}
                      status={m.status!}
                      onChange={(draft) => update(m.id, { draft })}
                      onEdit={() => update(m.id, { status: m.status === "editing" ? "pending" : "editing" })}
                      onConfirm={() => { const { parcelas, ...tx } = m.draft!; addTransaction(tx, parcelas); update(m.id, { status: "saved" }); }}
                    />
                  )}
                </div>
              </div>
            ),
          )}
          {typing && (
            <div className="flex gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-secondary text-primary"><Bot className="size-4" /></span>
              <div className="flex items-center gap-1 rounded-2xl bg-secondary px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="size-1.5 animate-bounce rounded-full bg-muted-foreground" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
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

function DraftCard({ draft, status, onChange, onEdit, onConfirm }: {
  draft: Draft; status: "pending" | "editing" | "saved";
  onChange: (d: Draft) => void; onEdit: () => void; onConfirm: () => void;
}) {
  const editing = status === "editing";
  const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  return (
    <div className="w-72 rounded-xl border border-border bg-card p-4 shadow-lg">
      {editing ? (
        <div className="grid gap-2 text-sm">
          <select className={sel} value={draft.tipo} onChange={(e) => onChange({ ...draft, tipo: e.target.value as Draft["tipo"] })}>
            <option value="despesa">Despesa</option><option value="receita">Receita</option>
          </select>
          <Input type="number" step="0.01" value={draft.valor} onChange={(e) => onChange({ ...draft, valor: Number(e.target.value) })} />
          <select className={sel} value={draft.categoria} onChange={(e) => onChange({ ...draft, categoria: e.target.value })}>
            {CATEGORIAS.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className={sel} value={draft.conta} onChange={(e) => onChange({ ...draft, conta: e.target.value, cartao: e.target.value === "Crédito" ? draft.cartao ?? CARTOES[0]!.nome : undefined, parcelas: e.target.value === "Crédito" ? draft.parcelas : 1 })}>
            {CONTAS.map((c) => <option key={c}>{c}</option>)}
          </select>
          {draft.conta === "Crédito" && (
            <>
              <select className={sel} value={draft.cartao ?? CARTOES[0]!.nome} onChange={(e) => onChange({ ...draft, cartao: e.target.value })}>
                {CARTOES.map((c) => <option key={c.nome}>{c.nome}</option>)}
              </select>
              <label className="flex items-center gap-2 text-muted-foreground">Parcelas
                <Input type="number" min={1} max={48} value={draft.parcelas} onChange={(e) => onChange({ ...draft, parcelas: Math.max(1, Math.min(48, Number(e.target.value) || 1)) })} />
              </label>
            </>
          )}
          <Input value={draft.descricao} onChange={(e) => onChange({ ...draft, descricao: e.target.value })} />
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Valor</dt>
          <dd className={`text-right font-display font-semibold ${draft.tipo === "receita" ? "text-income" : "text-expense"}`}>{brl(draft.valor)}</dd>
          <dt className="text-muted-foreground">Tipo</dt><dd className="text-right capitalize">{draft.tipo}</dd>
          <dt className="text-muted-foreground">Categoria</dt><dd className="text-right">{draft.categoria}</dd>
          <dt className="text-muted-foreground">Conta</dt><dd className="text-right">{draft.conta}</dd>
          {draft.cartao && (<><dt className="text-muted-foreground">Cartão</dt><dd className="text-right">{draft.cartao}</dd></>)}
          {draft.parcelas > 1 && (
            <>
              <dt className="text-muted-foreground">Parcelas</dt>
              <dd className="text-right"><Badge variant="secondary">{draft.parcelas}x de {brl(draft.valor / draft.parcelas)}</Badge></dd>
            </>
          )}
        </dl>
      )}
      <div className="mt-4 flex gap-2">
        {status === "saved" ? (
          <p className="flex items-center gap-2 text-sm text-income"><Check className="size-4" /> {draft.parcelas > 1 ? `${draft.parcelas} parcelas lançadas no ${draft.cartao}` : "Transação salva"}</p>
        ) : (
          <>
            <Button size="sm" className="flex-1" onClick={onConfirm}><Check className="size-4" /> Confirmar</Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={onEdit}><Pencil className="size-4" /> {editing ? "Pronto" : "Editar"}</Button>
          </>
        )}
      </div>
    </div>
  );
}
