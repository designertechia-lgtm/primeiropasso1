import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Pencil, X, Palette, Layout, BookOpen, Lightbulb, AlertCircle, Plus, Sparkles, Loader2, ExternalLink, TriangleAlert, Phone, Mail, Instagram, Linkedin, Facebook, MessageCircle, Type, Moon, Sun, ListOrdered, ArrowUp, ArrowDown, Eye, EyeOff, Newspaper, PlayCircle } from "lucide-react";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";
import { TikTokIcon } from "@/components/icons/TikTokIcon";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import HeroSection from "@/components/landing/HeroSection";
import AboutSection from "@/components/landing/AboutSection";
import SolutionSection from "@/components/landing/SolutionSection";
import PainSection from "@/components/landing/PainSection";
import ContactSection from "@/components/landing/ContactSection";
import ContentSection from "@/components/landing/ContentSection";
import LandingFooter from "@/components/landing/LandingFooter";
import Section from "@/components/landing/Section";
import { CONTENT_SECTION_KEYS, zebraTone } from "@/lib/landing/sections";
import { buildLandingVars, getFontScale, FONTS, FONT_SIZES, GOOGLE_FONTS_URL } from "@/lib/landing/buildLandingVars";
import GenerateAboutVideoDialog from "@/components/admin/landing/GenerateAboutVideoDialog";

// ── Vídeo: detecção de arquivo direto vs embed (YouTube/Vimeo) ────────────
// Espelha a lógica do AboutSection da landing pública, pro preview do editor
// bater com o que o visitante vê.
function isDirectVideoUrl(url: string): boolean {
  if (!url) return false;
  const u = url.toLowerCase();
  return /\.(mp4|webm|mov)(\?|$)/.test(u) || u.includes("/storage/v1/object/public/");
}

function toVideoEmbedUrl(url: string): string {
  if (!url) return "";
  if (url.includes("youtube.com") || url.includes("youtu.be")) {
    const videoId = url.includes("youtu.be")
      ? url.split("youtu.be/")[1]?.split(/[?&]/)[0]
      : url.split("v=")[1]?.split("&")[0];
    return `https://www.youtube.com/embed/${videoId}`;
  }
  if (url.includes("vimeo.com")) {
    const videoId = url.split("vimeo.com/")[1]?.split(/[?&]/)[0];
    return `https://player.vimeo.com/video/${videoId}`;
  }
  return url;
}

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

// Rótulos/ícones das seções de conteúdo reordenáveis (tier Grátis, aba "Seções").
// Mesmas chaves de CONTENT_SECTION_KEYS (sections.ts) — Hero e Contato são fixos, fora daqui.
const CONTENT_SECTION_LABELS: Record<string, { label: string; icon: React.ElementType; hint?: string }> = {
  pain:     { label: "Dores",     icon: AlertCircle },
  solution: { label: "Solução",   icon: Lightbulb   },
  about:    { label: "Sobre",     icon: BookOpen    },
  content:  { label: "Conteúdos", icon: Newspaper, hint: "Aparece na página quando você publica artigos ou vídeos." },
};

