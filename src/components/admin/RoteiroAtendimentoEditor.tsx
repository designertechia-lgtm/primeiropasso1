import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export interface RoteiroEtapa {
  id: string;
  titulo: string;
  conteudo: string;
}

export function novaEtapa(titulo = "", conteudo = ""): RoteiroEtapa {
  return { id: `et-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, titulo, conteudo };
}

// Monta um roteiro-rascunho a partir do que o profissional já preencheu na landing.
// É só sugestão inicial (não grava até a pessoa salvar). O Axel pai evolui depois.
export function roteiroFromLanding(p: any): RoteiroEtapa[] {
  if (!p) return [];
  const first = (p.full_name || "o profissional").toString().split(" ")[0];
  const out: Array<{ titulo: string; conteudo: string }> = [];

  out.push({ titulo: "Saudação", conteudo: `Saudar, apresentar-se como assistente de ${first} e perguntar o nome da pessoa.` });

  const apres = [(p.hero_subtitle || "").toString().trim(), (p.bio || "").toString().trim()].find(Boolean) || "";
  const cat = (p.category_custom || p.category || "").toString().trim();
  const apresConteudo = apres || (cat ? `${first} — ${cat}.` : "");
  if (apresConteudo) out.push({ titulo: "Apresentação", conteudo: apresConteudo });

  const etapasMetodo = (Array.isArray(p.solution_items) ? p.solution_items : [])
    .map((it: any) => {
      const t = (it?.title || "").toString().trim();
      const d = (it?.desc || "").toString().trim();
      return t && d ? `${t}: ${d}` : "";
    })
    .filter(Boolean);
  if (etapasMetodo.length) {
    const solTitle = (p.solution_title || "").toString().trim() || "Como funciona o trabalho";
    out.push({ titulo: solTitle, conteudo: etapasMetodo.join(" | ") });
  }

  const valores: string[] = [];
  if (p.price_first_session) valores.push(`primeira sessão R$ ${p.price_first_session}`);
  if (p.price_max) valores.push(`sessão R$ ${p.price_max}`);
  const promos = (Array.isArray(p.promo_packages) ? p.promo_packages : [])
    .map((x: any) => (x?.descricao || "").toString().trim())
    .filter(Boolean);
  const valoresConteudo = [valores.join("; "), ...promos].filter(Boolean).join(". ");
  if (valoresConteudo) out.push({ titulo: "Valores", conteudo: valoresConteudo });

  out.push({ titulo: "Agendamento", conteudo: "Verificar o horário disponível e conduzir a pessoa ao agendamento." });

  return out.map((e) => novaEtapa(e.titulo, e.conteudo));
}

function SortableEtapa({
  etapa,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  etapa: RoteiroEtapa;
  index: number;
  disabled?: boolean;
  onChange: (patch: Partial<RoteiroEtapa>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: etapa.id,
    disabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-2 items-start rounded-lg border bg-card p-2.5"
    >
      {/* Alça de arraste */}
      <button
        type="button"
        className="mt-1 shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Arrastar para reordenar"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-xs font-semibold text-muted-foreground">{index + 1}.</span>
          <Input
            value={etapa.titulo}
            onChange={(e) => onChange({ titulo: e.target.value })}
            placeholder="Título da etapa (ex.: Apresentação, Valores)"
            disabled={disabled}
            className="h-8 text-sm font-medium"
          />
        </div>
        <Textarea
          value={etapa.conteudo}
          onChange={(e) => onChange({ conteudo: e.target.value })}
          placeholder="O que o Axel deve saber/dizer nesta etapa (em texto livre)."
          disabled={disabled}
          className="min-h-[60px] text-sm"
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Remover etapa"
        className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function RoteiroAtendimentoEditor({
  value,
  onChange,
  disabled,
}: {
  value: RoteiroEtapa[];
  onChange: (next: RoteiroEtapa[]) => void;
  disabled?: boolean;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = value.findIndex((e) => e.id === active.id);
    const newIndex = value.findIndex((e) => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onChange(arrayMove(value, oldIndex, newIndex));
  }

  const updateAt = (id: string, patch: Partial<RoteiroEtapa>) =>
    onChange(value.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeAt = (id: string) => onChange(value.filter((e) => e.id !== id));
  const add = () => onChange([...value, novaEtapa()]);

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {value.map((etapa, index) => (
                <SortableEtapa
                  key={etapa.id}
                  etapa={etapa}
                  index={index}
                  disabled={disabled}
                  onChange={(patch) => updateAt(etapa.id, patch)}
                  onRemove={() => removeAt(etapa.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Button type="button" variant="outline" size="sm" onClick={add} disabled={disabled} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Adicionar etapa
      </Button>
    </div>
  );
}
