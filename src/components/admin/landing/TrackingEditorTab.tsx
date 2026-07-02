import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldHint } from "@/components/ui/FieldHint";
import { InfoHint } from "@/components/ui/InfoHint";
import { toast } from "sonner";

// Aba "Rastreamento" do editor da landing (/admin/landing). Autossuficiente (como ProductsEditorTab):
// grava os IDs de pixel/tag em professionals. A landing só carrega esses scripts DEPOIS do
// consentimento LGPD do visitante — então nada roda sem "aceitar".
export default function TrackingEditorTab() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const p = professional as any;

  const [metaPixelId, setMetaPixelId] = useState("");
  const [ga4Id, setGa4Id] = useState("");
  const [adsId, setAdsId] = useState("");
  const [adsLabel, setAdsLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!professional) return;
    setMetaPixelId(p.meta_pixel_id || "");
    setGa4Id(p.ga4_measurement_id || "");
    setAdsId(p.google_ads_conversion_id || "");
    setAdsLabel(p.google_ads_conversion_label || "");
  }, [professional]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      meta_pixel_id: metaPixelId.trim() || null,
      ga4_measurement_id: ga4Id.trim() || null,
      google_ads_conversion_id: adsId.trim() || null,
      google_ads_conversion_label: adsLabel.trim() || null,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Rastreamento salvo!"); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-sm font-semibold text-foreground">Medição de anúncios (Meta e Google)</span>
        <InfoHint>
          Cole aqui os IDs das suas contas de anúncio. A página envia automaticamente um evento de
          <strong> Lead</strong> quando o visitante clica no botão de WhatsApp — é o que o Meta e o Google
          usam para otimizar suas campanhas. Deixe em branco o que não usar.
        </InfoHint>
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        <span className="text-sm font-semibold text-foreground">LGPD</span>
        <InfoHint>
          <strong>LGPD:</strong> nada é rastreado sem permissão. Os pixels só carregam depois que o visitante
          <strong> aceita</strong> os cookies no aviso da página.
        </InfoHint>
      </div>

      <div className="space-y-2">
        <Label htmlFor="metaPixel">Meta Pixel ID <FieldHint text="Gerenciador de Eventos da Meta → Fontes de dados → seu Pixel. É um número de ~15 dígitos." /></Label>
        <Input id="metaPixel" value={metaPixelId} onChange={(e) => setMetaPixelId(e.target.value)} placeholder="Ex.: 123456789012345" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ga4">Google Tag / GA4 <FieldHint text="Google Analytics → Admin → Fluxos de dados → ID de métricas. Começa com G-." /></Label>
        <Input id="ga4" value={ga4Id} onChange={(e) => setGa4Id(e.target.value)} placeholder="Ex.: G-XXXXXXXXXX" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="adsId">Google Ads — ID de conversão <FieldHint text="Google Ads → Ferramentas → Conversões → sua tag. Começa com AW-." /></Label>
        <Input id="adsId" value={adsId} onChange={(e) => setAdsId(e.target.value)} placeholder="Ex.: AW-123456789" />
      </div>

      <div className="space-y-2">
        <Label htmlFor="adsLabel">Google Ads — rótulo da conversão <FieldHint text="O rótulo que aparece junto do ID de conversão do Google Ads (ex.: AbC-D_efG). Opcional." /></Label>
        <Input id="adsLabel" value={adsLabel} onChange={(e) => setAdsLabel(e.target.value)} placeholder="Ex.: AbC-D_efG12h" />
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        {saving ? "Salvando..." : "Salvar Rastreamento"}
      </Button>
    </div>
  );
}
