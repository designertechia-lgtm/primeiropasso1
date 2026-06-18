import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ShoppingCart, Calendar, ExternalLink, MessageCircle, Lock, Loader2, QrCode, CreditCard } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/utils";
import { formatPrice, type LandingProduct } from "@/components/landing/ProductsSection";

// Item normalizado que o CTA precisa conhecer (vale p/ produto ou sessão).
export interface CTAItem {
  isProduct: boolean;
  id: string;                 // id cru (sem prefixo) — usado na cobrança
  title: string;
  price: number | null;
  kind: LandingProduct["kind"];
  externalUrl: string | null;
}

// Extrai a mensagem de erro real da edge (invoke esconde o corpo em respostas não-2xx).
async function readEdgeError(error: unknown, data: any): Promise<string | undefined> {
  if (data?.error) return data.error as string;
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === "function") {
    try { const j = await ctx.json(); if (j?.error) return j.error as string; } catch { /* noop */ }
  }
  return (error as any)?.message;
}

// Diálogo de compra: coleta os dados do comprador (não-logado), cria a cobrança no Asaas
// (com split p/ o profissional) e redireciona para a página de pagamento PIX/cartão.
function CheckoutDialog({
  open, onOpenChange, product, professionalName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: { id: string; title: string; price: number; kind: LandingProduct["kind"] };
  professionalName?: string;
}) {
  const isPhysical = product.kind === "physical";
  const isDigital = product.kind === "ebook";
  const [loading, setLoading] = useState(false);
  const [method, setMethod] = useState<"pix" | "credit">("pix");
  const [f, setF] = useState({
    name: "", cpfCnpj: "", email: "", phone: "",
    postalCode: "", address: "", number: "", province: "", city: "", complement: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim() || !f.cpfCnpj.trim()) {
      toast.error("Informe seu nome e CPF.");
      return;
    }
    if (isDigital && !f.email.trim()) {
      toast.error("Informe um e-mail — é por ele que você recebe o material.");
      return;
    }
    if (isPhysical && (!f.postalCode.trim() || !f.address.trim() || !f.number.trim())) {
      toast.error("Preencha o endereço de entrega (CEP, endereço e número).");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("asaas-create-charge", {
      body: {
        item_type: "product",
        item_id: product.id,
        payment_method: method,
        buyer: {
          name: f.name.trim(),
          cpfCnpj: f.cpfCnpj.replace(/\D/g, ""),
          email: f.email.trim() || undefined,
          phone: f.phone.replace(/\D/g, "") || undefined,
        },
        shipping_address: isPhysical
          ? {
              postal_code: f.postalCode.replace(/\D/g, ""),
              address: f.address.trim(),
              number: f.number.trim(),
              province: f.province.trim() || undefined,
              city: f.city.trim() || undefined,
              complement: f.complement.trim() || undefined,
            }
          : undefined,
      },
    });

    if (error || (data as any)?.error || !(data as any)?.invoiceUrl) {
      setLoading(false);
      const msg = await readEdgeError(error, data);
      toast.error("Não foi possível iniciar o pagamento", { description: msg });
      return;
    }
    // Redireciona para a página de pagamento do Asaas (PIX/cartão). Mantém loading até sair.
    window.location.href = (data as any).invoiceUrl;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" /> Comprar
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 px-3 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{product.title}</p>
            {professionalName && <p className="text-xs text-muted-foreground truncate">de {professionalName}</p>}
          </div>
          <p className="font-semibold text-foreground shrink-0">{formatPrice(product.price)}</p>
        </div>

        <div className="space-y-3 mt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Nome completo</Label>
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Seu nome" />
            </div>
            <div className="space-y-1.5">
              <Label>CPF</Label>
              <Input value={f.cpfCnpj} onChange={(e) => set("cpfCnpj", e.target.value)} placeholder="Só números" />
            </div>
            <div className="space-y-1.5">
              <Label>Celular</Label>
              <Input value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(DDD) 9..." />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>E-mail {isDigital && <span className="text-destructive">*</span>}</Label>
              <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} placeholder="seu@email.com" />
            </div>
          </div>

          {isPhysical && (
            <div className="space-y-3 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">Endereço de entrega</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>CEP</Label>
                  <Input value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} placeholder="00000-000" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Endereço</Label>
                  <Input value={f.address} onChange={(e) => set("address", e.target.value)} placeholder="Rua / Avenida" />
                </div>
                <div className="space-y-1.5">
                  <Label>Número</Label>
                  <Input value={f.number} onChange={(e) => set("number", e.target.value)} placeholder="123" />
                </div>
                <div className="space-y-1.5">
                  <Label>Bairro</Label>
                  <Input value={f.province} onChange={(e) => set("province", e.target.value)} placeholder="Bairro" />
                </div>
                <div className="space-y-1.5">
                  <Label>Cidade</Label>
                  <Input value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Cidade" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Complemento</Label>
                <Input value={f.complement} onChange={(e) => set("complement", e.target.value)} placeholder="Apto, bloco... (opcional)" />
              </div>
            </div>
          )}

          <div className="space-y-1.5 border-t pt-3">
            <Label>Como você quer pagar?</Label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "pix", label: "PIX", hint: "na hora", icon: QrCode },
                { id: "credit", label: "Cartão", hint: "crédito", icon: CreditCard },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2.5 text-sm font-medium transition-all ${
                    method === m.id ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <m.icon className="h-4 w-4 text-primary" /> {m.label}
                  <span className="text-[10px] text-muted-foreground">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <Button onClick={submit} disabled={loading} className="w-full gap-2">
            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Gerando pagamento...</> : <>Ir para o pagamento</>}
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" /> Pagamento seguro via Asaas — PIX ou cartão
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// CTA unificado usado nos cards da landing e da vitrine.
// Sessão -> "Agendar" (WhatsApp). Produto com preço -> checkout integrado (Asaas).
// Produto sem preço -> link externo ("Comprar") ou WhatsApp ("Tenho interesse").
export function ItemCTA({
  item, whatsapp, professionalName, size = "sm",
}: {
  item: CTAItem;
  whatsapp?: string | null;
  professionalName?: string;
  size?: "sm" | "default";
}) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const hasPrice = item.price != null && item.price > 0;

  // Sessão de terapia
  if (!item.isProduct) {
    if (!whatsapp) return null;
    return (
      <Button asChild className="w-full gap-2" size={size}>
        <a href={buildWhatsAppLink(whatsapp, `Olá! Quero agendar uma sessão de "${item.title}".`)} target="_blank" rel="noopener noreferrer">
          <Calendar className="h-4 w-4" /> Agendar
        </a>
      </Button>
    );
  }

  // Produto com preço -> checkout integrado
  if (hasPrice) {
    return (
      <>
        <Button className="w-full gap-2" size={size} onClick={() => setCheckoutOpen(true)}>
          <ShoppingCart className="h-4 w-4" /> Comprar
        </Button>
        <CheckoutDialog
          open={checkoutOpen}
          onOpenChange={setCheckoutOpen}
          product={{ id: item.id, title: item.title, price: item.price as number, kind: item.kind }}
          professionalName={professionalName}
        />
      </>
    );
  }

  // Produto sem preço -> link externo ou WhatsApp
  if (item.externalUrl) {
    return (
      <Button asChild className="w-full gap-2" size={size}>
        <a href={item.externalUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="h-4 w-4" /> Comprar
        </a>
      </Button>
    );
  }
  if (whatsapp) {
    return (
      <Button asChild className="w-full gap-2" size={size}>
        <a href={buildWhatsAppLink(whatsapp, `Olá! Tenho interesse em "${item.title}". Pode me passar mais informações?`)} target="_blank" rel="noopener noreferrer">
          <MessageCircle className="h-4 w-4" /> Tenho interesse
        </a>
      </Button>
    );
  }
  return null;
}

export default CheckoutDialog;
