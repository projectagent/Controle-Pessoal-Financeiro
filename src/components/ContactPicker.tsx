import { useState } from "react";
import { Plus, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { upsertContact, useContacts } from "@/lib/finance";

const PERSONAL_VALUE = "__personal_expense__";

export function ContactPicker({
  value,
  onChange,
  suggestedName,
  id = "expense-contact",
}: {
  value: string | null;
  onChange: (contactId: string | null) => void;
  suggestedName?: string;
  id?: string;
}) {
  const contacts = useContacts();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(suggestedName ?? "");
  const suggestedContactExists = suggestedName && contacts.some((contact) => contact.name.toLowerCase() === suggestedName.toLowerCase());

  const create = () => {
    const normalizedName = name.trim();
    if (!normalizedName) {
      toast.error("Digite o nome da pessoa");
      return;
    }
    onChange(upsertContact(normalizedName));
    setName("");
    setAdding(false);
    toast.success("Terceiro cadastrado");
  };

  const createSuggestion = () => {
    if (!suggestedName) return;
    onChange(upsertContact(suggestedName));
    toast.success(`${suggestedName} cadastrado`);
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Gasto de quem?</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={value ?? PERSONAL_VALUE} onValueChange={(selected) => onChange(selected === PERSONAL_VALUE ? null : selected)}>
          <SelectTrigger id={id} className="min-w-48 flex-1">
            <SelectValue placeholder="Meu Gasto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PERSONAL_VALUE}>Meu Gasto</SelectItem>
            {contacts.map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" size="sm" onClick={() => { setName(suggestedName ?? ""); setAdding((current) => !current); }}>
          <UserRoundPlus className="size-4" /> Novo Terceiro
        </Button>
      </div>
      {suggestedName && !value && !suggestedContactExists && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Detectei um possível gasto para {suggestedName}.</span>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-amber-400 hover:text-amber-300" onClick={createSuggestion}>
            <Plus className="size-3.5" /> Adicionar novo contato: {suggestedName}
          </Button>
        </div>
      )}
      {adding && (
        <div className="flex gap-2">
          <Input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da pessoa" onKeyDown={(event) => event.key === "Enter" && (event.preventDefault(), create())} />
          <Button type="button" size="sm" onClick={create}>Salvar</Button>
        </div>
      )}
    </div>
  );
}