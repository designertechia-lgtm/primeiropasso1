import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  Loader2,
  Users,
  MessageCircle,
  Copy,
  Clapperboard,
  LayoutGrid,
  Image as ImageIcon,
  Sparkles,
} from "lucide-react";
import {
  type Campaign,
  type Asset,
  META_PRIMARY_MAX,
  META_HEADLINE_MAX,
  META_DESC_MAX,
  META_CTA_LABEL,
} from "./types";

// ── Hook: assets da campanha Meta ──────────────────────────
function useCampaignAssets(campaignId: string | null) {
  return useQuery({
    queryKey: ["ads_campaign_assets", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads_campaign_assets" as any)
        .select("*")
        .eq("campaign_id", campaignId!)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Asset[];
    },
  });
}

function charBadge(value: string | undefined, max: number) {
  const len = (value ?? "").length;
  return (
    <span className="text-xs tabular-nums text-muted-foreground shrink-0">
      {len}/{max}
    </span>
  );
}

function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copiado!`),
    () => toast.error("Não foi possível copiar."),
  );
}

export default function MetaCampaignEditor({ campaign }: { campaign: Campaign }) {
  const { data: assets = [], isLoading } = useCampaignAssets(campaign.id);

  const adSets = assets
    .filter((a) => a.asset_type === "ad_set")
    .sort((a, b) => a.position - b.position);
  const adsBySet = (setId: string) =>
    assets
      .filter((a) => a.asset_type === "meta_ad" && a.parent_id === setId)
      .sort((a, b) => a.position - b.position);
  const briefs = assets
    .filter((a) => a.asset_type === "creative_brief")
    .sort((a, b) => a.position - b.position);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  function copyAllTexts() {
    const lines: string[] = [`CAMPANHA: ${campaign.name}`, ""];
    for (const set of adSets) {
      lines.push(`══ CONJUNTO: ${set.payload.name} ══`);
      for (const ad of adsBySet(set.id)) {
        const p = ad.payload;
        lines.push(
          `— ${p.angulo} —`,
          `Texto principal: ${p.primary_text}`,
          `Título: ${p.headline}`,
          ...(p.description ? [`Descrição: ${p.description}`] : []),
          `CTA: ${META_CTA_LABEL[p.cta] ?? p.cta}`,
          "",
        );
      }
    }
    copyText(lines.join("\n"), "Textos da campanha");
  }

  return (
    <div className="space-y-4">
      {/* ── Conjuntos de anúncio ── */}
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Users className="h-4 w-4 text-primary" />
          Conjuntos de anúncio
        </h4>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={copyAllTexts}>
          <Copy className="h-3.5 w-3.5" />
          Copiar todos os textos
        </Button>
      </div>

      <Accordion type="multiple" defaultValue={adSets.map((s) => s.id)} className="space-y-2">
        {adSets.map((set) => {
          const pub = set.payload.publico ?? {};
          const ads = adsBySet(set.id);
          return (
            <AccordionItem key={set.id} value={set.id} className="border rounded-lg px-3">
              <AccordionTrigger className="text-sm font-medium hover:no-underline py-3">
                {set.payload.name}
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-3">
                {/* Público */}
                <div className="rounded-lg bg-muted/40 border p-3 space-y-2 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Público
                  </p>
                  {pub.descricao && <p className="text-muted-foreground">{pub.descricao}</p>}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {pub.idade_min != null && pub.idade_max != null && (
                      <span>Idade {pub.idade_min}–{pub.idade_max}</span>
                    )}
                    {pub.raio_km != null && <span>Raio ~{pub.raio_km} km</span>}
                  </div>
                  {Array.isArray(pub.interesses) && pub.interesses.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {pub.interesses.map((i: string) => (
                        <Badge key={i} variant="secondary" className="text-xs font-normal">
                          {i}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3 variações de anúncio */}
                {ads.map((ad) => {
                  const p = ad.payload;
                  return (
                    <div key={ad.id} className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{p.angulo}</Badge>
                        <div className="flex items-center gap-2">
                          <Badge className="text-xs gap-1">
                            <MessageCircle className="h-3 w-3" />
                            {META_CTA_LABEL[p.cta] ?? p.cta}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() =>
                              copyText(
                                `${p.primary_text}\n\n${p.headline}${p.description ? `\n${p.description}` : ""}`,
                                "Anúncio",
                              )
                            }
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm whitespace-pre-wrap">{p.primary_text}</p>
                          {charBadge(p.primary_text, META_PRIMARY_MAX)}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-1 border-t">
                          <p className="text-sm font-semibold">{p.headline}</p>
                          {charBadge(p.headline, META_HEADLINE_MAX)}
                        </div>
                        {p.description && (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">{p.description}</p>
                            {charBadge(p.description, META_DESC_MAX)}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* ── Briefs de criativo ── */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          Criativos (briefs prontos para gerar)
        </h4>
        <p className="text-xs text-muted-foreground">
          Roteiros executáveis criados pela IA. O botão "Gerar este criativo" com as ferramentas da
          plataforma chega em breve — por enquanto, use-os como guia nas suas ferramentas.
        </p>
        {briefs.map((b) => (
          <BriefCard key={b.id} brief={b.payload} />
        ))}
      </div>
    </div>
  );
}

// ── Card de brief (vídeo / carrossel / imagem) ─────────────
function BriefCard({ brief }: { brief: Record<string, any> }) {
  if (brief.tipo === "video") {
    return (
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Clapperboard className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Vídeo 9:16 · {brief.duracao_s}s</span>
        </div>
        <div className="space-y-1.5">
          {(brief.cenas ?? []).map((cena: any, i: number) => (
            <div key={i} className="grid grid-cols-[3.5rem_1fr] gap-2 text-sm">
              <Badge variant="secondary" className="text-xs justify-center h-fit font-mono">
                {cena.tempo}
              </Badge>
              <div className="space-y-0.5">
                <p>{cena.visual}</p>
                {cena.texto_tela && (
                  <p className="text-xs font-semibold text-primary">"{cena.texto_tela}"</p>
                )}
                {cena.narracao && (
                  <p className="text-xs text-muted-foreground italic">🎙 {cena.narracao}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        {brief.cta_final && (
          <p className="text-xs text-muted-foreground border-t pt-2">
            <span className="font-semibold">CTA final:</span> {brief.cta_final}
          </p>
        )}
      </div>
    );
  }

  if (brief.tipo === "carrossel") {
    return (
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Carrossel · {(brief.cards ?? []).length} cards</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {(brief.cards ?? []).map((card: any, i: number) => (
            <div key={i} className="rounded-md bg-muted/40 border p-2.5 space-y-1">
              <p className="text-xs font-semibold">
                {i + 1}. {card.titulo}
              </p>
              <p className="text-xs text-muted-foreground">{card.texto}</p>
              <p className="text-[11px] text-muted-foreground/70 italic border-t pt-1">
                {card.visual_prompt}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (brief.tipo === "imagem") {
    return (
      <div className="rounded-lg border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Imagem estática 1:1</span>
        </div>
        <p className="text-sm text-muted-foreground italic">{brief.prompt_visual}</p>
        {brief.texto_overlay && (
          <p className="text-xs">
            <span className="font-semibold">Texto sobreposto:</span> "{brief.texto_overlay}"
          </p>
        )}
      </div>
    );
  }

  return null;
}
