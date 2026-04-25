import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles, X, ExternalLink, Eye, Type, MessageCircle, Lightbulb } from "lucide-react";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";

const FONT_SIZES = [
  { value: "sm", label: "Pequeno", class: "text-2xl md:text-3xl",  preview: "Aa" },
  { value: "md", label: "Normal",  class: "text-3xl md:text-5xl",  preview: "Aa" },
  { value: "lg", label: "Grande",  class: "text-4xl md:text-6xl",  preview: "Aa" },
];

const FONT_STYLES = [
  {
    value: "serif-italic",
    label: "Serifado Itálico",
    class: "font-serif italic font-medium tracking-tight",
    preview: "Escreva seus pensamentos.",
  },
  {
    value: "serif-bold",
    label: "Bold Maiúsculas",
    class: "font-serif font-black uppercase tracking-tighter",
    preview: "FORÇA E EQUILÍBRIO",
  },
  {
    value: "sans-bold",
    label: "Sans Bold",
    class: "font-sans font-black tracking-tight",
    preview: "Sua melhor versão.",
  },
  {
    value: "serif-elegant",
    label: "Serifado Elegante",
    class: "font-serif font-semibold italic tracking-normal",
    preview: "Cura e autoconhecimento.",
  },
];

const ImageSearchButtons = ({ keyword }: { keyword?: string }) => {
  if (!keyword) return null;
  const encoded = encodeURIComponent(keyword);
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" asChild>
        <a href={`https://www.pexels.com/search/${encoded}`} target="_blank" rel="noreferrer">
          <ExternalLink className="h-3 w-3 mr-1" /> Pexels
        </a>
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" asChild>
        <a href={`https://unsplash.com/s/photos/${encoded}`} target="_blank" rel="noreferrer">
          <ExternalLink className="h-3 w-3 mr-1" /> Unsplash
        </a>
      </Button>
      <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" asChild>
        <a href={`https://www.freepik.com/search?query=${encoded}`} target="_blank" rel="noreferrer">
          <ExternalLink className="h-3 w-3 mr-1" /> Freepik
        </a>
      </Button>
    </div>
  );
};

interface CarouselItem {
  image_url: string;
  caption: string;
  image_suggestion?: string;
}

interface ArticleForm {
  id?: string;
  title: string;
  slug: string;
  content: string;
  cover_image_url: string;
  cover_image_suggestion?: string;
  published: boolean;
  carousel_items: CarouselItem[];
  // configurações
  topic: string;
  font_style: string;
  font_size: string;
  contact_slide_title: string;
}

const emptyForm: ArticleForm = {
  title: "",
  slug: "",
  content: "",
  cover_image_url: "",
  cover_image_suggestion: "",
  published: false,
  carousel_items: [],
  topic: "",
  font_style: "serif-italic",
  font_size: "md",
  contact_slide_title: "",
};

