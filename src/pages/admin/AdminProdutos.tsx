import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Eye, FileText, Upload, ShoppingBag, BookOpen, Package } from "lucide-react";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";
import { formatPrice } from "@/components/landing/ProductsSection";

type ProductKind = "ebook" | "physical" | "other";

const KINDS: { value: ProductKind; label: string; icon: React.ElementType }[] = [
  { value: "ebook", label: "E-book / PDF", icon: BookOpen },
  { value: "physical", label: "Produto físico", icon: Package },
  { value: "other", label: "Outro", icon: ShoppingBag },
];

interface ProductForm {
  id?: string;
  kind: ProductKind;
  title: string;
  description: string;
  price_brl: string;
  cover_image_url: string;
  file_path: string;
  external_url: string;
  active: boolean;
  sort_order: number;
}

const emptyForm: ProductForm = {
  kind: "ebook",
  title: "",
  description: "",
  price_brl: "",
  cover_image_url: "",
  file_path: "",
  external_url: "",
  active: true,
  sort_order: 0,
};

export default function AdminProdutos() {
  const { data: professional } = useProfessional();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["admin-products", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("professional_products")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const openNew = () => {
    setForm({ ...emptyForm, sort_order: products.length });
    setOpen(true);
  };

  const openEdit = (p: any) => {
    setForm({
      id: p.id,
      kind: (p.kind as ProductKind) ?? "ebook",
      title: p.title ?? "",
      description: p.description ?? "",
      price_brl: p.price_brl != null ? String(p.price_brl) : "",
      cover_image_url: p.cover_image_url ?? "",
      file_path: p.file_path ?? "",
      external_url: p.external_url ?? "",
      active: p.active ?? true,
      sort_order: p.sort_order ?? 0,
    });
    setOpen(true);
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.type !== "application/pdf") {
      toast.error("Envie um arquivo PDF.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo muito grande", { description: "Máximo de 50MB." });
      return;
    }
    setUploadingPdf(true);
    // Pasta = user.id (RLS do bucket privado product-files exige isso).
    const path = `${user.id}/products/${Date.now()}.pdf`;
    const { error } = await supabase.storage.from("product-files").upload(path, file, { upsert: true });
    setUploadingPdf(false);
    if (error) {
      toast.error("Erro no upload do PDF", { description: error.message });
      return;
    }
    setForm((p) => ({ ...p, file_path: path }));
    toast.success("PDF enviado!");
  };

  const handleSave = async () => {
    if (!professional || !form.title.trim()) {
      toast.error("Informe um título para o produto.");
      return;
    }
    setSaving(true);
    const payload = {
      professional_id: professional.id,
      kind: form.kind,
      title: form.title.trim(),
      description: form.description.trim() || null,
      price_brl: form.price_brl.trim() ? Number(form.price_brl.replace(",", ".")) : null,
      cover_image_url: form.cover_image_url || null,
      file_path: form.file_path || null,
      external_url: form.external_url.trim() || null,
      active: form.active,
      sort_order: form.sort_order ?? 0,
    };

    const res = form.id
      ? await (supabase as any).from("professional_products").update(payload).eq("id", form.id)
      : await (supabase as any).from("professional_products").insert(payload);

    setSaving(false);
    if (res.error) {
      toast.error(`Erro ao salvar: ${res.error.message}`);
      return;
    }
    toast.success(form.id ? "Produto atualizado!" : "Produto criado!");
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["landing-preview-products"] });
  };

  const handleDelete = async (p: any) => {
    if (!confirm(`Excluir "${p.title}"?`)) return;
    const { error } = await (supabase as any).from("professional_products").delete().eq("id", p.id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    // Remove o PDF privado do storage, se houver.
    if (p.file_path) {
      await supabase.storage.from("product-files").remove([p.file_path]).catch(() => {});
    }
    toast.success("Produto excluído");
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["landing-preview-products"] });
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Produtos e Serviços</h1>
          <p className="text-sm text-muted-foreground mt-1">
            E-books, materiais e produtos que aparecem na sua página. Os serviços de agenda aparecem na vitrine automaticamente.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Novo produto</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{form.id ? "Editar produto" : "Novo produto"}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5 mt-2">
              {/* Tipo */}
              <div className="space-y-2">
                <Label>Tipo</Label>
                <div className="grid grid-cols-3 gap-2">
                  {KINDS.map((k) => {
                    const Icon = k.icon;
                    return (
                      <button
                        key={k.value}
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, kind: k.value }))}
                        className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 py-3 transition-all ${
                          form.kind === k.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                        }`}
                      >
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="text-xs text-muted-foreground">{k.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Título */}
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Ex: E-book — Primeiros passos para lidar com a ansiedade"
                />
              </div>

              {/* Descrição */}
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Conte rapidamente o que o cliente recebe."
                />
              </div>

              {/* Preço */}
              <div className="space-y-2">
                <Label>Preço (R$) <FieldHint text="Deixe em branco para exibir 'Sob consulta'." /></Label>
                <Input
                  inputMode="decimal"
                  value={form.price_brl}
                  onChange={(e) => setForm((p) => ({ ...p, price_brl: e.target.value }))}
                  placeholder="Ex: 49,90"
                />
              </div>

              {/* Capa */}
              <div className="space-y-2">
                <Label>Imagem de capa</Label>
                <ImageUpload
                  currentUrl={form.cover_image_url || null}
                  onUploaded={(url) => setForm((p) => ({ ...p, cover_image_url: url }))}
                  folder="products"
                  variant="wide"
                />
              </div>

              {/* PDF (opcional na Fase 1; entrega protegida virá no checkout) */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Arquivo PDF (opcional)
                  <FieldHint text="Guardado em local privado. A entrega automática após o pagamento será habilitada quando o checkout estiver pronto." />
                </Label>
                <input ref={pdfInputRef} type="file" accept="application/pdf" className="hidden" onChange={handlePdfUpload} />
                <div className="flex items-center gap-3">
                  <Button type="button" variant="outline" size="sm" disabled={uploadingPdf} onClick={() => pdfInputRef.current?.click()}>
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingPdf ? "Enviando..." : form.file_path ? "Trocar PDF" : "Enviar PDF"}
                  </Button>
                  {form.file_path && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <FileText className="h-3 w-3" /> PDF anexado
                      <button
                        type="button"
                        className="ml-1 text-destructive hover:underline"
                        onClick={() => setForm((p) => ({ ...p, file_path: "" }))}
                      >
                        remover
                      </button>
                    </span>
                  )}
                </div>
              </div>

              {/* Link externo */}
              <div className="space-y-2">
                <Label>Link externo (opcional) <FieldHint text="Se preencher, o botão 'Comprar' leva direto a este link (Hotmart, Kiwify, etc.)." /></Label>
                <Input
                  value={form.external_url}
                  onChange={(e) => setForm((p) => ({ ...p, external_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>

              {/* Ativo */}
              <div className="flex items-center gap-2 pt-1">
                <Switch checked={form.active} onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))} />
                <Label>Ativo (aparece na página)</Label>
              </div>

              <Button onClick={handleSave} disabled={saving} className="w-full">
                {saving ? "Salvando..." : "Salvar produto"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {products.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">
          Nenhum produto ainda. Clique em "Novo produto" para começar.
        </p>
      ) : (
        <div className="grid gap-4">
          {products.map((p: any) => {
            const meta = KINDS.find((k) => k.value === p.kind) ?? KINDS[2];
            const Icon = meta.icon;
            return (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-4 min-w-0">
                    {p.cover_image_url ? (
                      <img src={p.cover_image_url} alt="" className="h-12 w-12 object-cover rounded shrink-0" />
                    ) : (
                      <div className="h-12 w-12 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-lg truncate">{p.title}</CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {meta.label} · {formatPrice(p.price_brl)}
                        {p.file_path && <span className="ml-2">· PDF</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {professional?.slug && (
                      <Button variant="ghost" size="icon" asChild title="Ver na vitrine">
                        <a href={`/${professional.slug}/produtos`} target="_blank" rel="noreferrer">
                          <Eye className="h-4 w-4 text-primary" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(p)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      p.active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {p.active ? "Ativo" : "Oculto"}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
