import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pencil, X, Palette, Layout, BookOpen, Lightbulb, AlertCircle, Plus, Sparkles, Loader2, ExternalLink, TriangleAlert, Phone, Mail, Instagram, MessageCircle, Type } from "lucide-react";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import HeroSection from "@/components/landing/HeroSection";
import AboutSection from "@/components/landing/AboutSection";
import SolutionSection from "@/components/landing/SolutionSection";
import PainSection from "@/components/landing/PainSection";
import ContactSection from "@/components/landing/ContactSection";

// ── AI helper ─────────────────────────────────────────────
async function callGenerateText(field: string, context: { name: string; crp?: string; specialty?: string }) {
  const { data, error } = await supabase.functions.invoke("generate-text", {
    body: { field, context },
  });
  if (error) {
    // tenta extrair mensagem real do corpo da resposta
    const detail = (error as any)?.context
      ? await (error as any).context.json().then((j: any) => j?.error ?? j?.message).catch(() => null)
      : null;
    throw new Error(detail ?? error.message ?? String(error));
  }
  if (data?.error) throw new Error(data.error);
  return data.result;
}

function AiButton({ onClick, loading }: { onClick: () => void; loading: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={loading}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {loading ? "Gerando..." : "IA"}
        </button>
      </TooltipTrigger>
      <TooltipContent>Gerar com Inteligência Artificial</TooltipContent>
    </Tooltip>
  );
}

