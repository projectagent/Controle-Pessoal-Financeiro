import { useState } from "react";
import { Plus, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { upsertTransactionAccount, useTransactionAccounts, type TransactionAccountType } from "@/lib/finance";

const NO_ACCOUNT = "__no_transaction_account__";
const ACTION_NEW_ACCOUNT = "__action_new_account__";

export function TransactionAccountPicker({
  value,
  onChange,
  suggestedName,
  id = "transaction-account",
  className = "",
}: {
  value: string | null;
  onChange: (accountId: string | null) => void;
  suggestedName?: string | null;
  id?: string;
  className?: string;
}) {
  const accounts = useTransactionAccounts();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState(suggestedName ?? "");
  const [type, setType] = useState<TransactionAccountType>("CHECKING_ACCOUNT");
  const matchedSuggestion = suggestedName
    ? accounts.find((account) => account.name.toLowerCase() === suggestedName.toLowerCase())
    : undefined;

  const create = () => {
    const accountId = upsertTransactionAccount(name, type);
    if (!accountId) {
      toast.error("Informe o nome do cartão ou conta");
      return;
    }
    onChange(accountId);
    setName("");
    setCreating(false);
    toast.success(type === "CREDIT_CARD" ? "Cartão cadastrado" : "Conta cadastrada");
  };

  const createSuggested = () => {
    if (!suggestedName) return;
    const accountId = upsertTransactionAccount(suggestedName, "CHECKING_ACCOUNT");
    if (accountId) onChange(accountId);
    toast.success(`${suggestedName} selecionada`);
  };

  return (
    <div className={`grid gap-2 ${className}`}>
      <div className="flex items-center gap-2">
        <Select
          value={value ?? NO_ACCOUNT}
          onValueChange={(selected) => {
            if (selected === ACTION_NEW_ACCOUNT) {
              setName(suggestedName ?? "");
              setCreating(true);
              return;
            }
            onChange(selected === NO_ACCOUNT ? null : selected);
          }}
        >
          <SelectTrigger id={id} className="min-w-0 flex-1">
            <SelectValue placeholder="Nenhum / Não informar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ACCOUNT}>Nenhum / Não informar</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.name} · {account.type === "CREDIT_CARD" ? "Cartão de crédito" : "Conta"}
              </SelectItem>
            ))}
            <SelectItem
              value={ACTION_NEW_ACCOUNT}
              className="mt-1 cursor-pointer border-t border-border/50 font-medium text-emerald-500 focus:bg-emerald-500/10 focus:text-emerald-400"
            >
              <span className="flex items-center gap-1.5">
                <Plus className="size-3.5" />
                + Novo Cartão/Conta
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Novo cartão ou conta"
          title="+ Novo Cartão/Conta"
          onClick={() => {
            setName(suggestedName ?? "");
            setCreating((current) => !current);
          }}
        >
          <Plus className="size-4" />
        </Button>
      </div>
      {matchedSuggestion && !value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start text-primary"
          onClick={() => onChange(matchedSuggestion.id)}
        >
          <WalletCards className="mr-1.5 size-4" /> Usar {matchedSuggestion.name} detectado
        </Button>
      )}
      {suggestedName && !matchedSuggestion && !value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="justify-start text-primary"
          onClick={createSuggested}
        >
          <Plus className="mr-1.5 size-4" /> Cadastrar conta detectada: {suggestedName}
        </Button>
      )}
      {creating && (
        <div className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[1fr_10rem_auto]">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nome: Nubank, Itaú..."
            onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), create())}
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={type}
            onChange={(event) => setType(event.target.value as TransactionAccountType)}
          >
            <option value="CHECKING_ACCOUNT">Conta</option>
            <option value="CREDIT_CARD">Cartão de crédito</option>
          </select>
          <Button type="button" size="sm" onClick={create}>Adicionar</Button>
        </div>
      )}
    </div>
  );
}
