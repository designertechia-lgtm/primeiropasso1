import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

/**
 * Editor de "Abordagens profissionais" (chips/tags).
 *
 * Fonte única de verdade: coluna `professionals.approaches` (text[]).
 * Usado tanto no /admin/perfil (card Área de Atuação) quanto no editor da
 * landing (aba Sobre). Como as duas telas leem/escrevem o MESMO registro e
 * invalidam a mesma query (["my-professional"]), o que for salvo num lugar
 * aparece no outro automaticamente — por isso a lógica vive aqui, num só lugar.
 */
export default function ApproachesEditor({
  value,
  onChange,
  placeholder = "Ex: TCC, Psicanálise...",
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const toAdd = parts.filter((p) => !value.includes(p));
    if (toAdd.length > 0) onChange([...value, ...toAdd]);
    setDraft("");
  };

  const handleChange = (val: string) => {
    // se termina com vírgula, confirma automaticamente
    if (val.endsWith(",")) {
      const parts = val.split(",").map((s) => s.trim()).filter(Boolean);
      const toAdd = parts.filter((p) => !value.includes(p));
      if (toAdd.length > 0) onChange([...value, ...toAdd]);
      setDraft("");
    } else {
      setDraft(val);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
        {value.map((a, i) => (
          <span
            key={a}
            style={{ animationDelay: `${i * 40}ms` }}
            className="animate-in fade-in zoom-in-75 duration-200 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 px-3 py-1 text-xs font-medium text-primary shadow-sm hover:shadow-md hover:border-primary/50 transition-all"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
            {a}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== a))}
              className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), commit())}
        />
        <Button type="button" variant="outline" onClick={commit}>Adicionar</Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Digite uma abordagem e pressione <kbd className="rounded border px-1 py-0.5 text-[10px] font-mono bg-muted">Enter</kbd> ou use <kbd className="rounded border px-1 py-0.5 text-[10px] font-mono bg-muted">,</kbd> para separar várias de uma vez.
      </p>
    </div>
  );
}
