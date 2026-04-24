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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Sparkles, Image as ImageIcon, X, ExternalLink } from "lucide-react";

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
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";

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
}

const emptyForm: ArticleForm = { 
  title: "", 
  slug: "", 
  content: "", 
  cover_image_url: "", 
  cover_image_suggestion: "",
  published: false,
  carousel_items: []
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
    title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const openNew = () => {
    setForm(emptyForm);
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
      carousel_items: Array.isArray(a.carousel_items) ? a.carousel_items : []
    });
    setOpen(true);
  };

  const handleGenerateAI = async () => {
    if (!professional) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-text", {
        body: {
          field: "article_with_carousel",
          context: {
            name: (professional as any).full_name || "Profissional",
            specialty: professional.approaches?.[0] || "",
            title: form.title
          }
        }
      });

      if (error) throw error;

      if (!data || !data.result) {
        throw new Error("Resposta da IA sem resultado");
      }

      const result = typeof data.result === "string" ? JSON.parse(data.result) : data.result;
      
      setForm({
        ...form,
        title: result.title || form.title,
        slug: generateSlug(result.title || form.title),
        content: result.content,
        cover_image_url: result.cover_image_url || form.cover_image_url,
        cover_image_suggestion: result.cover_image_suggestion,
        carousel_items: result.carousel_items.map((item: any) => ({
          image_url: item.image_url || "",
          caption: item.caption,
          image_suggestion: item.image_suggestion
        }))
      });
      toast.success("Artigo gerado com sucesso! Agora adicione as imagens.");
    } catch (error: any) {
      console.error("Erro detalhado ao gerar artigo:", error);
      
      let message = error.message || "Erro ao gerar artigo com IA";
      
      // Tentar capturar erro detalhado da Edge Function
      if (error.status === 500 || error.message?.includes("non-2xx")) {
        try {
          // O objeto error do supabase.functions.invoke pode conter detalhes
          // Mas normalmente ele só joga a mensagem. Vamos tentar ver se há algo no console.
          console.log("Inspecionando objeto de erro:", Object.keys(error));
        } catch (e) {}
      }

      toast.error(message);
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
      carousel_items: form.carousel_items as any
    };

    const { error } = form.id
      ? await supabase.from("articles").update(payload).eq("id", form.id)
      : await supabase.from("articles").insert(payload);

    setSaving(false);
    if (error) {
      console.error("Erro ao salvar artigo:", error);
      toast.error(`Erro ao salvar artigo: ${error.message}`);
    } else {
      toast.success(form.id ? "Artigo atualizado!" : "Artigo criado!");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-articles"] });
    }
  };

  const addCarouselItem = () => {
    setForm({
      ...form,
      carousel_items: [...form.carousel_items, { image_url: "", caption: "" }]
    });
  };

  const removeCarouselItem = (index: number) => {
    const newItems = [...form.carousel_items];
    newItems.splice(index, 1);
    setForm({ ...form, carousel_items: newItems });
  };

  const updateCarouselItem = (index: number, field: keyof CarouselItem, value: string) => {
    const newItems = [...form.carousel_items];
    newItems[index] = { ...newItems[index], [field]: value };
    setForm({ ...form, carousel_items: newItems });
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
        <div className="flex gap-2">
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
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Título <FieldHint text="Nome do artigo exibido na sua página." /></Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value, slug: form.id ? form.slug : generateSlug(e.target.value) })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Slug <FieldHint text="Endereço na URL." /></Label>
                    <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
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
                    onUploaded={(url) => setForm({ ...form, cover_image_url: url })}
                    folder="articles"
                    variant="logo"
                  />
                  <Input
                    value={form.cover_image_url}
                    onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })}
                    placeholder="URL da imagem de capa..."
                  />
                </div>

                <div className="space-y-2">
                  <Label>Conteúdo / Legenda Instagram <FieldHint text="Texto principal do artigo." /></Label>
                  <Textarea rows={6} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg font-semibold">Carrossel (Estilo Instagram)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addCarouselItem}>
                      <Plus className="h-4 w-4 mr-2" /> Adicionar Card
                    </Button>
                  </div>
                  
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
                            <Label>Imagem do Card {index + 1}</Label>
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
                            <Label>Legenda do Card</Label>
                            <Input
                              value={item.caption}
                              onChange={(e) => updateCarouselItem(index, "caption", e.target.value)}
                              placeholder="Texto curto para este slide..."
                            />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch checked={form.published} onCheckedChange={(v) => setForm({ ...form, published: v })} />
                  <Label>Publicado</Label>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? "Salvando..." : "Salvar Artigo"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {articles.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhum artigo ainda. Clique em "Novo Artigo" ou use a IA para começar.</p>
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
                      {Array.isArray(a.carousel_items) ? `${a.carousel_items.length} cards no carrossel` : "Sem carrossel"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(a)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <span className={`text-xs px-2 py-1 rounded-full ${a.published ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
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
