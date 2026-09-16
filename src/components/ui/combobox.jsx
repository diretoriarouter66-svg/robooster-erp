import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

// Seletor com busca (pedido da Larissa 03/09/2026: "digitar nome/CPF/CNPJ em vez de
// procurar na lista"). Busca por qualquer palavra do rótulo/subtítulo/keywords, sem
// acento e sem maiúscula; se o que foi digitado tem 3+ dígitos, também compara só os
// números (CPF/CNPJ com ou sem pontuação, telefone, SKU).
const norm = (s) => (s ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const digits = (s) => (s ?? "").toString().replace(/\D/g, "");

export function Combobox({
  value, onChange, options = [],
  placeholder = "Selecione", searchPlaceholder = "Digite para buscar…", emptyText = "Nada encontrado",
  className, triggerClassName, disabled,
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const selected = options.find((o) => String(o.value) === String(value));

  const filtered = React.useMemo(() => {
    const nq = norm(q).trim();
    if (!nq) return options;
    const toks = nq.split(/\s+/);
    const dq = digits(q);
    return options.filter((o) => {
      const campos = [o.label, o.sub, ...(o.keywords || [])].filter(Boolean).join(" ");
      const hay = norm(campos);
      if (toks.every((t) => hay.includes(t))) return true;
      return dq.length >= 3 && digits(campos).includes(dq);
    });
  }, [q, options]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled}
          className={cn("w-full justify-between font-normal h-10 px-3", !selected && "text-muted-foreground", triggerClassName)}>
          <span className="truncate text-left">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("p-0 w-[var(--radix-popover-trigger-width)] min-w-[300px]", className)} align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={q} onValueChange={setQ} autoFocus />
          <CommandList className="max-h-64">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.slice(0, 200).map((o) => (
                <CommandItem key={String(o.value)} value={String(o.value)}
                  onSelect={() => { onChange(o.value); setOpen(false); setQ(""); }}>
                  <Check className={cn("mr-2 h-4 w-4 shrink-0", String(o.value) === String(value) ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <div className="truncate">{o.label}</div>
                    {o.sub && <div className="text-[10px] text-muted-foreground truncate">{o.sub}</div>}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