// ── color helpers ──────────────────────────────────────────
function hexToHsl(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function deriveColors(hex: string) {
  const { h, s } = hexToHsl(hex);
  return {
    secondary: hslToHex((h + 30) % 360, Math.round(s * 0.6), 65),
    background: hslToHex(h, Math.round(s * 0.15), 94),
  };
}

function buildPreviewVars(primary: string, secondary: string, bg: string, fontFamily?: string, fontSizeScale?: string): Record<string, string> {
  const p = hexToHsl(primary);
  const b = hexToHsl(bg);
  const primaryHSL = `${p.h} ${p.s}% ${p.l}%`;
  const contrastFg = p.l > 55 ? "220 15% 10%" : "210 40% 98%";
  const accentHSL = `${p.h} ${Math.min(p.s + 6, 100)}% ${Math.max(p.l - 15, 10)}%`;
  const bgHSL = `${b.h} ${b.s}% ${b.l}%`;
  const cardHSL = `${b.h} ${Math.max(b.s - 5, 0)}% ${Math.min(b.l + 2, 100)}%`;
  const borderHSL = `${b.h} ${Math.max(b.s - 10, 0)}% ${Math.max(b.l - 10, 0)}%`;
  const fgHSL = b.l < 50 ? `${b.h} ${Math.max(b.s - 15, 0)}% 90%` : `${b.h} ${Math.min(b.s + 10, 100)}% 15%`;
  const mutedFgHSL = b.l < 50 ? `${b.h} ${Math.max(b.s - 15, 0)}% 60%` : `${b.h} ${Math.max(b.s - 5, 0)}% 45%`;
  const sec = hexToHsl(secondary);
  const secHSL = `${sec.h} ${sec.s}% ${sec.l}%`;
  const fontDef = FONTS.find((f) => f.value === fontFamily) ?? FONTS[0];
  const sizeDef = FONT_SIZES.find((s) => s.value === fontSizeScale) ?? FONT_SIZES[1];
  return {
    "--primary": primaryHSL,
    "--primary-foreground": contrastFg,
    "--accent": accentHSL,
    "--accent-foreground": contrastFg,
    "--ring": primaryHSL,
    "--secondary": secHSL,
    "--secondary-foreground": "220 15% 10%",
    "--background": bgHSL,
    "--card": cardHSL,
    "--popover": cardHSL,
    "--muted": `${b.h} ${Math.max(b.s - 10, 0)}% ${Math.max(b.l - 5, 0)}%`,
    "--border": borderHSL,
    "--input": borderHSL,
    "--foreground": fgHSL,
    "--card-foreground": fgHSL,
    "--popover-foreground": fgHSL,
    "--muted-foreground": mutedFgHSL,
    "font-family": fontDef.style.fontFamily,
    "font-size": `${sizeDef.scale}rem`,
  };
}

const FONTS = [
  { value: "inter",       label: "Inter",            desc: "Moderno e neutro",      style: { fontFamily: "Inter, system-ui, sans-serif" } },
  { value: "poppins",     label: "Poppins",          desc: "Geométrico e amigável", style: { fontFamily: "'Poppins', sans-serif" } },
  { value: "lato",        label: "Lato",             desc: "Limpo e profissional",  style: { fontFamily: "'Lato', sans-serif" } },
  { value: "playfair",    label: "Playfair Display", desc: "Elegante e clássico",   style: { fontFamily: "'Playfair Display', serif" } },
  { value: "merriweather",label: "Merriweather",     desc: "Legível e confiável",   style: { fontFamily: "'Merriweather', serif" } },
];

const FONT_SIZES = [
  { value: "sm", label: "Pequeno", scale: "0.9" },
  { value: "md", label: "Normal",  scale: "1.0" },
  { value: "lg", label: "Grande",  scale: "1.1" },
  { value: "xl", label: "Maior",   scale: "1.2" },
];

const GOOGLE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Lato:wght@400;700&family=Playfair+Display:wght@400;600;700&family=Merriweather:wght@400;700&display=swap";

const PALETTES = [
  { name: "Sálvia",      primary: "#87A96B" },
  { name: "Serenidade",  primary: "#5B8DB8" },
  { name: "Rosa Quartz", primary: "#C67B8A" },
  { name: "Violeta",     primary: "#7B6FA8" },
  { name: "Terracota",   primary: "#C4704F" },
  { name: "Dourado",     primary: "#C9A882" },
  { name: "Petróleo",    primary: "#2E7D82" },
  { name: "Lavanda",     primary: "#9B8EC4" },
  { name: "Antracite",   primary: "#4A5568" },
  { name: "Vinho",       primary: "#8B3A52" },
];

// ── section overlay wrapper ────────────────────────────────
function SectionBlock({
  label, icon: Icon, active, onClick, children,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative group cursor-pointer transition-all ${active ? "ring-2 ring-primary ring-offset-2" : "hover:ring-2 hover:ring-primary/40 hover:ring-offset-1"}`}
      onClick={onClick}
    >
      {children}
      <div className={`absolute inset-0 flex items-start justify-end p-3 transition-opacity ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lg"
        >
          <Icon className="h-3 w-3" />
          {label}
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

type Section = "hero" | "dores" | "solucao" | "sobre" | "cores" | "contatos";

export default function AdminLandingPage() {
  const { data: professional, isLoading } = useProfessional();
  const queryClient = useQueryClient();

  // hero
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [heroBgUrl, setHeroBgUrl] = useState("");
  const [heroBgOpacity, setHeroBgOpacity] = useState(70);
  const [heroBgOverlay, setHeroBgOverlay] = useState("dark");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoStyle, setPhotoStyle] = useState("portrait");
  const [photoFit, setPhotoFit] = useState("contain");

  // sobre
  const [bio, setBio] = useState("");
  const [aboutImageUrl, setAboutImageUrl] = useState("");
  const [approaches, setApproaches] = useState<string[]>([]);
  const [newApproach, setNewApproach] = useState("");

  // dores
  const [painTitle, setPainTitle] = useState("");
  const [painSubtitle, setPainSubtitle] = useState("");
  const [painItems, setPainItems] = useState<{ text: string }[]>([]);
  const [newPainItem, setNewPainItem] = useState("");

  // solução
  const [solutionTitle, setSolutionTitle] = useState("");
  const [solutionSubtitle, setSolutionSubtitle] = useState("");
  const [solutionItems, setSolutionItems] = useState<{ title: string; desc: string }[]>([]);

  // cores
  const [primaryColor, setPrimaryColor] = useState("#87A96B");
  const [secondaryColor, setSecondaryColor] = useState(() => deriveColors("#87A96B").secondary);
  const [bgColor, setBgColor] = useState(() => deriveColors("#87A96B").background);

  // tipografia
  const [fontFamily, setFontFamily] = useState("inter");
  const [fontSizeScale, setFontSizeScale] = useState("md");

  // contatos
  const [contactTitle, setContactTitle] = useState("");
  const [contactSubtitle, setContactSubtitle] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactInstagram, setContactInstagram] = useState("");

  const [activeSection, setActiveSection] = useState<Section>("hero");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const hasLoaded = useRef(false);
  const navigate = useNavigate();

  const DEFAULT_PAIN_ITEMS = [
    { text: "Pensamentos acelerados que não param" },
    { text: "Dificuldade para dormir ou descansar de verdade" },
    { text: "Ansiedade que aperta o peito sem motivo aparente" },
    { text: "Relacionamentos que desgastam ao invés de nutrir" },
    { text: "Sensação de que algo precisa mudar, mas não sabe por onde começar" },
  ];

  const DEFAULT_SOLUTION_ITEMS = [
    { title: "Autoconhecimento", desc: "Entenda seus padrões de pensamento e como eles influenciam suas emoções e comportamentos." },
    { title: "Objetivos Claros", desc: "Juntos, definimos metas terapêuticas que fazem sentido para a sua vida real." },
    { title: "Novas Perspectivas", desc: "Aprenda a mudar a forma como você percebe os desafios, com técnicas práticas e baseadas em evidências." },
    { title: "Espaço Seguro", desc: "Atendimento 100% ético e sigiloso, onde você pode se expressar sem julgamentos." },
  ];

  const aiContext = {
    name: (professional as any)?.full_name || "o profissional",
    crp: professional?.crp || undefined,
    specialty: professional?.approaches?.[0] || undefined,
  };

  const generate = async (field: string, onResult: (val: any) => void) => {
    // validação: nome obrigatório
    if (!aiContext.name || aiContext.name === "o profissional") {
      toast.error("Nome não cadastrado", {
        description: "Preencha seu nome completo antes de gerar com IA.",
        action: { label: "Ir para Meu Perfil", onClick: () => navigate("/admin/perfil") },
        duration: 6000,
      });
      return;
    }
    // validação: abordagens obrigatórias
    if (!approaches || approaches.length === 0) {
      toast.error("Abordagens terapêuticas não cadastradas", {
        description: "Adicione pelo menos uma abordagem para a IA gerar textos personalizados.",
        action: { label: "Ir para Sobre", onClick: () => setActiveSection("sobre") },
        duration: 6000,
      });
      return;
    }

    setAiLoading(field);
    try {
      const result = await callGenerateText(field, {
        ...aiContext,
        specialty: approaches.join(", "),
      });
      onResult(result);
      toast.success("Texto gerado! Revise e salve.");
    } catch (e: any) {
      const msg = e.message ?? String(e);
      toast.error("Erro ao gerar texto com IA", {
        description: msg,
        duration: 6000,
      });
    } finally {
      setAiLoading(null);
    }
  };

  useEffect(() => {
    if (!professional) return;
    hasLoaded.current = false;
    setHeroTitle(professional.hero_title || "");
    setHeroSubtitle(professional.hero_subtitle || "");
    setHeroImageUrl((professional as any).hero_image_url || "");
    setHeroBgUrl((professional as any).hero_bg_url || "");
    setHeroBgOpacity((professional as any).hero_bg_opacity ?? 70);
    setHeroBgOverlay((professional as any).hero_bg_overlay || "dark");
    setPhotoUrl(professional.photo_url || "");
    setPhotoStyle((professional as any).photo_style || "portrait");
    setPhotoFit((professional as any).photo_fit || "contain");
    setBio(professional.bio || "");
    setAboutImageUrl((professional as any).about_image_url || "");
    setApproaches(professional.approaches || []);
    const pc = professional.primary_color || "#87A96B";
    const dv = deriveColors(pc);
    setPrimaryColor(pc);
    setSecondaryColor((professional as any).secondary_color || dv.secondary);
    setBgColor((professional as any).background_color || dv.background);
    setPainTitle((professional as any).pain_title || "");
    setPainSubtitle((professional as any).pain_subtitle || "");
    setPainItems((professional as any).pain_items || []);
    setSolutionTitle((professional as any).solution_title || "");
    setSolutionSubtitle((professional as any).solution_subtitle || "");
    setSolutionItems((professional as any).solution_items || []);
    setFontFamily((professional as any).font_family || "inter");
    setFontSizeScale((professional as any).font_size_scale || "md");
    setContactTitle((professional as any).contact_title || "");
    setContactSubtitle((professional as any).contact_subtitle || "");
    setContactWhatsapp((professional as any).whatsapp || "");
    setContactPhone((professional as any).phone || "");
    setContactEmail((professional as any).email || "");
    setContactInstagram((professional as any).instagram || "");
    setIsDirty(false);
    requestAnimationFrame(() => { hasLoaded.current = true; });
  }, [professional]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    setIsDirty(true);
  }, [heroTitle, heroSubtitle, heroImageUrl, heroBgUrl, heroBgOpacity, heroBgOverlay, photoUrl, photoStyle, photoFit,
      bio, aboutImageUrl, approaches, primaryColor, secondaryColor, bgColor,
      painTitle, painSubtitle, painItems, solutionTitle, solutionSubtitle, solutionItems,
      fontFamily, fontSizeScale, contactTitle, contactSubtitle, contactWhatsapp, contactPhone, contactEmail, contactInstagram]);

  // alerta ao fechar/recarregar a aba
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirty) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const saveHero = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      hero_title: heroTitle,
      hero_subtitle: heroSubtitle,
      hero_image_url: heroImageUrl || null,
      hero_bg_url: heroBgUrl || null,
      hero_bg_opacity: heroBgOpacity,
      hero_bg_overlay: heroBgOverlay,
      photo_style: photoStyle,
      photo_fit: photoFit,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Hero salvo!"); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  const saveSobre = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      bio,
      about_image_url: aboutImageUrl || null,
      approaches,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Sobre salvo!"); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  const savePain = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      pain_title: painTitle || null,
      pain_subtitle: painSubtitle || null,
      pain_items: painItems.length > 0 ? painItems : null,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Seção Dores salva!"); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  const saveSolution = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      solution_title: solutionTitle || null,
      solution_subtitle: solutionSubtitle || null,
      solution_items: solutionItems.length > 0 ? solutionItems : null,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Seção Solução salva!"); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  const saveCores = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      background_color: bgColor,
      font_family: fontFamily,
      font_size_scale: fontSizeScale,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Cores & tipografia salvas!"); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  const saveContatos = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      contact_title: contactTitle || null,
      contact_subtitle: contactSubtitle || null,
      whatsapp: contactWhatsapp || null,
      phone: contactPhone || null,
      email: contactEmail || null,
      instagram: contactInstagram || null,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Contatos salvos!"); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  const addApproach = () => {
    const parts = newApproach.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const toAdd = parts.filter((p) => !approaches.includes(p));
    if (toAdd.length > 0) setApproaches([...approaches, ...toAdd]);
    setNewApproach("");
  };

  const handleApproachChange = (val: string) => {
    // se termina com vírgula, confirma automaticamente
    if (val.endsWith(",")) {
      const parts = val.split(",").map((s) => s.trim()).filter(Boolean);
      const toAdd = parts.filter((p) => !approaches.includes(p));
      if (toAdd.length > 0) setApproaches([...approaches, ...toAdd]);
      setNewApproach("");
    } else {
      setNewApproach(val);
    }
  };

  const PHOTO_STYLES = [
    { value: "portrait", label: "Retrato",  desc: "3:4 vertical", shape: "rounded-[1rem]", aspect: "aspect-[3/4]" },
    { value: "circle",   label: "Círculo",  desc: "Clássico",     shape: "rounded-full",   aspect: "aspect-square" },
    { value: "square",   label: "Quadrado", desc: "Moderno",      shape: "rounded-lg",     aspect: "aspect-square" },
  ];

  const SHAPES: Record<string, { shape: string; aspect: string }> = {
    portrait: { shape: "rounded-[2rem]", aspect: "aspect-[3/4]" },
    circle:   { shape: "rounded-full",   aspect: "aspect-square" },
    square:   { shape: "rounded-[1rem]", aspect: "aspect-square" },
  };

  const name = (professional as any)?.full_name || "";
  const crp  = professional?.crp || "";

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── Preview ───────────────────────────────────────── */}
      <div className="w-[58%] overflow-y-auto border-r">
        <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b">
          <span className="text-xs text-muted-foreground">Clique em uma seção para editar</span>
          {professional?.slug && (
            <a
              href={`/${professional.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Ver minha página
            </a>
          )}
        </div>

        {/* Google Fonts */}
        <link rel="stylesheet" href={GOOGLE_FONTS_URL} />

        {/* scale wrapper */}
        <div style={{ transform: "scale(0.58)", transformOrigin: "top left", width: "172.4%", pointerEvents: "none", ...buildPreviewVars(primaryColor, secondaryColor, bgColor, fontFamily, fontSizeScale) } as React.CSSProperties}>
          <div style={{ pointerEvents: "auto" }}>

            <SectionBlock label="Hero" icon={Layout} active={activeSection === "hero"} onClick={() => setActiveSection("hero")}>
              <HeroSection
                title={heroTitle}
                subtitle={heroSubtitle}
                photoUrl={photoUrl}
                heroImageUrl={heroImageUrl}
                heroBgUrl={heroBgUrl}
                heroBgOpacity={heroBgOpacity}
                heroBgOverlay={heroBgOverlay}
                professionalName={name}
                crp={crp}
                photoStyle={photoStyle}
                photoFit={photoFit}
              />
            </SectionBlock>

            <SectionBlock label="Dores" icon={AlertCircle} active={activeSection === "dores"} onClick={() => setActiveSection("dores")}>
              <PainSection
                title={painTitle || undefined}
                subtitle={painSubtitle || undefined}
                items={painItems.length > 0 ? painItems : undefined}
              />
            </SectionBlock>

            <SectionBlock label="Solução" icon={Lightbulb} active={activeSection === "solucao"} onClick={() => setActiveSection("solucao")}>
              <SolutionSection
                title={solutionTitle || undefined}
                subtitle={solutionSubtitle || undefined}
                items={solutionItems.length > 0 ? solutionItems : undefined}
              />
            </SectionBlock>

            <SectionBlock label="Sobre" icon={BookOpen} active={activeSection === "sobre"} onClick={() => setActiveSection("sobre")}>
              <AboutSection
                name={name}
                bio={bio}
                crp={crp}
                photoUrl={photoUrl}
                aboutImageUrl={aboutImageUrl}
                approaches={approaches}
              />
            </SectionBlock>

            <SectionBlock label="Cores" icon={Palette} active={activeSection === "cores"} onClick={() => setActiveSection("cores")}>
              <div className="py-16 px-8 flex flex-col items-center gap-8 bg-background">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Paleta ativa</p>
                <div className="flex gap-6">
                  {[
                    { label: "Principal",  color: primaryColor },
                    { label: "Secundária", color: secondaryColor },
                    { label: "Fundo",      color: bgColor },
                  ].map((c) => (
                    <div key={c.label} className="flex flex-col items-center gap-2">
                      <div className="w-20 h-20 rounded-2xl shadow-lg border" style={{ background: c.color }} />
                      <span className="text-xs text-muted-foreground">{c.label}</span>
                      <span className="text-xs font-mono text-foreground/60">{c.color}</span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 flex-wrap justify-center">
                  <div className="rounded-xl px-5 py-2.5 text-sm font-medium shadow-sm" style={{ background: primaryColor, color: "#fff" }}>Botão primário</div>
                  <div className="rounded-xl px-5 py-2.5 text-sm font-medium border shadow-sm" style={{ background: bgColor, borderColor: primaryColor, color: primaryColor }}>Botão outline</div>
                </div>
                <p className="text-sm text-muted-foreground" style={{ fontFamily: (FONTS.find(f => f.value === fontFamily) ?? FONTS[0]).style.fontFamily }}>
                  Fonte: <strong>{(FONTS.find(f => f.value === fontFamily) ?? FONTS[0]).label}</strong>
                  {" · "}Tamanho: <strong>{(FONT_SIZES.find(s => s.value === fontSizeScale) ?? FONT_SIZES[1]).label}</strong>
                </p>
              </div>
            </SectionBlock>

            <SectionBlock label="Contatos" icon={MessageCircle} active={activeSection === "contatos"} onClick={() => setActiveSection("contatos")}>
              <ContactSection
                title={contactTitle || undefined}
                subtitle={contactSubtitle || undefined}
                whatsapp={contactWhatsapp || undefined}
                phone={contactPhone || undefined}
                email={contactEmail || undefined}
                instagram={contactInstagram || undefined}
              />
            </SectionBlock>

          </div>
        </div>
      </div>

      {/* ── Editor panel ──────────────────────────────────── */}
      <div className="w-[42%] overflow-y-auto">

        {/* ── banner alterações não salvas ── */}
        {isDirty && (
          <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-200 px-4 py-2.5">
            <TriangleAlert className="h-4 w-4 text-amber-500 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium flex-1">Alterações não salvas</p>
          </div>
        )}

        {/* ── card de orientação IA ── */}
        {approaches.length === 0 ? (
          <div className="mx-4 mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <Sparkles className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-800">Melhore os textos gerados com IA</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Para gerar textos personalizados, preencha suas <strong>abordagens terapêuticas</strong> na aba <strong>Sobre</strong>. Quanto mais detalhado, melhor o resultado.
              </p>
              <button
                type="button"
                onClick={() => setActiveSection("sobre")}
                className="mt-1 text-xs font-medium text-amber-800 underline hover:no-underline"
              >
                Ir para Sobre →
              </button>
            </div>
          </div>
        ) : (
          <div className="mx-4 mt-4 flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
            <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-sm font-semibold text-foreground">IA pronta para gerar</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Baseando-se em <strong>{approaches.join(", ")}</strong>. Clique em <strong>✦ IA</strong> ao lado de qualquer campo para gerar o texto.
              </p>
            </div>
          </div>
        )}

        {/* section tabs */}
        <div className="flex flex-wrap border-b sticky top-0 bg-background z-10">
          {([
            { id: "hero",     label: "Hero",     icon: Layout        },
            { id: "dores",    label: "Dores",    icon: AlertCircle   },
            { id: "solucao",  label: "Solução",  icon: Lightbulb     },
            { id: "sobre",    label: "Sobre",    icon: BookOpen      },
            { id: "cores",    label: "Cores",    icon: Palette       },
            { id: "contatos", label: "Contatos", icon: MessageCircle },
          ] as { id: Section; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeSection === id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-5">

          {/* ── HERO ── */}
          {activeSection === "hero" && (
            <>
              <div className="space-y-2">
                <Label>Imagem do Hero <FieldHint text="Foto de destaque no topo da página. Se não definida, usa a foto de perfil." /></Label>
                <ImageUpload currentUrl={heroImageUrl || null} onUploaded={setHeroImageUrl} folder="hero" variant="logo" />
              </div>

              <div className="space-y-2">
                <Label>Estilo da foto</Label>
                <div className="grid grid-cols-3 gap-2">
                  {PHOTO_STYLES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPhotoStyle(opt.value)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                        photoStyle === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className={`${opt.shape} ${opt.aspect} bg-muted w-12 overflow-hidden`}>
                        {(heroImageUrl || photoUrl) && (
                          <img src={heroImageUrl || photoUrl} alt="" className={`w-full h-full ${photoFit === "cover" ? "object-cover object-top" : "object-contain"}`} />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-xs font-semibold">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Modo de exibição <FieldHint text="'Completa' mostra a imagem inteira. 'Expandida' preenche todo o espaço." /></Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "contain", label: "Completa",  desc: "Imagem inteira" },
                    { value: "cover",   label: "Expandida", desc: "Preenche o espaço" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPhotoFit(opt.value)}
                      className={`rounded-xl border-2 p-3 text-left transition-all ${
                        photoFit === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <p className="text-xs font-semibold">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Imagem de fundo do Hero <FieldHint text="Aparece atrás do conteúdo. Use fotos de ambiente, textura ou paisagem." /></Label>
                <ImageUpload currentUrl={heroBgUrl || null} onUploaded={setHeroBgUrl} folder="hero-bg" variant="logo" />
                {heroBgUrl && (
                  <button
                    type="button"
                    onClick={() => setHeroBgUrl("")}
                    className="text-xs text-destructive hover:underline"
                  >
                    Remover imagem de fundo
                  </button>
                )}
              </div>

              {heroBgUrl && (
                <>
                  <div className="space-y-3">
                    <Label>Cor do overlay</Label>
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { value: "dark",    label: "Escuro",      bg: "bg-black"          },
                        { value: "light",   label: "Claro",       bg: "bg-white border"   },
                        { value: "primary", label: "Primária",    bg: "bg-primary"        },
                        { value: "none",    label: "Nenhum",      bg: "bg-gradient-to-br from-muted to-muted/50" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setHeroBgOverlay(opt.value)}
                          className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                            heroBgOverlay === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg ${opt.bg}`} />
                          <span className="text-[11px] font-medium">{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {heroBgOverlay !== "none" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Opacidade do overlay</Label>
                        <span className="text-sm font-semibold tabular-nums text-primary">{heroBgOpacity}%</span>
                      </div>
                      <Slider
                        min={0}
                        max={100}
                        step={5}
                        value={[heroBgOpacity]}
                        onValueChange={([v]) => setHeroBgOpacity(v)}
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>Transparente</span>
                        <span>Sólido</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="heroTitle">Título principal</Label>
                  <AiButton loading={aiLoading === "hero_title"} onClick={() => generate("hero_title", setHeroTitle)} />
                </div>
                <Input id="heroTitle" value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} placeholder="Ex: Seu caminho para o equilíbrio começa aqui" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="heroSubtitle">Subtítulo</Label>
                  <AiButton loading={aiLoading === "hero_subtitle"} onClick={() => generate("hero_subtitle", setHeroSubtitle)} />
                </div>
                <Input id="heroSubtitle" value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} placeholder="Ex: Psicóloga especialista em ansiedade" />
              </div>

              <Button onClick={saveHero} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar Hero"}
              </Button>
            </>
          )}

          {/* ── DORES ── */}
          {activeSection === "dores" && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="painTitle">Título da seção</Label>
                  <AiButton loading={aiLoading === "pain_title"} onClick={() => generate("pain_title", setPainTitle)} />
                </div>
                <Input id="painTitle" value={painTitle} onChange={(e) => setPainTitle(e.target.value)} placeholder="Você sente que seus pensamentos estão no controle?" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="painSubtitle">Subtítulo</Label>
                  <AiButton loading={aiLoading === "pain_subtitle"} onClick={() => generate("pain_subtitle", setPainSubtitle)} />
                </div>
                <Textarea id="painSubtitle" rows={3} value={painSubtitle} onChange={(e) => setPainSubtitle(e.target.value)} placeholder="Reconhecer o que você sente é o primeiro passo..." />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Itens <FieldHint text="Cada item é um sintoma/dor exibido como card. Deixe vazio para usar o padrão." /></Label>
                  <AiButton loading={aiLoading === "pain_items"} onClick={() => generate("pain_items", setPainItems)} />
                </div>
                <div className="space-y-2">
                  {(painItems.length > 0 ? painItems : DEFAULT_PAIN_ITEMS).map((item, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <Input
                        value={item.text}
                        onChange={(e) => {
                          const updated = [...(painItems.length > 0 ? painItems : DEFAULT_PAIN_ITEMS)];
                          updated[i] = { text: e.target.value };
                          setPainItems(updated);
                        }}
                      />
                      <button type="button" onClick={() => setPainItems((painItems.length > 0 ? painItems : DEFAULT_PAIN_ITEMS).filter((_, j) => j !== i))}>
                        <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Novo item..." value={newPainItem} onChange={(e) => setNewPainItem(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (newPainItem.trim()) { setPainItems([...(painItems.length > 0 ? painItems : DEFAULT_PAIN_ITEMS), { text: newPainItem.trim() }]); setNewPainItem(""); } } }} />
                  <Button type="button" variant="outline" size="icon" onClick={() => { if (newPainItem.trim()) { setPainItems([...(painItems.length > 0 ? painItems : DEFAULT_PAIN_ITEMS), { text: newPainItem.trim() }]); setNewPainItem(""); } }}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Button onClick={savePain} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar Dores"}
              </Button>
            </>
          )}

          {/* ── SOLUÇÃO ── */}
          {activeSection === "solucao" && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="solutionTitle">Título da seção</Label>
                  <AiButton loading={aiLoading === "solution_title"} onClick={() => generate("solution_title", setSolutionTitle)} />
                </div>
                <Input id="solutionTitle" value={solutionTitle} onChange={(e) => setSolutionTitle(e.target.value)} placeholder="Como a terapia pode ajudar?" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="solutionSubtitle">Subtítulo</Label>
                  <AiButton loading={aiLoading === "solution_subtitle"} onClick={() => generate("solution_subtitle", setSolutionSubtitle)} />
                </div>
                <Textarea id="solutionSubtitle" rows={3} value={solutionSubtitle} onChange={(e) => setSolutionSubtitle(e.target.value)} placeholder="A Terapia Cognitivo-Comportamental..." />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Cards de benefícios <FieldHint text="Cada card tem título e descrição. Deixe vazio para usar o padrão." /></Label>
                  <AiButton loading={aiLoading === "solution_items"} onClick={() => generate("solution_items", setSolutionItems)} />
                </div>
                <div className="space-y-3">
                  {(solutionItems.length > 0 ? solutionItems : DEFAULT_SOLUTION_ITEMS).map((item, i) => (
                    <div key={i} className="rounded-lg border p-3 space-y-2">
                      <div className="flex gap-2 items-center">
                        <Input
                          placeholder="Título"
                          value={item.title}
                          onChange={(e) => {
                            const updated = [...(solutionItems.length > 0 ? solutionItems : DEFAULT_SOLUTION_ITEMS)];
                            updated[i] = { ...updated[i], title: e.target.value };
                            setSolutionItems(updated);
                          }}
                        />
                        <button type="button" onClick={() => setSolutionItems((solutionItems.length > 0 ? solutionItems : DEFAULT_SOLUTION_ITEMS).filter((_, j) => j !== i))}>
                          <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                      <Textarea
                        placeholder="Descrição"
                        rows={2}
                        value={item.desc}
                        onChange={(e) => {
                          const updated = [...(solutionItems.length > 0 ? solutionItems : DEFAULT_SOLUTION_ITEMS)];
                          updated[i] = { ...updated[i], desc: e.target.value };
                          setSolutionItems(updated);
                        }}
                      />
                    </div>
                  ))}
                </div>
                <Button type="button" variant="outline" className="w-full" onClick={() => setSolutionItems([...(solutionItems.length > 0 ? solutionItems : DEFAULT_SOLUTION_ITEMS), { title: "", desc: "" }])}>
                  <Plus className="h-4 w-4 mr-2" /> Adicionar card
                </Button>
              </div>
              <Button onClick={saveSolution} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar Solução"}
              </Button>
            </>
          )}

          {/* ── SOBRE ── */}
          {activeSection === "sobre" && (
            <>
              <div className="space-y-2">
                <Label>Imagem da seção Sobre <FieldHint text="Foto exibida na seção 'Sobre'. Se não definida, usa a foto de perfil." /></Label>
                <ImageUpload currentUrl={aboutImageUrl || null} onUploaded={setAboutImageUrl} folder="about" variant="logo" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bio">Biografia</Label>
                  <AiButton loading={aiLoading === "bio"} onClick={() => generate("bio", setBio)} />
                </div>
                <Textarea id="bio" rows={6} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Conte sobre sua formação e experiência..." />
              </div>

              <div className="space-y-2">
                <Label>Abordagens terapêuticas</Label>
                <div className="flex flex-wrap gap-2 min-h-[2.5rem]">
                  {approaches.map((a, i) => (
                    <span
                      key={a}
                      style={{ animationDelay: `${i * 40}ms` }}
                      className="animate-in fade-in zoom-in-75 duration-200 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 px-3 py-1 text-xs font-medium text-primary shadow-sm hover:shadow-md hover:border-primary/50 transition-all"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                      {a}
                      <button
                        type="button"
                        onClick={() => setApproaches(approaches.filter((x) => x !== a))}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: TCC, Psicanálise..."
                    value={newApproach}
                    onChange={(e) => handleApproachChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addApproach())}
                  />
                  <Button type="button" variant="outline" onClick={addApproach}>Adicionar</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Digite uma abordagem e pressione <kbd className="rounded border px-1 py-0.5 text-[10px] font-mono bg-muted">Enter</kbd> ou use <kbd className="rounded border px-1 py-0.5 text-[10px] font-mono bg-muted">,</kbd> para separar várias de uma vez.
                </p>
              </div>

              <Button onClick={saveSobre} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar Sobre"}
              </Button>
            </>
          )}

          {/* ── CORES ── */}
          {activeSection === "cores" && (
            <>
              <div className="space-y-3">
                <Label>Paletas recomendadas</Label>
                <div className="grid grid-cols-5 gap-2">
                  {PALETTES.map((p) => {
                    const d = deriveColors(p.primary);
                    const isSelected = primaryColor.toLowerCase() === p.primary.toLowerCase();
                    return (
                      <button
                        key={p.primary}
                        type="button"
                        onClick={() => { const dv = deriveColors(p.primary); setPrimaryColor(p.primary); setSecondaryColor(dv.secondary); setBgColor(dv.background); }}
                        title={p.name}
                        className={`group relative flex flex-col items-center gap-1 rounded-xl border-2 p-2 transition-all hover:scale-105 ${
                          isSelected ? "border-primary shadow-md" : "border-transparent hover:border-border"
                        }`}
                      >
                        <div className="flex w-full rounded-lg overflow-hidden h-8">
                          <div className="flex-1" style={{ background: p.primary }} />
                          <div className="flex-1" style={{ background: d.secondary }} />
                          <div className="flex-1" style={{ background: d.background }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground leading-none">{p.name}</span>
                        {isSelected && (
                          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-[8px] font-bold shadow">✓</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Cores personalizadas</Label>
                  <button
                    type="button"
                    onClick={() => { const dv = deriveColors(primaryColor); setSecondaryColor(dv.secondary); setBgColor(dv.background); }}
                    className="text-xs text-muted-foreground hover:text-primary underline"
                  >
                    Resetar derivadas
                  </button>
                </div>
                {[
                  { label: "Principal",  value: primaryColor,   setter: setPrimaryColor   },
                  { label: "Secundária", value: secondaryColor, setter: setSecondaryColor },
                  { label: "Fundo",      value: bgColor,        setter: setBgColor        },
                ].map(({ label, value, setter }) => (
                  <div key={label} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="h-10 w-10 cursor-pointer rounded-lg border p-1 flex-shrink-0"
                    />
                    <div className="flex-1 h-10 rounded-lg border shadow-sm" style={{ background: value }} />
                    <Input
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="font-mono uppercase w-28 flex-shrink-0"
                      maxLength={7}
                    />
                    <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{label}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-2 border-t">
                <Label className="flex items-center gap-2"><Type className="h-4 w-4" />Família de fonte</Label>
                <div className="grid grid-cols-1 gap-2">
                  {FONTS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setFontFamily(f.value)}
                      className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                        fontFamily === f.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-semibold" style={f.style}>{f.label}</p>
                        <p className="text-xs text-muted-foreground">{f.desc}</p>
                      </div>
                      <span className="text-xs text-muted-foreground" style={f.style}>Aa Bb Cc</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <Label>Tamanho do texto</Label>
                <div className="grid grid-cols-4 gap-2">
                  {FONT_SIZES.map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setFontSizeScale(s.value)}
                      className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 transition-all ${
                        fontSizeScale === s.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <span style={{ fontSize: `${Number(s.scale) * 18}px`, lineHeight: 1 }}>A</span>
                      <span className="text-[10px] text-muted-foreground">{s.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={saveCores} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar Cores & Tipografia"}
              </Button>
            </>
          )}

          {/* ── CONTATOS ── */}
          {activeSection === "contatos" && (
            <>
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                Esta seção é a <strong>última e fixa</strong> da sua página. Pré-preenchida com seus dados de contato — edite aqui ou em <em>Meu Perfil</em>.
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactTitle">Título da seção</Label>
                <Input id="contactTitle" value={contactTitle} onChange={(e) => setContactTitle(e.target.value)} placeholder="Agende Sua Primeira Consulta" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactSubtitle">Subtítulo</Label>
                <Textarea id="contactSubtitle" rows={3} value={contactSubtitle} onChange={(e) => setContactSubtitle(e.target.value)} placeholder="Dê o primeiro passo para o seu bem-estar..." />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactWhatsapp" className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-green-500" />WhatsApp</Label>
                <Input id="contactWhatsapp" value={contactWhatsapp} onChange={(e) => setContactWhatsapp(e.target.value)} placeholder="11 99999-9999" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactPhone" className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />Telefone</Label>
                <Input id="contactPhone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="11 3333-4444" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactEmail" className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" />E-mail</Label>
                <Input id="contactEmail" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="seu@email.com" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactInstagram" className="flex items-center gap-2"><Instagram className="h-4 w-4 text-pink-500" />Instagram</Label>
                <Input id="contactInstagram" value={contactInstagram} onChange={(e) => setContactInstagram(e.target.value)} placeholder="@seuperfil" />
              </div>

              <Button onClick={saveContatos} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar Contatos"}
              </Button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
