// Seletor de ícone de um card (Dores / Soluções) no editor da landing.
// O gatilho mostra o ícone que está valendo — inclusive o de fallback, quando o item ainda não tem
// `icon` próprio —, então o profissional vê no botão exatamente o que a landing renderiza.

import { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Search, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ICON_CATEGORIES, resolveIcon, searchIcons, type IconName } from "@/lib/landing/icons";

interface IconPickerProps {
  /** Nome guardado no item. `undefined` = ainda usa o ícone por posição. */
  value?: string;
  onChange: (icon: string | undefined) => void;
  /** Ícone exibido quando o item não tem `icon` — o mesmo que a landing usaria. */
  fallback: LucideIcon;
  /** Texto do card, só para o tooltip ("Ícone de: …"). */
  label?: string;
}

export default function IconPicker({ value, onChange, fallback, label }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const Atual = resolveIcon(value, fallback);

  const busca = query.trim() !== "";
  const encontrados = busca ? searchIcons(query) : [];

  const escolher = (nome: IconName) => {
    onChange(nome);
    setOpen(false);
    setQuery("");
  };

  const botao = (nome: IconName) => {
    const Icon = resolveIcon(nome, fallback);
    const ativo = nome === value;
    return (
      <button
        key={nome}
        type="button"
        onClick={() => escolher(nome)}
        title={nome}
        aria-label={nome}
        aria-pressed={ativo}
        className={`flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
          ativo
            ? "border-primary bg-primary text-primary-foreground"
            : "border-transparent bg-muted/50 text-muted-foreground hover:bg-primary/10 hover:text-primary"
        }`}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Trocar ícone deste card"
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-input bg-background text-primary transition-colors hover:bg-primary/10"
            >
              <Atual className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {label ? `Ícone de: ${label}` : "Trocar ícone"}
          {!value && <span className="block text-xs opacity-70">Automático — clique para escolher</span>}
        </TooltipContent>
      </Tooltip>

      <PopoverContent className="w-[340px] p-3" align="start">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar (ex.: insônia, prazo, bug)"
            className="h-9 pl-8"
          />
        </div>

        <div className="max-h-[280px] overflow-y-auto pr-1">
          {busca ? (
            encontrados.length > 0 ? (
              <div className="grid grid-cols-8 gap-1">{encontrados.map(botao)}</div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhum ícone para "{query}".
              </p>
            )
          ) : (
            ICON_CATEGORIES.map((cat) => (
              <div key={cat.label} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {cat.label}
                </p>
                <div className="grid grid-cols-8 gap-1">{cat.icons.map(botao)}</div>
              </div>
            ))
          )}
        </div>

        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setOpen(false);
              setQuery("");
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-input py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            <RotateCcw className="h-3 w-3" />
            Voltar ao ícone automático
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
