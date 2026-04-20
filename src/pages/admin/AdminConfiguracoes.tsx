import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";

function hexToHsl(hex: string): { h: number; s: number; l: number } {
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

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function deriveColors(hex: string, mode: 'light' | 'dark' = 'light') {
  const { h, s } = hexToHsl(hex);
  const secH = (h + 30) % 360;
  const secS = Math.round(s * 0.6);
  const secL = mode === 'light' ? Math.min(65, 50 + 15) : Math.min(55, 40 + 15);
  const bgS = Math.round(s * 0.15);
  const bgL = mode === 'light' ? 94 : 11;
  return {
    secondary: hslToHex(secH, secS, secL),
    background: hslToHex(h, bgS, bgL),
  };
}

export default function AdminConfiguracoes() {
  const { data: professional, isLoading } = useProfessional();
  const queryClient = useQueryClient();

  const [slug, setSlug] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Status colors
  const [colorStatusPending, setColorStatusPending] = useState("#EAB308");
  const [colorStatusConfirmed, setColorStatusConfirmed] = useState("#22C55E");
  const [colorStatusCompleted, setColorStatusCompleted] = useState("#3B82F6");
  const [colorStatusCancelled, setColorStatusCancelled] = useState("#EF4444");
  const [colorPaymentPending, setColorPaymentPending] = useState("#F97316");
  const [colorPaymentPaid, setColorPaymentPaid] = useState("#10B981");

  useEffect(() => {
    if (professional) {
      setSlug(professional.slug || "");
      setWhatsapp(professional.whatsapp || "");
      setLogoUrl(professional.logo_url || "");
      setPhotoUrl(professional.photo_url || "");
      setColorStatusPending((professional as any).color_status_pending || "#EAB308");
      setColorStatusConfirmed((professional as any).color_status_confirmed || "#22C55E");
      setColorStatusCompleted((professional as any).color_status_completed || "#3B82F6");
      setColorStatusCancelled((professional as any).color_status_cancelled || "#EF4444");
      setColorPaymentPending((professional as any).color_payment_pending || "#F97316");
      setColorPaymentPaid((professional as any).color_payment_paid || "#10B981");
    }
  }, [professional]);

  const handleSave = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      slug,
      whatsapp: whatsapp || null,
      logo_url: logoUrl || null,
      photo_url: photoUrl || null,
      color_status_pending: colorStatusPending,
      color_status_confirmed: colorStatusConfirmed,
      color_status_completed: colorStatusCompleted,
      color_status_cancelled: colorStatusCancelled,
      color_payment_pending: colorPaymentPending,
      color_payment_paid: colorPaymentPaid,
    } as any).eq("id", professional.id);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Configurações salvas!");
      queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Endereço da Página</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slug">Slug (URL) <FieldHint text="Endereço único da sua página. Ex: 'daia-silva' → primeiropasso.online/daia-silva. Use apenas letras minúsculas, números e hífens." /></Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">primeiropasso.com/</span>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp <FieldHint text="Número de contato exibido na sua página. Pacientes podem clicar para te contatar diretamente. Ex: (11) 99999-9999." /></Label>
            <Input id="whatsapp" placeholder="(11) 99999-9999" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Imagens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Logo <FieldHint text="Logo da sua marca exibida na sua página e como ícone no navegador (favicon). Recomendado: PNG com fundo transparente, 200×200px." /></Label>
            <ImageUpload
              currentUrl={logoUrl || null}
              onUploaded={(url) => setLogoUrl(url)}
              folder="logos"
              variant="logo"
            />
          </div>
          <div className="space-y-2">
            <Label>Foto de Perfil <FieldHint text="Sua foto principal. Usada como fallback nas seções Hero e Sobre quando não há imagem específica definida." /></Label>
            <ImageUpload
              currentUrl={photoUrl || null}
              onUploaded={(url) => setPhotoUrl(url)}
              folder="photos"
              variant="avatar"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cores dos Status</CardTitle>
          <p className="text-sm text-muted-foreground">Personalize as cores dos status de agendamento e pagamento na agenda.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: "Pendente", value: colorStatusPending, setter: setColorStatusPending },
              { label: "Confirmado", value: colorStatusConfirmed, setter: setColorStatusConfirmed },
              { label: "Concluído", value: colorStatusCompleted, setter: setColorStatusCompleted },
              { label: "Cancelado", value: colorStatusCancelled, setter: setColorStatusCancelled },
            ].map(({ label, value, setter }) => (
              <div key={label} className="space-y-1">
                <Label className="text-xs">{label}</Label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={value} onChange={(e) => setter(e.target.value)} className="h-8 w-8 rounded cursor-pointer border-0" />
                  <Input value={value} onChange={(e) => setter(e.target.value)} className="flex-1 h-8 text-xs" />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t pt-3">
            <Label className="text-xs text-muted-foreground">Pagamento</Label>
            <div className="grid grid-cols-2 gap-4 mt-2">
              {[
                { label: "Pgto Pendente", value: colorPaymentPending, setter: setColorPaymentPending },
                { label: "Pago", value: colorPaymentPaid, setter: setColorPaymentPaid },
              ].map(({ label, value, setter }) => (
                <div key={label} className="space-y-1">
                  <Label className="text-xs">{label}</Label>
                  <div className="flex gap-2 items-center">
                    <input type="color" value={value} onChange={(e) => setter(e.target.value)} className="h-8 w-8 rounded cursor-pointer border-0" />
                    <Input value={value} onChange={(e) => setter(e.target.value)} className="flex-1 h-8 text-xs" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="border-t pt-3">
            <Label className="text-xs text-muted-foreground">Preview</Label>
            <div className="flex gap-2 flex-wrap mt-2">
              {[
                { label: "Pendente", color: colorStatusPending },
                { label: "Confirmado", color: colorStatusConfirmed },
                { label: "Concluído", color: colorStatusCompleted },
                { label: "Cancelado", color: colorStatusCancelled },
                { label: "Pgto Pendente", color: colorPaymentPending },
                { label: "Pago", color: colorPaymentPaid },
              ].map(({ label, color }) => (
                <span key={label} className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: color }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>
    </div>
  );
}
