import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Dna, Sparkles, Loader2, Wand2, ShieldAlert } from "lucide-react";

// Aba "DNA da Marca" do editor da landing. Fonte única da marca do profissional (11 seções,
// modelo Daiane). Autossuficiente (grava em professionals.brand_bible). A IA gera um rascunho a
// partir da ficha; o profissional edita; depois pode gerar a landing inteira a partir do DNA.
const DNA_SECTIONS: { key: string; label: string }[] = [
  { key: "essencia", label: "Essência da marca" },
  { key: "posicionamento", label: "Posicionamento" },
  { key: "persona", label: "Cliente ideal (persona)" },
  { key: "vilao", label: "Problema central e o vilão" },
  { key: "diferenciacao", label: "Diferenciação" },
  { key: "mensagem", label: "Arquitetura de mensagem" },
  { key: "metodo", label: "Método próprio" },
  { key: "voz_tom", label: "Voz e tom" },
  { key: "conteudo", label: "Pilares de conteúdo e autoridade" },
  { key: "limites_eticos", label: "Limites éticos e conformidade" },
  { key: "oferta", label: "Arquitetura de oferta" },
];

async function invokeFn(fn: string, body: any) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    const detail = (error as any)?.context
      ? await (error as any).context.json().then((j: any) => j?.error ?? j?.details).catch(() => null)
      : null;
    throw new Error(detail ?? error.message ?? "Erro na geração.");
  }
  if (data?.error) throw new Error(data.error);
  return data.result;
}

