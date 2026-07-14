import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Briefcase } from "lucide-react";
import { FieldHint } from "@/components/ui/FieldHint";
import { InfoHint } from "@/components/ui/InfoHint";
import ServicesEditor from "@/components/admin/landing/ServicesEditor";

// Aba "Serviços" do editor da landing (/admin/landing): gestão das SESSÕES DE TERAPIA
// (agendáveis, professional_services) + textos da seção. Separada da aba "Produtos"
// (e-books/materiais) — cada bloco tem sua própria tela de adição/edição.
export default function ServicesEditorTab() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  // Textos da seção "Sessões de terapia" (professionals.services_title/subtitle).
  const [svcTitle, setSvcTitle] = useState("");
  const [svcSubtitle, setSvcSubtitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [init, setInit] = useState(false);
  useEffect(() => {
    if (professional && !init) {
      setSvcTitle((professional as any).services_title || "");
      setSvcSubtitle((professional as any).services_subtitle || "");
      setInit(true);
    }
  }, [professional, init]);

  const saveTexts = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase
      .from("professionals")
      .update({ services_title: svcTitle.trim() || null, services_subtitle: svcSubtitle.trim() || null } as any)
      .eq("id", professional.id);
    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar os textos da seção");
      return;
    }
    toast.success("Textos da seção salvos!");
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    queryClient.invalidateQueries({ queryKey: ["landing-preview-services"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-primary" /> Sessões de terapia
        </span>
        <InfoHint>
          Seus atendimentos agendáveis (os mesmos usados na Agenda). Viram uma <strong>seção própria</strong> na sua página,
          com título e subtítulo próprios. A seção só aparece quando há ao menos uma sessão.
        </InfoHint>
      </div>

      {/* Textos da seção "Sessões de terapia" */}
      <div className="space-y-2">
        <Label>Título da seção <FieldHint text="Aparece como título da seção de sessões na sua página. Em branco usa 'Sessões de terapia'." /></Label>
        <Input value={svcTitle} onChange={(e) => setSvcTitle(e.target.value)} placeholder="Sessões de terapia" />
      </div>
      <div className="space-y-2">
        <Label>Subtítulo</Label>
        <Textarea rows={2} value={svcSubtitle} onChange={(e) => setSvcSubtitle(e.target.value)} placeholder="Atendimentos para cuidar de você, no seu tempo." />
      </div>
      <Button onClick={saveTexts} disabled={saving} variant="outline" size="sm">
        {saving ? "Salvando..." : "Salvar textos da seção"}
      </Button>

      {/* CRUD das sessões (professional_services) */}
      <ServicesEditor />
    </div>
  );
}
