import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FieldHint } from "@/components/ui/FieldHint";
import { toast } from "sonner";
import { FlaskConical, RefreshCw } from "lucide-react";

// Aba "Teste A/B" (grupo Ajustes). Autossuficiente: define a variante B de título/subtítulo/CTA
// e mostra os resultados (views, leads e taxa por variante) lidos de landing_visits.
export default function AbTestEditorTab() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const p = professional as any;

  const [enabled, setEnabled] = useState(false);
  const [titleB, setTitleB] = useState("");
  const [subtitleB, setSubtitleB] = useState("");
  const [ctaB, setCtaB] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!professional) return;
    setEnabled(!!p.ab_enabled);
    setTitleB(p.hero_title_b || "");
    setSubtitleB(p.hero_subtitle_b || "");
    setCtaB(p.contact_cta_message_b || "");
  }, [professional]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      ab_enabled: enabled,
      hero_title_b: titleB.trim() || null,
      hero_subtitle_b: subtitleB.trim() || null,
      contact_cta_message_b: ctaB.trim() || null,
    } as any).eq("id", professional.id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Teste A/B salvo!"); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  // Resultados (contagens leves via count/head).
  const { data: stats, isFetching, refetch } = useQuery({
    queryKey: ["ab-stats", professional?.id],
    queryFn: async () => {
      const base = () => (supabase as any).from("landing_visits").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id);
      const [av, al, bv, bl] = await Promise.all([
        base().eq("variant", "a").eq("kind", "view"),
        base().eq("variant", "a").eq("kind", "lead"),
        base().eq("variant", "b").eq("kind", "view"),
        base().eq("variant", "b").eq("kind", "lead"),
      ]);
      return { aViews: av.count || 0, aLeads: al.count || 0, bViews: bv.count || 0, bLeads: bl.count || 0 };
    },
    enabled: !!professional?.id,
  });

  const rate = (leads: number, views: number) => (views > 0 ? (leads / views) * 100 : 0);
  const aRate = stats ? rate(stats.aLeads, stats.aViews) : 0;
  const bRate = stats ? rate(stats.bLeads, stats.bViews) : 0;
  const totalViews = stats ? stats.aViews + stats.bViews : 0;
  const leader = !stats ? null : bRate > aRate ? "B" : aRate > bRate ? "A" : null;

  const hasB = titleB.trim() || subtitleB.trim() || ctaB.trim();

  return (
    <div className="space-y-6">
      <div className="flex gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
        <FlaskConical className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Teste A/B de título e CTA</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Crie uma <strong>versão B</strong> do título/subtítulo do topo e da mensagem do botão. Cada visitante
            vê A ou B (sorteado e fixo), e a página mede qual converte mais. <strong>Só vale a pena com bom
            volume de acessos</strong> — com pouco tráfego, a diferença não é confiável.
          </p>
        </div>
      </div>

      {/* Liga/desliga */}
      <div className="flex items-center justify-between gap-3 rounded-xl border p-4">
        <div>
          <Label className="text-sm font-semibold">Ativar teste A/B</Label>
          <p className="text-xs text-muted-foreground">Quando ativo (e com a versão B preenchida), metade dos visitantes vê a B.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Versão B dos campos, com a versão A como referência */}
      <div className="space-y-4 rounded-xl border p-4">
        <p className="text-sm font-semibold">Versão B</p>

        <div className="space-y-1.5">
          <Label htmlFor="ab-title">Título do topo — versão B <FieldHint text="A versão A é o título atual do Hero. Deixe em branco para não testar o título." /></Label>
          <Input id="ab-title" value={titleB} onChange={(e) => setTitleB(e.target.value)} placeholder="Um título alternativo pra testar" />
          {p?.hero_title && <p className="text-[11px] text-muted-foreground">A (atual): {p.hero_title}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ab-sub">Subtítulo do topo — versão B</Label>
          <Textarea id="ab-sub" rows={2} value={subtitleB} onChange={(e) => setSubtitleB(e.target.value)} placeholder="Um subtítulo alternativo" />
          {p?.hero_subtitle && <p className="text-[11px] text-muted-foreground">A (atual): {p.hero_subtitle}</p>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ab-cta">Mensagem do botão (WhatsApp) — versão B</Label>
          <Textarea id="ab-cta" rows={2} value={ctaB} onChange={(e) => setCtaB(e.target.value)} placeholder="Uma chamada alternativa pro botão" />
          {p?.contact_cta_message && <p className="text-[11px] text-muted-foreground">A (atual): {p.contact_cta_message}</p>}
        </div>

        {enabled && !hasB && (
          <p className="text-xs text-amber-600">Preencha pelo menos um campo da versão B para o teste rodar.</p>
        )}

        <Button onClick={save} disabled={saving} className="w-full">
          {saving ? "Salvando..." : "Salvar Teste A/B"}
        </Button>
      </div>

      {/* Resultados */}
      <div className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Resultados</p>
          <button type="button" onClick={() => refetch()} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>

        {totalViews === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados ainda. Os números aparecem conforme os visitantes acessam a página com o teste ativo.</p>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div className="text-xs font-semibold text-muted-foreground">Versão</div>
              <div className="text-xs font-semibold text-muted-foreground text-right">Visitas</div>
              <div className="text-xs font-semibold text-muted-foreground text-right">Leads</div>
              <div className="text-xs font-semibold text-muted-foreground text-right">Taxa</div>

              <div className={`font-semibold ${leader === "A" ? "text-primary" : "text-foreground"}`}>A {leader === "A" && "★"}</div>
              <div className="text-right tabular-nums">{stats?.aViews}</div>
              <div className="text-right tabular-nums">{stats?.aLeads}</div>
              <div className="text-right tabular-nums">{aRate.toFixed(1)}%</div>

              <div className={`font-semibold ${leader === "B" ? "text-primary" : "text-foreground"}`}>B {leader === "B" && "★"}</div>
              <div className="text-right tabular-nums">{stats?.bViews}</div>
              <div className="text-right tabular-nums">{stats?.bLeads}</div>
              <div className="text-right tabular-nums">{bRate.toFixed(1)}%</div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              "Visita" = 1 acesso por sessão; "Lead" = clique no botão de WhatsApp. Só confie no vencedor com
              dezenas de leads em cada versão — abaixo disso, pode ser sorte.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