export default function BrandDnaEditorTab() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const p = professional as any;

  const [sections, setSections] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingLanding, setGeneratingLanding] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preview, setPreview] = useState<any>(null); // resultado do generate-landing p/ confirmar

  useEffect(() => {
    if (!professional) return;
    const bb = p.brand_bible || {};
    const next: Record<string, string> = {};
    for (const s of DNA_SECTIONS) next[s.key] = bb[s.key] || "";
    setSections(next);
  }, [professional]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasContent = DNA_SECTIONS.some((s) => (sections[s.key] || "").trim() !== "");

  // Monta a ficha que alimenta o gerador (perfil + abordagens + dores da landing).
  const buildProfile = () => ({
    nome: p.full_name || "",
    profissao: p.category_custom || p.category || "",
    conselho_registro: p.crp || "",
    especialidade: (p.approaches || [])[0] || "",
    formacao_abordagens: (p.approaches || []).join(", "),
    modalidade: p.attendance_mode || "",
    dores: (p.pain_items || []).map((i: any) => (typeof i === "string" ? i : i?.text)).filter(Boolean).join("; "),
  });

  const rebuildMarkdown = (secs: Record<string, string>) =>
    DNA_SECTIONS.map((s) => `## ${s.label}\n\n${(secs[s.key] || "").trim()}`).join("\n\n");

  const generate = async () => {
    if (!p.full_name || (p.approaches || []).length === 0) {
      toast.error("Complete seu perfil primeiro", { description: "Precisa de nome e abordagens (aba Sobre / Meu Perfil) para gerar." });
      return;
    }
    setGenerating(true);
    try {
      const result = await invokeFn("generate-brand-bible", { profile: buildProfile() });
      const next: Record<string, string> = {};
      for (const s of DNA_SECTIONS) next[s.key] = result[s.key] || "";
      setSections(next);
      toast.success("DNA da Marca gerado! Revise e salve.");
    } catch (e: any) {
      toast.error("Erro ao gerar o DNA", { description: e.message ?? String(e), duration: 7000 });
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!professional) return;
    setSaving(true);
    const brand_bible = { ...sections, _meta: p.brand_bible?._meta ?? null, markdown: rebuildMarkdown(sections) };
    const { error } = await supabase.from("professionals").update({ brand_bible } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("DNA da Marca salvo!"); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  const generateLanding = async () => {
    if (!hasContent) { toast.error("Gere e salve seu DNA da Marca antes."); return; }
    setGeneratingLanding(true);
    try {
      const bible = { ...sections, markdown: rebuildMarkdown(sections) };
      const result = await invokeFn("generate-landing", { bible, profile: buildProfile() });
      setPreview(result);
    } catch (e: any) {
      toast.error("Erro ao gerar a landing", { description: e.message ?? String(e), duration: 7000 });
    } finally {
      setGeneratingLanding(false);
    }
  };

  const applyLanding = async () => {
    if (!professional || !preview) return;
    setApplying(true);
    const s = preview;
    const upd: any = {
      hero_title: s.hero_title || null,
      hero_subtitle: s.hero_subtitle || null,
      pain_title: s.pain_title || null,
      pain_subtitle: s.pain_subtitle || null,
      pain_items: Array.isArray(s.pain_items) && s.pain_items.length ? s.pain_items : null,
      villain_title: s.villain_title || null,
      villain_body: s.villain_body || null,
      solution_title: s.solution_title || null,
      solution_subtitle: s.solution_subtitle || null,
      solution_items: Array.isArray(s.solution_items) && s.solution_items.length ? s.solution_items : null,
      offer_title: s.offer_title || null,
      offer_description: s.offer_description || null,
      offer_steps: Array.isArray(s.offer_steps) && s.offer_steps.length ? s.offer_steps : null,
      audience_title: s.audience_title || null,
      audience_for: Array.isArray(s.audience_for) && s.audience_for.length ? s.audience_for : null,
      audience_not_for: Array.isArray(s.audience_not_for) && s.audience_not_for.length ? s.audience_not_for : null,
      faq_title: s.faq_title || null,
      faq_items: Array.isArray(s.faq_items) && s.faq_items.length ? s.faq_items : null,
      testimonials_title: s.testimonials_title || null,
      testimonials_subtitle: s.testimonials_subtitle || null,
    };
    const { error } = await supabase.from("professionals").update(upd).eq("id", professional.id);
    setApplying(false);
    if (error) { toast.error("Erro ao aplicar na landing"); return; }
    setPreview(null);
    toast.success("Landing preenchida a partir do DNA!", { description: "Revise cada seção antes de publicar." });
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
        <Dna className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">DNA da Marca</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            A base única da sua comunicação: posicionamento, persona, vilão, voz e limites. A IA monta um
            rascunho a partir do seu perfil; você edita. Depois, dá pra <strong>gerar a landing inteira</strong> a
            partir dele, numa voz coesa.
          </p>
        </div>
      </div>

      <Button onClick={generate} disabled={generating} className="w-full gap-2">
        {generating
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando… pode levar ~1 min</>
          : <><Sparkles className="h-4 w-4" /> {hasContent ? "Gerar novo rascunho com IA" : "Gerar meu DNA com IA"}</>}
      </Button>

      <div className="space-y-4">
        {DNA_SECTIONS.map((s) => (
          <div key={s.key} className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">{s.label}</label>
            <Textarea
              rows={4}
              value={sections[s.key] || ""}
              onChange={(e) => setSections((prev) => ({ ...prev, [s.key]: e.target.value }))}
              placeholder={generating ? "Gerando…" : "Clique em “Gerar meu DNA com IA” ou escreva aqui."}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2 sticky bottom-0 bg-background pt-2">
        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Salvando…" : "Salvar DNA da Marca"}
        </Button>
        <Button onClick={generateLanding} disabled={generatingLanding || !hasContent} variant="outline" className="w-full gap-2">
          {generatingLanding
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando landing…</>
            : <><Wand2 className="h-4 w-4" /> Gerar landing a partir do DNA</>}
        </Button>
      </div>

      <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 leading-relaxed">
        <ShieldAlert className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" />
        <span>Revisão humana obrigatória: a IA aplica os limites do seu conselho, mas a conformidade final é sua. Revise antes de publicar.</span>
      </div>

      {/* Preview antes de aplicar na landing */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Aplicar na landing?</DialogTitle>
            <DialogDescription>
              A IA gerou a copy destas seções a partir do seu DNA. Aplicar vai <strong>substituir</strong> os
              textos atuais das seções abaixo (as demais não mudam).
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <ul className="text-sm text-foreground/90 space-y-1 max-h-64 overflow-y-auto py-1">
              <li>• <strong>Hero:</strong> {preview.hero_title}</li>
              <li>• <strong>Dores:</strong> {(preview.pain_items || []).length} itens</li>
              <li>• <strong>Vilão:</strong> {preview.villain_title}</li>
              <li>• <strong>Solução:</strong> {(preview.solution_items || []).length} cards</li>
              <li>• <strong>Oferta:</strong> {preview.offer_title}</li>
              <li>• <strong>Para quem é:</strong> {(preview.audience_for || []).length} + {(preview.audience_not_for || []).length}</li>
              <li>• <strong>FAQ:</strong> {(preview.faq_items || []).length} perguntas</li>
              <li>• <strong>Prova social:</strong> {preview.testimonials_title}</li>
            </ul>
          )}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setPreview(null)} disabled={applying}>Cancelar</Button>
            <Button className="flex-1 gap-2" onClick={applyLanding} disabled={applying}>
              {applying ? <><Loader2 className="h-4 w-4 animate-spin" /> Aplicando…</> : "Aplicar na landing"}
            </Button>
          </div>
          <button type="button" onClick={() => { setPreview(null); navigate("/admin/landing?tab=hero"); }} className="text-xs text-muted-foreground underline hover:text-primary">
            Aplicar e revisar seção por seção
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
