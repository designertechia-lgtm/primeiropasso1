import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Dna, Sparkles, Loader2, Wand2, ShieldAlert, FileDown } from "lucide-react";

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

// ── PDF (impressão via nova aba; texto selecionável, sem dependência nova) ──
const escapeHtml = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inlineMd = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
// Remove um cabeçalho markdown que a IA às vezes coloca no início da seção (o rótulo já é o <h2>).
const stripLeadingHeading = (t: string) => (t || "").replace(/^\s*#{1,6}\s+.*(?:\r?\n)+/, "").trim();

function mdToHtml(md: string): string {
  const lines = (md || "").split(/\r?\n/);
  let html = "", inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\s*[-*]\s+/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inlineMd(escapeHtml(line.replace(/^\s*[-*]\s+/, "")))}</li>`;
      continue;
    }
    if (inList) { html += "</ul>"; inList = false; }
    if (/^#{2,6}\s+/.test(line)) html += `<h3>${inlineMd(escapeHtml(line.replace(/^#{2,6}\s+/, "")))}</h3>`;
    else if (line.trim() !== "") html += `<p>${inlineMd(escapeHtml(line))}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

function buildDnaPrintHtml(prof: any, sections: Record<string, string>): string {
  const primary = prof?.primary_color || "#87A96B";
  const secondary = prof?.secondary_color || primary;
  const name = prof?.full_name || "Profissional";
  const crp = prof?.crp || "";
  const logo = prof?.logo_url || "";
  const especialidade = (prof?.approaches || [])[0] || prof?.category_custom || prof?.category || "";
  const mod = prof?.attendance_mode;
  const modalidade = mod === "online" ? "Atendimento online" : mod === "presencial" ? "Atendimento presencial"
    : (mod === "hybrid" || mod === "hibrido") ? "Atendimento online e presencial" : "";
  const instagram = prof?.instagram ? (String(prof.instagram).startsWith("@") ? prof.instagram : "@" + prof.instagram) : "";
  const contatos = [prof?.whatsapp && `WhatsApp ${prof.whatsapp}`, prof?.email, instagram].filter(Boolean).join("  ·  ");
  const date = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  const metaLine = [crp, modalidade, date].filter(Boolean).join(" · ");
  let n = 0;
  const body = DNA_SECTIONS.map((s) => {
    const content = stripLeadingHeading(sections[s.key] || "");
    if (!content) return "";
    n += 1;
    return `<section class="sec"><h2><span class="num">${n}</span>${escapeHtml(s.label)}</h2><div class="secbody">${mdToHtml(content)}</div></section>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>DNA da Marca — ${escapeHtml(name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #23262b; line-height: 1.62; font-size: 11.5pt; }
  .coverpage { page-break-after: always; }
  .hero { display: flex; align-items: center; gap: 8mm; background: linear-gradient(135deg, ${primary}, ${secondary}); border-radius: 20px; padding: 11mm 12mm; color: #fff; box-shadow: 0 10px 30px ${primary}38; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hero .logo { width: 66px; height: 66px; object-fit: contain; background: #fff; padding: 8px; border-radius: 16px; flex: none; box-shadow: 0 4px 12px rgba(0,0,0,.18); }
  .hero .htext { min-width: 0; }
  .hero .kicker { letter-spacing: .22em; text-transform: uppercase; font-size: 9pt; font-weight: 800; opacity: .85; }
  .hero h1 { font-size: 26pt; font-weight: 800; margin: 1mm 0; line-height: 1.05; letter-spacing: -.4px; }
  .hero .sub { font-size: 12.5pt; font-weight: 600; opacity: .92; }
  .hero .meta { font-size: 9.5pt; opacity: .8; margin-top: 1.5mm; }
  .sec { page-break-inside: avoid; margin: 0 0 7mm; }
  h2 { display: flex; align-items: center; gap: 3mm; font-size: 13.5pt; font-weight: 800; color: #16181d; margin: 0 0 3mm; }
  h2 .num { display: inline-flex; align-items: center; justify-content: center; width: 7.5mm; height: 7.5mm; border-radius: 9px; background: ${primary}; color: #fff; font-size: 10pt; font-weight: 800; flex: none; }
  .secbody { padding-left: 10.5mm; border-left: 2px solid ${primary}22; }
  h3 { font-size: 11.5pt; margin: 3.5mm 0 1.5mm; color: #16181d; font-weight: 700; }
  p { margin: 0 0 2.5mm; }
  ul { margin: 0 0 2.5mm 4mm; padding: 0; } li { margin: 0 0 1.2mm; }
  strong { color: #16181d; }
  .foot { margin-top: 10mm; padding-top: 4mm; border-top: 1px solid #eceef1; color: #a0a4ab; font-size: 8.5pt; text-align: center; }
  .foot .contatos { color: ${primary}; font-weight: 700; font-size: 9.5pt; margin-bottom: 1.5mm; }
  @media screen { body { max-width: 800px; margin: 24px auto; padding: 0 28px; } }
  @media print { .noprint { display: none; } .coverpage { min-height: 245mm; display: flex; align-items: center; } .coverpage .hero { width: 100%; } }
</style></head>
<body>
  <button class="noprint" onclick="window.print()" style="position:fixed;top:12px;right:12px;padding:8px 14px;font:14px Arial;background:${primary};color:#fff;border:none;border-radius:8px;cursor:pointer">Salvar como PDF</button>
  <div class="coverpage"><div class="hero">
    ${logo ? `<img class="logo" src="${encodeURI(logo)}" alt="">` : ""}
    <div class="htext">
      <div class="kicker">DNA da Marca</div>
      <h1>${escapeHtml(name)}</h1>
      ${especialidade ? `<div class="sub">${escapeHtml(especialidade)}</div>` : ""}
      <div class="meta">${escapeHtml(metaLine)}</div>
    </div>
  </div></div>
  ${body}
  <div class="foot">${contatos ? `<div class="contatos">${escapeHtml(contatos)}</div>` : ""}<div>Documento estratégico gerado no Primeiro Passo — revisão humana antes de uso público.</div></div>
  <script>window.addEventListener('load',function(){setTimeout(function(){window.print();},350);});</script>
</body></html>`;
}

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

export default function BrandDnaEditorTab({ expanded = false }: { expanded?: boolean }) {
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

  const printPdf = () => {
    if (!hasContent) { toast.error("Gere ou escreva o DNA antes."); return; }
    const w = window.open("", "_blank");
    if (!w) { toast.error("Permita pop-ups para gerar o PDF."); return; }
    w.document.write(buildDnaPrintHtml(p, sections));
    w.document.close();
  };

  return (
    <div className={`space-y-5 ${expanded ? "max-w-4xl mx-auto" : ""}`}>
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
              rows={expanded ? 9 : 4}
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
        <Button onClick={printPdf} disabled={!hasContent} variant="ghost" className="w-full gap-2">
          <FileDown className="h-4 w-4" /> Baixar PDF do DNA
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
