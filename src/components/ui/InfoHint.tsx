import { Info } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// Ícone de informação (ℹ️) que abre o texto num popover ao CLICAR — irmão do FieldHint, mas
// por clique (funciona no mobile) e aceitando conteúdo rico (mantém negritos/links). Usado para
// enxugar os "balões" de orientação do editor: em vez de uma caixa grande sempre visível, um ícone.
export function InfoHint({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Mais informações"
          className={`inline-flex items-center justify-center rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-muted transition-colors ${className ?? ""}`}
        >
          <Info className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-xs leading-relaxed text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}