// ── section overlay wrapper ────────────────────────────────
function SectionBlock({
  label, icon: Icon, active, onClick, hidden, children,
}: {
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
  hidden?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative group cursor-pointer transition-all ${active ? "ring-2 ring-primary ring-offset-2" : "hover:ring-2 hover:ring-primary/40 hover:ring-offset-1"} ${hidden ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      {children}
      {hidden && (
        <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-full bg-foreground/70 px-2.5 py-1 text-[10px] font-semibold text-background">
          <EyeOff className="h-3 w-3" /> Oculta
        </div>
      )}
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

type Section = "secoes" | "hero" | "dores" | "solucao" | "sobre" | "cores" | "contatos";

export default function AdminLandingPage() {
  const { data: professional, isLoading } = useProfessional();
  const queryClient = useQueryClient();

  // Artigos/vídeos para o preview da seção Conteúdos — mesma lógica da página pública
  // (publicados primeiro; se não houver, mostra rascunhos; top 3) pra o preview bater com o que o visitante vê.
  const { data: rawPreviewArticles = [] } = useQuery({
    queryKey: ["landing-preview-articles", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("articles")
        .select("id, title, slug, cover_image_url, published_at, created_at, published")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });
  const previewArticles = useMemo(() => {
    const pub = rawPreviewArticles
      .filter((a) => a.published)
      .sort((a, b) => new Date(b.published_at ?? b.created_at ?? 0).getTime() - new Date(a.published_at ?? a.created_at ?? 0).getTime())
      .slice(0, 3);
    if (pub.length > 0) return pub;
    return rawPreviewArticles
      .filter((a) => !a.published)
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, 3);
  }, [rawPreviewArticles]);

  const { data: rawPreviewVideos = [] } = useQuery({
    queryKey: ["landing-preview-videos", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, description, embed_url, thumbnail_url, published_at, created_at, published")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });
  const previewVideos = useMemo(() => {
    const pub = rawPreviewVideos
      .filter((v) => v.published)
      .sort((a, b) => new Date(b.published_at ?? b.created_at ?? 0).getTime() - new Date(a.published_at ?? a.created_at ?? 0).getTime())
      .slice(0, 3);
    if (pub.length > 0) return pub;
    return rawPreviewVideos
      .filter((v) => !v.published)
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())
      .slice(0, 3);
  }, [rawPreviewVideos]);
  const hasPreviewContent = previewArticles.length > 0 || previewVideos.length > 0;

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
  const [aboutTitle, setAboutTitle] = useState("");
  const [bio, setBio] = useState("");
  const [aboutImageUrl, setAboutImageUrl] = useState("");
  const [aboutVideoUrl, setAboutVideoUrl] = useState("");
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
  const [darkPrimaryColor, setDarkPrimaryColor] = useState("");
  const [darkSecondaryColor, setDarkSecondaryColor] = useState("");
  const [darkBgColor, setDarkBgColor] = useState("");
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [previewMode, setPreviewMode] = useState<"light" | "dark">("light");

  // tipografia
  const [fontFamily, setFontFamily] = useState("inter");
  const [headingFontFamily, setHeadingFontFamily] = useState("playfair");
  const [fontSizeScale, setFontSizeScale] = useState("md");

  // seções (ordem + ocultar) — tier Grátis
  const [sectionOrder, setSectionOrder] = useState<string[]>([...CONTENT_SECTION_KEYS]);
  const [sectionHidden, setSectionHidden] = useState<string[]>([]);

  // contatos
  const [contactTitle, setContactTitle] = useState("");
  const [contactSubtitle, setContactSubtitle] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [contactCtaMessage, setContactCtaMessage] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactInstagram, setContactInstagram] = useState("");
  const [contactLinkedin, setContactLinkedin] = useState("");
  const [contactTiktok, setContactTiktok] = useState("");
  const [contactFacebook, setContactFacebook] = useState("");

  const [activeSection, setActiveSection] = useState<Section>("hero");

  // Vídeo institucional com IA (seção Sobre) + deep-link do Axel (?gerarVideoSobre=<draft>&model=<tier>)
  const [searchParams] = useSearchParams();
  const axelDraftId = searchParams.get("gerarVideoSobre");
  const axelTierParam = searchParams.get("model");
  const axelTier = axelTierParam === "pro" ? "pro" as const : axelTierParam === "premium" ? "premium" as const : null;
  const [aboutVideoDialogOpen, setAboutVideoDialogOpen] = useState(false);
  useEffect(() => {
    if (axelDraftId) {
      setActiveSection("sobre");
      setAboutVideoDialogOpen(true);
    }
  }, [axelDraftId]);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor");
  const hasLoaded = useRef(false);

  const navigate = useNavigate();


  // 6 itens/cards: fecham 2 linhas cheias na grade de 3 colunas (mesmos defaults dos componentes públicos).
  const DEFAULT_PAIN_ITEMS = [
    { text: "Pensamentos acelerados que não param" },
    { text: "Dificuldade para dormir ou descansar de verdade" },
    { text: "Ansiedade que aperta o peito sem motivo aparente" },
    { text: "Relacionamentos que desgastam ao invés de nutrir" },
    { text: "Autocobrança constante que nunca dá trégua" },
    { text: "Sensação de que algo precisa mudar, mas não sabe por onde começar" },
  ];

  const DEFAULT_SOLUTION_ITEMS = [
    { title: "Autoconhecimento", desc: "Entenda seus padrões de pensamento e como eles influenciam suas emoções e comportamentos." },
    { title: "Objetivos Claros", desc: "Juntos, definimos metas terapêuticas que fazem sentido para a sua vida real." },
    { title: "Novas Perspectivas", desc: "Aprenda a mudar a forma como você percebe os desafios, com técnicas práticas e baseadas em evidências." },
    { title: "Espaço Seguro", desc: "Atendimento 100% ético e sigiloso, onde você pode se expressar sem julgamentos." },
    { title: "Ferramentas Práticas", desc: "Estratégias e exercícios que você leva para o dia a dia, muito além das sessões." },
    { title: "Acolhimento Contínuo", desc: "Um acompanhamento próximo e humano em cada etapa do seu processo." },
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
    setAboutTitle((professional as any).about_title || "");
    setBio(professional.bio || "");
    setAboutImageUrl((professional as any).about_image_url || "");
    setAboutVideoUrl((professional as any).about_video_url || "");
    setApproaches(professional.approaches || []);
    const pc = professional.primary_color || "#87A96B";
    const dv = deriveColors(pc);
    setPrimaryColor(pc);
    setSecondaryColor((professional as any).secondary_color || dv.secondary);
    setBgColor((professional as any).background_color || dv.background);
    setDarkPrimaryColor((professional as any).dark_primary_color || "");
    setDarkSecondaryColor((professional as any).dark_secondary_color || "");
    setDarkBgColor((professional as any).dark_background_color || "");
    setDarkModeEnabled(!!(professional as any).dark_mode);
    setPainTitle((professional as any).pain_title || "");
    setPainSubtitle((professional as any).pain_subtitle || "");
    setPainItems((professional as any).pain_items || []);
    setSolutionTitle((professional as any).solution_title || "");
    setSolutionSubtitle((professional as any).solution_subtitle || "");
    setSolutionItems((professional as any).solution_items || []);
    // Ordem das seções: garante que as 4 chaves estejam presentes (anexa as faltantes na ordem canônica),
    // mesmo que o banco tenha um subconjunto ou null → a aba "Seções" sempre lista as 4.
    const savedOrder: string[] = Array.isArray((professional as any).section_order) ? (professional as any).section_order : [];
    const validSaved = savedOrder.filter((k) => (CONTENT_SECTION_KEYS as readonly string[]).includes(k));
    setSectionOrder([...validSaved, ...CONTENT_SECTION_KEYS.filter((k) => !validSaved.includes(k))]);
    setSectionHidden(Array.isArray((professional as any).section_hidden) ? (professional as any).section_hidden : []);
    setFontFamily((professional as any).font_family || "inter");
    setHeadingFontFamily((professional as any).heading_font_family || "playfair");
    setFontSizeScale((professional as any).font_size_scale || "md");
    setContactTitle((professional as any).contact_title || "");
    setContactSubtitle((professional as any).contact_subtitle || "");
    setContactWhatsapp((professional as any).whatsapp || "");
    setContactCtaMessage((professional as any).contact_cta_message || "");
    setContactPhone((professional as any).phone || "");
    setContactEmail((professional as any).email || "");
    setContactInstagram((professional as any).instagram || "");
    setContactLinkedin((professional as any).linkedin || "");
    setContactTiktok((professional as any).tiktok || "");
    setContactFacebook((professional as any).facebook || "");
    setIsDirty(false);
    requestAnimationFrame(() => { hasLoaded.current = true; });
  }, [professional]);

  useEffect(() => {
    if (!hasLoaded.current) return;
    setIsDirty(true);
  }, [heroTitle, heroSubtitle, heroImageUrl, heroBgUrl, heroBgOpacity, heroBgOverlay, photoUrl, photoStyle, photoFit,
      aboutTitle, bio, aboutImageUrl, aboutVideoUrl, approaches, primaryColor, secondaryColor, bgColor, darkPrimaryColor, darkSecondaryColor, darkBgColor, darkModeEnabled,
      painTitle, painSubtitle, painItems, solutionTitle, solutionSubtitle, solutionItems, sectionOrder, sectionHidden,
      fontFamily, headingFontFamily, fontSizeScale, contactTitle, contactSubtitle, contactCtaMessage, contactWhatsapp, contactPhone, contactEmail, contactInstagram, contactLinkedin, contactTiktok, contactFacebook]);

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
      about_title: aboutTitle || null,
      bio,
      about_image_url: aboutImageUrl || null,
      about_video_url: aboutVideoUrl || null,
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
      dark_primary_color: darkPrimaryColor || null,
      dark_secondary_color: darkSecondaryColor || null,
      dark_background_color: darkBgColor || null,
      dark_mode: darkModeEnabled,
      font_family: fontFamily,
      heading_font_family: headingFontFamily,
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
      contact_cta_message: contactCtaMessage || null,
      whatsapp: contactWhatsapp || null,
      phone: contactPhone || null,
      email: contactEmail || null,
      instagram: contactInstagram || null,
      linkedin: contactLinkedin || null,
      tiktok: contactTiktok || null,
      facebook: contactFacebook || null,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Contatos salvos!"); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  const saveSecoes = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      section_order: sectionOrder,
      section_hidden: sectionHidden,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Seções salvas!"); setIsDirty(false); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  const moveSection = (key: string, dir: -1 | 1) => {
    setSectionOrder((prev) => {
      const i = prev.indexOf(key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const toggleHidden = (key: string) => {
    setSectionHidden((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
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

    { value: "portrait",   label: "Retrato",    desc: "Flexível",   shape: "rounded-[2rem]", aspect: "aspect-auto",   previewAspect: "aspect-[3/4]" },
    { value: "horizontal", label: "Horizontal", desc: "Formato 3:2", shape: "rounded-[2rem]", aspect: "aspect-[3/2]",  previewAspect: "aspect-[3/2]" },
    { value: "square",     label: "Quadrado",   desc: "Formato 1:1", shape: "rounded-[2rem]", aspect: "aspect-square", previewAspect: "aspect-square" },
    { value: "circle",     label: "Círculo",    desc: "Redondo",     shape: "rounded-full",   aspect: "aspect-square", previewAspect: "aspect-square" },
  ];

  const SHAPES: Record<string, { shape: string; aspect: string }> = {
    portrait:   { shape: "rounded-[2rem]", aspect: "aspect-auto"   },
    circle:     { shape: "rounded-full",   aspect: "aspect-square" },
    square:     { shape: "rounded-[2rem]", aspect: "aspect-square" },
    horizontal: { shape: "rounded-[2rem]", aspect: "aspect-[3/2]"  },
  };

  // seleciona uma seção e, no mobile, leva o usuário direto ao editor
  const selectSection = (s: Section) => {
    setActiveSection(s);
    setMobileView("editor");
  };

  const name = (professional as any)?.full_name || "";
  const crp  = professional?.crp || "";

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  // Blocos de conteúdo do preview como DADOS, pra reordenar/ocultar conforme a aba "Seções" e
  // refletir a página pública (mesmas seções, mesma ordem/zebra). Conteúdos só entra quando há
  // artigos/vídeos (igual ao guard `hasContent` do público); ao clicar, leva à gestão de Artigos.
  const previewBlocksMeta: Record<string, { label: string; icon: React.ElementType; active: boolean; clip?: boolean; onClick: () => void; node: React.ReactNode }> = {
    pain: {
      label: "Dores", icon: AlertCircle, active: activeSection === "dores", onClick: () => selectSection("dores"),
      node: <PainSection title={painTitle || undefined} subtitle={painSubtitle || undefined} items={painItems.length > 0 ? painItems : undefined} />,
    },
    solution: {
      label: "Solução", icon: Lightbulb, active: activeSection === "solucao", onClick: () => selectSection("solucao"),
      node: <SolutionSection title={solutionTitle || undefined} subtitle={solutionSubtitle || undefined} items={solutionItems.length > 0 ? solutionItems : undefined} />,
    },
    about: {
      label: "Sobre", icon: BookOpen, active: activeSection === "sobre", clip: false, onClick: () => selectSection("sobre"),
      node: <AboutSection title={aboutTitle || undefined} name={name} bio={bio} crp={crp} photoUrl={photoUrl} aboutImageUrl={aboutImageUrl} aboutVideoUrl={aboutVideoUrl} approaches={approaches} autoplay={false} />,
    },
    ...(hasPreviewContent ? {
      content: {
        label: "Conteúdos", icon: Newspaper, active: false, onClick: () => navigate("/admin/artigos"),
        node: <ContentSection articles={previewArticles as any} videos={previewVideos as any} slug={professional?.slug} whatsapp={contactWhatsapp || undefined} />,
      },
    } : {}),
  };
  const previewContentOrder = sectionOrder.filter((k) => k in previewBlocksMeta);

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-4rem)] overflow-hidden">

      {/* ── alternador mobile (Editar / Visualizar) ── */}
      <div className="lg:hidden flex shrink-0 border-b bg-background">
        <button
          type="button"
          onClick={() => setMobileView("editor")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
            mobileView === "editor" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
        >
          <Pencil className="h-4 w-4" /> Editar
        </button>
        <button
          type="button"
          onClick={() => setMobileView("preview")}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
            mobileView === "preview" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
        >
          <Layout className="h-4 w-4" /> Visualizar
        </button>
      </div>

      {/* ── Preview ───────────────────────────────────────── */}
      <div className={`${mobileView === "preview" ? "flex" : "hidden"} lg:flex flex-col w-full lg:w-[58%] flex-1 lg:flex-none min-h-0 overflow-y-auto border-r`}>

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
        <div className={previewMode} style={{ transform: `scale(${0.58 * getFontScale(fontSizeScale)})`, transformOrigin: "top left", width: `${100 / (0.58 * getFontScale(fontSizeScale))}%`, pointerEvents: "none", ...buildLandingVars({
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          background_color: bgColor,
          dark_primary_color: darkPrimaryColor,
          dark_secondary_color: darkSecondaryColor,
          dark_background_color: darkBgColor,
          font_family: fontFamily,
          heading_font_family: headingFontFamily,
          font_size_scale: fontSizeScale,
        }, previewMode === "dark" ? "dark" : "light") } as React.CSSProperties}>
          <div className="bg-background text-foreground" style={{ pointerEvents: "auto" }}>

            <SectionBlock label="Hero" icon={Layout} active={activeSection === "hero"} onClick={() => selectSection("hero")}>
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

            {previewContentOrder.map((k, i) => {
              const b = previewBlocksMeta[k];
              return (
                <SectionBlock key={k} label={b.label} icon={b.icon} active={b.active} hidden={sectionHidden.includes(k)} onClick={b.onClick}>
                  <Section tone={zebraTone(i)} clip={b.clip}>
                    {b.node}
                  </Section>
                </SectionBlock>
              );
            })}

            <SectionBlock label="Contatos" icon={MessageCircle} active={activeSection === "contatos"} onClick={() => selectSection("contatos")}>
              <Section tone="accent">
              <ContactSection
                title={contactTitle || undefined}
                subtitle={contactSubtitle || undefined}
                whatsapp={contactWhatsapp || undefined}
                ctaMessage={contactCtaMessage || undefined}
                phone={contactPhone || undefined}
                email={contactEmail || undefined}
                instagram={contactInstagram || undefined}
                linkedin={contactLinkedin || undefined}
                tiktok={contactTiktok || undefined}
                facebook={contactFacebook || undefined}
              />
              </Section>
            </SectionBlock>

            {/* Rodapé — só para fidelidade visual (não editável aqui) */}
            <div className="pointer-events-none">
              <LandingFooter professionalName={name} whatsapp={contactWhatsapp || undefined} />
            </div>

          </div>
        </div>
      </div>

      {/* ── Editor panel ──────────────────────────────────── */}
      <div className={`${mobileView === "editor" ? "block" : "hidden"} lg:block w-full lg:w-[42%] flex-1 lg:flex-none min-h-0 overflow-y-auto`}>


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
            { id: "secoes",   label: "Seções",   icon: ListOrdered   },
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

          {/* ── SEÇÕES (ordem + ocultar) ── */}
          {activeSection === "secoes" && (
            <>
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
                Organize a <strong>ordem</strong> das seções e <strong>oculte</strong> o que não quiser mostrar. O <strong>Hero</strong> fica sempre no topo e o <strong>Contato</strong> sempre no fim.
              </div>

              {/* Hero — fixo no topo */}
              <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-3 py-2.5">
                <Layout className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium flex-1">Hero</span>
                <span className="text-[10px] text-muted-foreground">Sempre no topo</span>
              </div>

              {/* Seções reordenáveis */}
              <div className="space-y-2">
                {sectionOrder.map((key, i) => {
                  const meta = CONTENT_SECTION_LABELS[key];
                  if (!meta) return null;
                  const Icon = meta.icon;
                  const hidden = sectionHidden.includes(key);
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 transition-all ${hidden ? "bg-muted/20 opacity-60" : "bg-background"}`}
                    >
                      <div className="flex flex-col -my-1">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => moveSection(key, -1)}
                          className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                          aria-label={`Mover ${meta.label} para cima`}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={i === sectionOrder.length - 1}
                          onClick={() => moveSection(key, 1)}
                          className="text-muted-foreground hover:text-primary disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                          aria-label={`Mover ${meta.label} para baixo`}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium leading-tight">{meta.label}</p>
                        {meta.hint && <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{meta.hint}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleHidden(key)}
                        title={hidden ? "Mostrar seção" : "Ocultar seção"}
                        className="rounded-md p-1.5 hover:bg-muted transition-colors flex-shrink-0"
                      >
                        {hidden ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-primary" />}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Contato — fixo no fim */}
              <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/30 px-3 py-2.5">
                <MessageCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span className="text-sm font-medium flex-1">Contato</span>
                <span className="text-[10px] text-muted-foreground">Sempre no fim</span>
              </div>

              <Button onClick={saveSecoes} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar Seções"}
              </Button>
            </>
          )}

          {/* ── HERO ── */}
          {activeSection === "hero" && (
            <>
              <div className="space-y-2">
                <Label>Imagem do Hero <FieldHint text="Foto de destaque no topo da página. Se não definida, usa a foto de perfil." /></Label>
                <ImageUpload currentUrl={heroImageUrl || null} onUploaded={setHeroImageUrl} folder="hero" variant="logo" />
              </div>

              <div className="space-y-2">
                <Label>Estilo da foto</Label>
                <div className="grid grid-cols-2 gap-2">
                  {PHOTO_STYLES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPhotoStyle(opt.value)}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-all ${
                        photoStyle === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className={`${opt.shape} ${opt.previewAspect} bg-muted w-12 overflow-hidden`}>
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
                <Label>Fundo do Hero <FieldHint text="Aparece atrás do conteúdo. Use fotos de ambiente ou micro-vídeos (loops)." /></Label>
                <ImageUpload currentUrl={heroBgUrl || null} onUploaded={setHeroBgUrl} folder="hero-bg" variant="logo" accept="image/*,video/*" />
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
                </>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Opacidade do card de texto (vidro)</Label>
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="aboutTitle">Saudação (Título)</Label>
                  <AiButton loading={aiLoading === "about_title"} onClick={() => generate("about_title", setAboutTitle)} />
                </div>
                <Input id="aboutTitle" value={aboutTitle} onChange={(e) => setAboutTitle(e.target.value)} placeholder="Muito prazer, sou o(a)..." />
                <p className="text-xs text-muted-foreground">O seu nome será exibido automaticamente abaixo desta saudação, com o efeito colorido.</p>
              </div>

              <div className="space-y-2">
                <Label>Imagem da seção Sobre <FieldHint text="Foto exibida na seção 'Sobre'. Se não definida, usa a foto de perfil." /></Label>
                <ImageUpload currentUrl={aboutImageUrl || null} onUploaded={setAboutImageUrl} folder="about" variant="logo" />
              </div>

              <div className="space-y-4 border rounded-xl p-4 bg-muted/20">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="aboutVideoUrl">Vídeo Institucional</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 h-7 text-xs"
                      onClick={() => setAboutVideoDialogOpen(true)}
                    >
                      <Sparkles className="h-3 w-3 text-primary" />
                      Gerar com IA
                    </Button>
                  </div>
                  <Input
                    id="aboutVideoUrl"
                    value={aboutVideoUrl}
                    onChange={(e) => setAboutVideoUrl(e.target.value)}
                    placeholder="Ex: https://www.youtube.com/watch?v=..."
                  />
                  <p className="text-xs text-muted-foreground">
                    Gere com IA a partir da sua foto, cole o link do YouTube/Vimeo ou faça upload abaixo.
                  </p>
                </div>
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs">Ou faça upload de um vídeo (.mp4)</Label>
                  <ImageUpload
                    currentUrl={aboutVideoUrl || null}
                    onUploaded={setAboutVideoUrl}
                    folder="videos"
                    variant="wide"
                    accept="video/mp4,video/webm"
                  />
                </div>

                {aboutVideoUrl && (
                  <div className="space-y-1.5 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs flex items-center gap-1.5">
                        <PlayCircle className="h-3.5 w-3.5 text-primary" /> Pré-visualização
                      </Label>
                      <button
                        type="button"
                        onClick={() => setAboutVideoUrl("")}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                      >
                        Remover vídeo
                      </button>
                    </div>
                    {isDirectVideoUrl(aboutVideoUrl) ? (
                      <video
                        key={aboutVideoUrl}
                        src={aboutVideoUrl}
                        controls
                        playsInline
                        className="mx-auto max-h-72 rounded-lg border bg-black"
                      />
                    ) : (
                      <div className="aspect-video rounded-lg overflow-hidden border bg-black">
                        <iframe
                          key={aboutVideoUrl}
                          src={toVideoEmbedUrl(aboutVideoUrl)}
                          className="w-full h-full"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title="Pré-visualização do vídeo institucional"
                        />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      É assim que o vídeo aparece na seção Sobre. Gerar com IA ou trocar o link atualiza aqui.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="bio" className="flex items-center gap-2">
                    Biografia
                    <FieldHint text="Para uma bio envolvente (mesmo com IA), foque em como você ajuda as pessoas e no seu propósito, não apenas no currículo. Dica de ouro: divida o texto em 3 ou 4 parágrafos com 'Enter' para aproveitar o efeito visual de 'Bloco de Notas'!" />
                  </Label>
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
              <div className="flex justify-center mb-2">
                <div className="bg-muted/50 p-1 rounded-xl flex gap-1 border">
                  <button type="button" onClick={() => setPreviewMode("light")} className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${previewMode === "light" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>☀️ Modo Claro</button>
                  <button type="button" onClick={() => setPreviewMode("dark")} className={`px-5 py-2 text-sm font-medium rounded-lg transition-all ${previewMode === "dark" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>🌙 Modo Escuro</button>
                </div>
              </div>

              {previewMode === "light" && (
                <div className="space-y-3">
                  <Label>Paletas recomendadas (Apenas Modo Claro)</Label>
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
              )}

              <div className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <Label>Cores personalizadas ({previewMode === "dark" ? "Modo Escuro" : "Modo Claro"})</Label>
                  <button
                    type="button"
                    onClick={() => {
                      if (previewMode === "dark") {
                        setDarkPrimaryColor("");
                        setDarkSecondaryColor("");
                        setDarkBgColor("");
                      } else {
                        const dv = deriveColors(primaryColor); setSecondaryColor(dv.secondary); setBgColor(dv.background);
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-primary underline"
                  >
                    {previewMode === "dark" ? "Limpar cores escuras" : "Resetar derivadas"}
                  </button>
                </div>
                {[
                  { label: "Principal",  
                    value: previewMode === "dark" ? darkPrimaryColor : primaryColor,   
                    setter: previewMode === "dark" ? setDarkPrimaryColor : setPrimaryColor,
                    fallback: primaryColor },
                  { label: "Secundária", 
                    value: previewMode === "dark" ? darkSecondaryColor : secondaryColor, 
                    setter: previewMode === "dark" ? setDarkSecondaryColor : setSecondaryColor,
                    fallback: secondaryColor },
                  { label: "Fundo",      
                    value: previewMode === "dark" ? darkBgColor : bgColor,        
                    setter: previewMode === "dark" ? setDarkBgColor : setBgColor,
                    fallback: previewMode === "dark" ? "#1a1b1e" : bgColor },
                ].map(({ label, value, setter, fallback }) => (
                  <div key={label} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={value || fallback}
                      onChange={(e) => setter(e.target.value)}
                      className="h-10 w-10 cursor-pointer rounded-lg border p-1 flex-shrink-0"
                    />
                    <div className="flex-1 h-10 rounded-lg border shadow-sm" style={{ background: value || fallback }} />
                    <Input
                      value={value}
                      placeholder={fallback}
                      onChange={(e) => setter(e.target.value)}
                      className="font-mono uppercase w-28 flex-shrink-0"
                      maxLength={7}
                    />
                    <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{label}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3 pt-6 border-t">
                <Label className="flex items-center gap-2">Tema padrão da página</Label>
                <div className="inline-flex rounded-lg border border-border p-1 bg-muted/40">
                  <button
                    type="button"
                    onClick={() => setDarkModeEnabled(false)}
                    className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${!darkModeEnabled ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Sun className="h-4 w-4" /> Claro
                  </button>
                  <button
                    type="button"
                    onClick={() => setDarkModeEnabled(true)}
                    className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-md transition-all ${darkModeEnabled ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Moon className="h-4 w-4" /> Escuro
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Define o tema em que sua página abre para os visitantes. Eles sempre podem alternar pelo botão no cabeçalho do site.</p>
              </div>

              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2"><Type className="h-4 w-4" />Fonte dos títulos (H1, H2…)</Label>
                  <FieldHint text="Aplicada a todos os títulos da sua página (H1 a H6)." />
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
                  {FONTS.map((f) => (
                    <button
                      key={`h-${f.value}`}
                      type="button"
                      onClick={() => setHeadingFontFamily(f.value)}
                      className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                        headingFontFamily === f.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div>
                        <p className="text-base font-semibold" style={f.style}>{f.label}</p>
                        <p className="text-xs text-muted-foreground">{f.desc}</p>
                      </div>
                      <span className="text-lg font-semibold text-muted-foreground" style={f.style}>Título</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2"><Type className="h-4 w-4" />Fonte do corpo (parágrafos)</Label>
                  <FieldHint text="Aplicada ao texto comum do site (body)." />
                </div>
                <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
                  {FONTS.map((f) => (
                    <button
                      key={`b-${f.value}`}
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
                <Label htmlFor="contactCtaMessage" className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-green-500" />Mensagem do botão de agendamento <FieldHint text="Texto que já vai escrito no WhatsApp quando o lead clica no botão. Se contiver 'agendar' ou 'marcar', o assistente leva direto pra agenda; um texto neutro faz passar pela apresentação do Axel. Em branco usa o padrão." /></Label>
                <Textarea id="contactCtaMessage" rows={2} value={contactCtaMessage} onChange={(e) => setContactCtaMessage(e.target.value)} placeholder="Olá! Gostaria de agendar um horário." />
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
                <Label htmlFor="contactInstagram" className="flex items-center gap-2"><Instagram className="h-4 w-4 text-pink-500" />Instagram <FieldHint text="Apenas o @ (ex: @meuperfil) ou a URL completa." /></Label>
                <Input id="contactInstagram" value={contactInstagram} onChange={(e) => setContactInstagram(e.target.value)} placeholder="@seuperfil" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactTiktok" className="flex items-center gap-2"><TikTokIcon className="h-4 w-4 text-foreground" />TikTok <FieldHint text="Apenas o @ (ex: @meuperfil) ou a URL completa." /></Label>
                <Input id="contactTiktok" value={contactTiktok} onChange={(e) => setContactTiktok(e.target.value)} placeholder="@seuperfil" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactLinkedin" className="flex items-center gap-2"><Linkedin className="h-4 w-4 text-blue-600" />LinkedIn <FieldHint text="Cole a URL completa do seu perfil (ex: linkedin.com/in/seuperfil) ou apenas o username." /></Label>
                <Input id="contactLinkedin" value={contactLinkedin} onChange={(e) => setContactLinkedin(e.target.value)} placeholder="linkedin.com/in/seuperfil" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactFacebook" className="flex items-center gap-2"><Facebook className="h-4 w-4 text-blue-600" />Facebook <FieldHint text="Cole a URL completa da sua página (ex: facebook.com/suapagina) ou apenas o username." /></Label>
                <Input id="contactFacebook" value={contactFacebook} onChange={(e) => setContactFacebook(e.target.value)} placeholder="facebook.com/suapagina" />
              </div>

              <Button onClick={saveContatos} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar Contatos"}
              </Button>
            </>
          )}

        </div>
      </div>

      {/* Vídeo institucional com IA — montado no nível da página pra
          sobreviver à troca de seção durante a geração (polling) */}
      {professional && (
        <GenerateAboutVideoDialog
          open={aboutVideoDialogOpen}
          onOpenChange={setAboutVideoDialogOpen}
          professionalSlug={(professional as any).slug}
          professionalId={(professional as any).id}
          professionalName={(professional as any).full_name || "Profissional"}
          photoUrl={aboutImageUrl || (professional as any).photo_url || null}
          currentVideoUrl={aboutVideoUrl || null}
          savedVoiceId={(professional as any).elevenlabs_voice_id || null}
          onDone={setAboutVideoUrl}
          initialDraftId={axelDraftId}
          initialTier={axelTier}
        />
      )}
    </div>
  );
}
