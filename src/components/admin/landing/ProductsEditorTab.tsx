import { useRef, useState, useEffect } from "react";
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
import { Plus, Pencil, Trash2, Eye, FileText, Upload, ShoppingBag, BookOpen, Package, Briefcase } from "lucide-react";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";
import { InfoHint } from "@/components/ui/InfoHint";
import { formatPrice } from "@/components/landing/ProductsSection";
import ServicesEditor from "@/components/admin/landing/ServicesEditor";
import ReceivablesOnboarding from "@/components/admin/landing/ReceivablesOnboarding";
import OrdersPanel from "@/components/admin/landing/OrdersPanel";
import WalletPanel from "@/components/admin/landing/WalletPanel";

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
  description_full: string;
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
  description_full: "",
  price_brl: "",
  cover_image_url: "",
  file_path: "",
  external_url: "",
  active: true,
  sort_order: 0,
};

// CRUD de produtos, renderizado na aba "Produtos" do editor da landing (/admin/landing).
// A edição abre num modal (Dialog) para não ficar espremida no painel estreito do editor.
export default function ProductsEditorTab() {
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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-products"] });
    queryClient.invalidateQueries({ queryKey: ["landing-preview-products"] });
    queryClient.invalidateQueries({ queryKey: ["products"] });
    queryClient.invalidateQueries({ queryKey: ["products-all"] });
  };

  // Textos editáveis da seção (título + subtítulo). Salvam em professionals.products_title/subtitle.
  const [secTitle, setSecTitle] = useState("");
  const [secSubtitle, setSecSubtitle] = useState("");
  const [savingTexts, setSavingTexts] = useState(false);
  const [textsInit, setTextsInit] = useState(false);
  useEffect(() => {
    if (professional && !textsInit) {
      setSecTitle((professional as any).products_title || "");
      setSecSubtitle((professional as any).products_subtitle || "");
      setTextsInit(true);
    }
  }, [professional, textsInit]);

  const handleSaveTexts = async () => {
    if (!professional) return;
    setSavingTexts(true);
    const { error } = await supabase
      .from("professionals")
      .update({ products_title: secTitle.trim() || null, products_subtitle: secSubtitle.trim() || null } as any)
      .eq("id", professional.id);
    setSavingTexts(false);
    if (error) {
      toast.error("Erro ao salvar os textos da seção");
      return;
    }
    toast.success("Textos da seção salvos!");
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    queryClient.invalidateQueries({ queryKey: ["landing-preview-products"] });
  };

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
      description_full: p.description_full ?? "",
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
      description_full: form.description_full.trim() || null,
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
    invalidate();
  };

  const handleDelete = async (p: any) => {
    if (!confirm(`Excluir "${p.title}"?`)) return;
    const { error } = await (supabase as any).from("professional_products").delete().eq("id", p.id);
    if (error) {
      toast.error("Erro ao excluir");
      return;
    }
    if (p.file_path) {
      await supabase.storage.from("product-files").remove([p.file_path]).catch(() => {});
    }
    toast.success("Produto excluído");
    invalidate();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-sm font-semibold text-foreground">Produtos e Serviços</span>
        <InfoHint>
          Esta seção reúne suas <strong>sessões de terapia</strong> (o principal) e seus <strong>produtos</strong> (e-books, materiais).
          Tudo é editável. A seção fica oculta na página enquanto não houver nenhum item.
        </InfoHint>
      </div>

      {/* Ativação de recebimentos (subconta Asaas) — necessária para vender */}
      <ReceivablesOnboarding />

      {/* Painel de vendas (pedidos do marketplace) */}
      <OrdersPanel />

      {/* Carteira: saldo, chave PIX de saque e saque */}
      <WalletPanel />

      {/* ── Textos da seção (editáveis) ── */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Textos da seção</h3>
        <div className="space-y-2">
          <Label>Título <FieldHint text="Aparece como título da seção na sua página. Em branco usa o padrão." /></Label>
          <Input
            value={secTitle}
            onChange={(e) => setSecTitle(e.target.value)}
            placeholder="Produtos e Serviços"
          />
        </div>
        <div className="space-y-2">
          <Label>Subtítulo</Label>
          <Textarea
            rows={2}
            value={secSubtitle}
            onChange={(e) => setSecSubtitle(e.target.value)}
            placeholder="Sessões de terapia, e-books e materiais para apoiar a sua jornada."
          />
        </div>
        <Button onClick={handleSaveTexts} disabled={savingTexts} variant="outline" size="sm">
          {savingTexts ? "Salvando..." : "Salvar textos da seção"}
        </Button>
      </div>

      {/* ── Sessões de terapia (principal) ── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" /> Sessões de terapia
          </h3>
          <p className="text-xs text-muted-foreground">As sessões que você oferece. São as mesmas usadas no agendamento.</p>
        </div>
        <ServicesEditor />
      </div>

      {/* ── Produtos e materiais (secundário) ── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-primary" /> Produtos e materiais
          </h3>
          <p className="text-xs text-muted-foreground">E-books, PDFs e produtos físicos.</p>
        </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button onClick={openNew} className="w-full"><Plus className="h-4 w-4 mr-2" />Novo produto</Button>
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

            {/* Descrição curta */}
            <div className="space-y-2">
              <Label>Descrição curta <FieldHint text="Aparece direto no card do produto." /></Label>
              <Textarea
                rows={2}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Uma frase que resume o produto."
              />
            </div>

            {/* Descrição completa */}
            <div className="space-y-2">
              <Label>Descrição completa <FieldHint text="Abre no 'Ver mais' do card. Use para detalhar o que o cliente recebe." /></Label>
              <Textarea
                rows={4}
                value={form.description_full}
                onChange={(e) => setForm((p) => ({ ...p, description_full: e.target.value }))}
                placeholder="Detalhe o conteúdo, formato, número de páginas, bônus, etc."
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

            {/* PDF opcional */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Arquivo PDF (opcional)
                <FieldHint text="Guardado em local privado. A entrega automática após o pagamento virá com o checkout." />
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8 animate-pulse">Carregando...</p>
      ) : products.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhum produto ainda. Clique em "Novo produto" para começar.
        </p>
      ) : (
        <div className="space-y-3">
          {products.map((p: any) => {
            const meta = KINDS.find((k) => k.value === p.kind) ?? KINDS[2];
            const Icon = meta.icon;
            return (
              <Card key={p.id}>
                <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {p.cover_image_url ? (
                      <img src={p.cover_image_url} alt="" className="h-10 w-10 object-cover rounded shrink-0" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <CardTitle className="text-sm truncate">{p.title}</CardTitle>
                      <p className="text-[11px] text-muted-foreground">
                        {meta.label} · {formatPrice(p.price_brl)}
                        {p.file_path && <span className="ml-1">· PDF</span>}
                        {!p.active && <span className="ml-1 text-amber-600">· oculto</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {professional?.slug && (
                      <Button variant="ghost" size="icon" asChild title="Ver na vitrine" className="h-8 w-8">
                        <a href={`/${professional.slug}/produtos`} target="_blank" rel="noreferrer">
                          <Eye className="h-4 w-4 text-primary" />
                        </a>
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(p)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
