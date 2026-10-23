import { Link } from "@tanstack/react-router";
import { CreditCard, LayoutDashboard, MessageSquare, ReceiptText, Wallet } from "lucide-react";

const items = [
  { to: "/", label: "Chat", icon: MessageSquare },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/extrato", label: "Extrato", icon: ReceiptText },
  { to: "/cartoes", label: "Cartões", icon: CreditCard },
] as const;

export function AppNav() {
  return (
    <nav className="flex shrink-0 items-center gap-1 border-b border-border bg-sidebar px-3 py-2 md:h-screen md:w-60 md:flex-col md:items-stretch md:border-b-0 md:border-r md:px-4 md:py-6">
      <div className="mr-auto flex items-center gap-2 px-2 md:mb-8 md:mr-0">
        <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Wallet className="size-4" />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">Controle <span className="text-primary">Financeiro Pessoal</span></span>
      </div>
      {items.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: true }}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
          activeProps={{ className: "bg-sidebar-accent !text-foreground font-medium" }}
        >
          <Icon className="size-4" />
          <span className="hidden sm:inline">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