export default function AdminArtigos() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ArticleForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const { data: articles = [], isLoading } = useQuery({
    queryKey: ["admin-articles", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("articles")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const generateSlug = (title: string) =>
    title.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const openNew = () => {
    setForm({
      ...emptyForm,
      contact_slide_title: (professional as any)?.contact_title || "",
    });
    setOpen(true);
  };

  const openEdit = (a: any) => {
    setForm({
      id: a.id,
      title: a.title,
      slug: a.slug,
      content: a.content || "",
      cover_image_url: a.cover_image_url || "",
      published: a.published,
      carousel_items: Array.isArray(a.carousel_items) ? a.carousel_items : [],
      topic: "",
      font_style: a.font_style || "serif-italic",
      font_size: a.font_size || "md",
      contact_slide_title: (professional as any)?.contact_title || "",
    });
    setOpen(true);
  };

  const handleGenerateAI = async () => {
    if (!professional) return;
    setGenerating(true);
    try {
      const existingCarouselUrls = articles.flatMap((a: any) =>
        Array.isArray(a.carousel_items)
          ? a.carousel_items.map((item: any) => item.image_url).filter(Boolean)
          : []
      );

      const { data, error } = await supabase.functions.invoke("generate-text", {
        body: {
          field: "article_with_carousel",
          context: {
            name: (professional as any).full_name || "Profissional",
            specialty: professional.approaches?.[0] || "",
            title: form.title,
            topic: form.topic,
            existing_titles: articles.map((a: any) => a.title),
            existing_cover_urls: articles.map((a: any) => a.cover_image_url).filter(Boolean),
            existing_carousel_urls: existingCarouselUrls,
          },
        },
      });

      if (error) throw error;
      if (!data?.result) throw new Error("Resposta da IA sem resultado");

      const result = typeof data.result === "string" ? JSON.parse(data.result) : data.result;

      setForm((prev) => ({
        ...prev,
        title: result.title || prev.title,
        slug: generateSlug(result.title || prev.title),
        content: result.content,
        cover_image_url: result.cover_image_url || prev.cover_image_url,
        cover_image_suggestion: result.cover_image_suggestion,
        carousel_items: result.carousel_items.map((item: any) => ({
          image_url: item.image_url || "",
          caption: item.caption,
          image_suggestion: item.image_suggestion,
        })),
      }));
      toast.success("Artigo gerado! Revise as imagens e salve.");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar artigo com IA");
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!professional || !form.title) return;
    setSaving(true);

    const slug = (form.slug || generateSlug(form.title)) || crypto.randomUUID().slice(0, 8);
    const payload = {
      professional_id: professional.id,
      title: form.title,
      slug,
      content: form.content || null,
      cover_image_url: form.cover_image_url || null,
      published: form.published,
      published_at: form.published ? new Date().toISOString() : null,
      carousel_items: form.carousel_items as any,
      font_style: form.font_style,
      font_size: form.font_size,
    };

    const [articleRes, contactRes] = await Promise.all([
      form.id
        ? supabase.from("articles").update(payload as any).eq("id", form.id)
        : supabase.from("articles").insert(payload as any),
      // Salva o texto do último slide no profissional
      supabase.from("professionals").update({
        contact_title: form.contact_slide_title || null,
      } as any).eq("id", professional.id),
    ]);

    setSaving(false);

    if (articleRes.error) {
      toast.error(`Erro ao salvar artigo: ${articleRes.error.message}`);
    } else {
      toast.success(form.id ? "Artigo atualizado!" : "Artigo criado!");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
      queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    }
  };

  const addCarouselItem = () =>
    setForm((prev) => ({ ...prev, carousel_items: [...prev.carousel_items, { image_url: "", caption: "" }] }));

  const removeCarouselItem = (i: number) =>
    setForm((prev) => ({ ...prev, carousel_items: prev.carousel_items.filter((_, j) => j !== i) }));

  const updateCarouselItem = (i: number, field: keyof CarouselItem, value: string) => {
    const items = [...form.carousel_items];
    items[i] = { ...items[i], [field]: value };
    setForm((prev) => ({ ...prev, carousel_items: items }));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este artigo?")) return;
    const { error } = await supabase.from("articles").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Artigo excluído");
      queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Artigos</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo Artigo</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between pr-8">
                <DialogTitle>{form.id ? "Editar Artigo" : "Novo Artigo"}</DialogTitle>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateAI}
                  disabled={generating}
                  className="h-8"
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" />
                  {generating ? "Gerando..." : "Gerar com IA"}
                </Button>
              </div>
            </DialogHeader>

            <Tabs defaultValue="conteudo" className="mt-2">
              <TabsList className="w-full">
                <TabsTrigger value="conteudo" className="flex-1">Conteúdo</TabsTrigger>
                <TabsTrigger value="carrossel" className="flex-1">Carrossel</TabsTrigger>
                <TabsTrigger value="config" className="flex-1 gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5" /> IA & Estilo
                </TabsTrigger>
              </TabsList>

              {/* ── ABA CONTEÚDO ── */}
              <TabsContent value="conteudo" className="space-y-5 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título <FieldHint text="Nome do artigo exibido na sua página." /></Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm((p) => ({ ...p, title: e.target.value, slug: p.id ? p.slug : generateSlug(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Slug <FieldHint text="Endereço na URL." /></Label>
                    <Input value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Imagem de Capa</Label>
                  {form.cover_image_suggestion && (
                    <div className="mb-2">
                      <p className="text-xs text-muted-foreground italic">Sugestão da IA: {form.cover_image_suggestion}</p>
                      <ImageSearchButtons keyword={form.cover_image_suggestion} />
                    </div>
                  )}
                  <ImageUpload
                    currentUrl={form.cover_image_url || null}
                    onUploaded={(url) => setForm((p) => ({ ...p, cover_image_url: url }))}
                    folder="articles"
                    variant="logo"
                  />
                  <Input
                    value={form.cover_image_url}
                    onChange={(e) => setForm((p) => ({ ...p, cover_image_url: e.target.value }))}
                    placeholder="URL da imagem de capa..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Conteúdo / Legenda Instagram <FieldHint text="Texto principal do artigo." /></Label>
                  <Textarea rows={6} value={form.content} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Switch checked={form.published} onCheckedChange={(v) => setForm((p) => ({ ...p, published: v }))} />
                  <Label>Publicado</Label>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? "Salvando..." : "Salvar Artigo"}
                </Button>
              </TabsContent>

              {/* ── ABA CARROSSEL ── */}
              <TabsContent value="carrossel" className="space-y-5 pt-4">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">Slides do carrossel</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addCarouselItem}>
                    <Plus className="h-4 w-4 mr-2" /> Adicionar slide
                  </Button>
                </div>

                {form.carousel_items.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    Nenhum slide ainda. Use "Gerar com IA" ou adicione manualmente.
                  </p>
                )}

                <div className="space-y-4">
                  {form.carousel_items.map((item, index) => (
                    <Card key={index} className="relative p-4 border-dashed">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 text-destructive"
                        onClick={() => removeCarouselItem(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <div className="space-y-4">
                        <div className="flex flex-col gap-2">
                          <Label>Imagem do Slide {index + 1}</Label>
                          {item.image_suggestion && (
                            <div className="mb-1">
                              <p className="text-xs text-muted-foreground italic">Sugestão: {item.image_suggestion}</p>
                              <ImageSearchButtons keyword={item.image_suggestion} />
                            </div>
                          )}
                          <ImageUpload
                            currentUrl={item.image_url || null}
                            onUploaded={(url) => updateCarouselItem(index, "image_url", url)}
                            folder="articles/carousel"
                            variant="logo"
                          />
                          <Input
                            value={item.image_url}
                            onChange={(e) => updateCarouselItem(index, "image_url", e.target.value)}
                            placeholder="URL da imagem..."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Legenda do Slide</Label>
                          <Input
                            value={item.caption}
                            onChange={(e) => updateCarouselItem(index, "caption", e.target.value)}
                            placeholder="Texto curto para este slide..."
                          />
                          {form.font_style && (
                            <p
                              className={`text-muted-foreground px-1 leading-tight
                                ${FONT_STYLES.find((f) => f.value === form.font_style)?.class ?? ""}
                                ${form.font_size === "sm" ? "text-lg" : form.font_size === "lg" ? "text-2xl" : "text-xl"}`}
                            >
                              {item.caption || "Pré-visualização da fonte"}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>

                {form.carousel_items.length > 0 && (
                  <Button onClick={handleSave} disabled={saving} className="w-full">
                    {saving ? "Salvando..." : "Salvar Artigo"}
                  </Button>
                )}
              </TabsContent>

              {/* ── ABA IA & ESTILO ── */}
              <TabsContent value="config" className="space-y-6 pt-4">

                {/* Sugestão para a IA */}
                <div className="space-y-2">
                  <Label htmlFor="topic" className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Sugestão de tema para a IA
                    <FieldHint text="Descreva o tema, emoção ou assunto que quer abordar. A IA usará isso para criar um carrossel mais personalizado." />
                  </Label>
                  <Textarea
                    id="topic"
                    rows={3}
                    value={form.topic}
                    onChange={(e) => setForm((p) => ({ ...p, topic: e.target.value }))}
                    placeholder="Ex: Quero falar sobre como a ansiedade afeta os relacionamentos. Tom acolhedor e prático."
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateAI}
                    disabled={generating}
                    className="gap-2"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    {generating ? "Gerando..." : "Gerar com IA usando este tema"}
                  </Button>
                </div>

                {/* Seletor de fonte */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Estilo de fonte dos slides
                  </Label>
                  <div className="grid grid-cols-1 gap-2">
                    {FONT_STYLES.map((f) => (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, font_style: f.value }))}
                        className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                          form.font_style === f.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span className="text-xs text-muted-foreground w-28 shrink-0">{f.label}</span>
                        <span className={`text-base flex-1 text-center ${f.class}`}>{f.preview}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tamanho da fonte */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Tamanho do texto nos slides
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    {FONT_SIZES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, font_size: s.value }))}
                        className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 py-4 transition-all ${
                          form.font_size === s.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <span
                          className={`font-bold leading-none ${
                            FONT_STYLES.find((f) => f.value === form.font_style)?.class ?? ""
                          } ${s.value === "sm" ? "text-2xl" : s.value === "md" ? "text-3xl" : "text-4xl"}`}
                        >
                          {s.preview}
                        </span>
                        <span className="text-xs text-muted-foreground mt-1">{s.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Texto do último slide */}
                <div className="space-y-2 border-t pt-5">
                  <Label htmlFor="contactSlide" className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-600" />
                    Texto do último slide (CTA de contato)
                    <FieldHint text="Aparece no slide final de todos os seus artigos. O WhatsApp e o nome vêm do seu perfil." />
                  </Label>
                  <Input
                    id="contactSlide"
                    value={form.contact_slide_title}
                    onChange={(e) => setForm((p) => ({ ...p, contact_slide_title: e.target.value }))}
                    placeholder="Dê o primeiro passo. Agende sua conversa."
                  />
                  <div className="rounded-lg border border-dashed p-3 flex flex-col items-center gap-2 bg-muted/30">
                    <p className="text-xs text-muted-foreground">Pré-visualização do slide final</p>
                    <div
                      className="w-full rounded-xl flex flex-col items-center justify-center gap-3 py-6 px-4 text-center"
                      style={{ background: "radial-gradient(ellipse at top, #1a2e1a, #0a120a)" }}
                    >
                      <p className="text-white font-serif font-bold text-lg leading-tight whitespace-pre-line">
                        {form.contact_slide_title || "Dê o primeiro passo.\nAgende sua conversa."}
                      </p>
                      <div className="h-0.5 w-8 rounded-full bg-primary/60" />
                      {(professional as any)?.full_name && (
                        <p className="text-white/70 text-xs">{(professional as any).full_name}</p>
                      )}
                    </div>
                  </div>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? "Salvando..." : "Salvar tudo"}
                </Button>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {articles.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          Nenhum artigo ainda. Clique em "Novo Artigo" ou use a IA para começar.
        </p>
      ) : (
        <div className="grid gap-4">
          {articles.map((a: any) => (
            <Card key={a.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-4">
                  {a.cover_image_url && (
                    <img src={a.cover_image_url} alt="" className="h-12 w-12 object-cover rounded" />
                  )}
                  <div>
                    <CardTitle className="text-lg">{a.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {Array.isArray(a.carousel_items) ? `${a.carousel_items.length} slides` : "Sem carrossel"}
                      {a.font_style && (
                        <span className="ml-2 text-muted-foreground/60">
                          · {FONT_STYLES.find((f) => f.value === a.font_style)?.label ?? a.font_style}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  {a.published && professional?.slug && (
                    <Button variant="ghost" size="icon" asChild title="Visualizar artigo">
                      <a href={`/${professional.slug}/artigo/${a.slug}`} target="_blank" rel="noreferrer">
                        <Eye className="h-4 w-4 text-primary" />
                      </a>
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${
                    a.published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {a.published ? "Publicado" : "Rascunho"}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
