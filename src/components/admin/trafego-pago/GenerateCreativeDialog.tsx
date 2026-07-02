import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Sparkles, Loader2, ImageIcon, Crown, Gift } from "lucide-react";
import { videoApiAuthHeaders } from "@/lib/videoApi";
import type { Asset, Campaign } from "./types";

const VIDEO_API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

type Tier = "gratis" | "premium" | "pro";

const TIER_INFO: Record<Tier, { label: string; desc: string; icon: React.FC<any> }> = {
  gratis:  { label: "Grátis",  desc: "Foto de banco de imagens (aproximada do tema)", icon: Gift },
  premium: { label: "Premium", desc: "IA gera a imagem exata do brief (FLUX)",        icon: Sparkles },
  pro:     { label: "PRO",     desc: "IA em alta qualidade, mais fiel e detalhada",   icon: Crown },
};

// Custo estimado via edge calculate-credits (mesma conta da RPC de débito)
function useCreditEstimate(serviceKey: string, units: number, enabled: boolean) {
  return useQuery({
    queryKey: ["credit-estimate", serviceKey, units],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("calculate-credits", {
        body: { service_key: serviceKey, units },
      });
      if (error) throw error;
      return data as { credits_required: number; current_balance: number; can_afford: boolean };
    },
  });
}

interface GenerateCreativeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
  brief: Asset; // creative_brief de tipo "imagem" | "carrossel"
}

export default function GenerateCreativeDialog({
  open,
  onOpenChange,
  campaign,
  brief,
}: GenerateCreativeDialogProps) {
  const { data: professional } = useProfessional();
  const qc = useQueryClient();
  const [tier, setTier] = useState<Tier>("premium");
  const [generating, setGenerating] = useState(false);

  const tipo = brief.payload.tipo as "imagem" | "carrossel";
  const prompts: string[] =
    tipo === "carrossel"
      ? (brief.payload.cards ?? []).map((c: any) => c.visual_prompt).filter(Boolean)
      : [brief.payload.prompt_visual].filter(Boolean);

  const premiumEst = useCreditEstimate("imagem_ad_premium", prompts.length, open);
  const proEst = useCreditEstimate("imagem_ad_pro", prompts.length, open);

  const estimateFor = (t: Tier) =>
    t === "gratis" ? 0
    : t === "premium" ? premiumEst.data?.credits_required
    : proEst.data?.credits_required;

  const selectedCost = estimateFor(tier);
  const balance = premiumEst.data?.current_balance ?? proEst.data?.current_balance;
  const canAfford = tier === "gratis" || (selectedCost != null && balance != null && balance >= selectedCost);

  async function handleGenerate() {
    if (!professional?.slug || generating || !canAfford) return;
    setGenerating(true);
    try {
      const res = await fetch(`${VIDEO_API}/gerar-imagens-ad`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({
          professional_slug: professional.slug,
          prompts,
          tier,
          aspect: "square",
          reference_id: crypto.randomUUID(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Erro ${res.status} na geração`);
      }
      const data = await res.json();

      const { error: insertError } = await supabase
        .from("ads_campaign_assets" as any)
        .insert({
          campaign_id: campaign.id,
          asset_type: "creative_output",
          parent_id: brief.id,
          payload: {
            tipo,
            tier,
            urls: data.images,
            credits_charged: data.credits_charged ?? 0,
            gerado_em: new Date().toISOString(),
          },
          position: 0,
        });
      if (insertError) throw insertError;

      qc.invalidateQueries({ queryKey: ["ads_campaign_assets", campaign.id] });
      qc.invalidateQueries({ queryKey: ["credit-balance"] });

      const n = (data.images ?? []).length;
      toast.success(`${n} imagem${n !== 1 ? "ns" : ""} gerada${n !== 1 ? "s" : ""}!`, {
        description:
          data.credits_charged > 0
            ? `${data.credits_charged} crédito${data.credits_charged !== 1 ? "s" : ""} debitado${data.credits_charged !== 1 ? "s" : ""}.`
            : "Sem custo (tier grátis).",
      });
      if ((data.errors ?? []).length > 0) {
        toast.warning(`${data.errors.length} imagem(ns) falharam`, { description: data.errors[0] });
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Erro ao gerar imagens", { description: e?.message });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!generating) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            {tipo === "carrossel"
              ? `Gerar ${prompts.length} imagens do carrossel`
              : "Gerar imagem do anúncio"}
          </DialogTitle>
          <DialogDescription>
            Sem texto na imagem — títulos e descrições vão nos campos do anúncio no Gerenciador.
            Escolha o plano:
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {(Object.keys(TIER_INFO) as Tier[]).map((t) => {
            const info = TIER_INFO[t];
            const Icon = info.icon;
            const cost = estimateFor(t);
            const loading = t !== "gratis" && cost == null;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTier(t)}
                disabled={generating}
                className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition ${
                  tier === t ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"
                }`}
                aria-pressed={tier === t}
              >
                <Icon className={`h-4 w-4 shrink-0 ${tier === t ? "text-primary" : "text-muted-foreground"}`} />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{info.label}</span>
                  <span className="block text-xs text-muted-foreground">{info.desc}</span>
                </span>
                <span className="text-xs font-semibold tabular-nums shrink-0">
                  {t === "gratis" ? "0 créditos" : loading
                    ? <Loader2 className="h-3 w-3 animate-spin inline" />
                    : `${cost} crédito${cost !== 1 ? "s" : ""}`}
                </span>
              </button>
            );
          })}
        </div>

        {!canAfford && tier !== "gratis" && (
          <p className="text-xs text-destructive">
            Saldo insuficiente ({balance ?? 0}/{selectedCost}). Escolha o tier grátis ou recarregue.
          </p>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={generating || !canAfford} className="gap-2">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {tier === "gratis" ? "Gerar grátis" : `Gerar por ${selectedCost ?? "…"} crédito${selectedCost !== 1 ? "s" : ""}`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
