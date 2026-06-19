import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Loader2, Save, ExternalLink } from "lucide-react";
import {
  usePlatformHeroContent,
  useUpdatePlatformLandingSection,
  HERO_DEFAULTS,
  type HeroContent,
} from "@/hooks/usePlatformLanding";

function HeroEditor() {
  const { data, isLoading } = usePlatformHeroContent();
  const update = useUpdatePlatformLandingSection();

  const [form, setForm] = useState<HeroContent>(HERO_DEFAULTS);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const set = (field: keyof HeroContent, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = () => {
    update.mutate(
      { section: "hero", data: form },
      {
        onSuccess: () => toast.success("Hero salvo com sucesso!"),
        onError: (e) => toast.error(`Erro ao salvar: ${(e as Error).message}`),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando conteúdo...
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Seção Hero</CardTitle>
        <CardDescription>
          Primeira dobra da landing em{" "}
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 inline-flex items-center gap-1"
          >
            primeiropasso.online <ExternalLink className="h-3 w-3" />
          </a>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <Label>Badge de credibilidade</Label>
          <Input
            value={form.badge_text}
            onChange={(e) => set("badge_text", e.target.value)}
            placeholder="Em conformidade com CFP e LGPD"
          />
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label>Título — parte 1</Label>
            <Input
              value={form.headline_before}
              onChange={(e) => set("headline_before", e.target.value)}
              placeholder="Seu consultório com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Título — destaque (azul)</Label>
            <Input
              value={form.headline_highlight}
              onChange={(e) => set("headline_highlight", e.target.value)}
              placeholder="presença digital e IA"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Título — parte 3</Label>
            <Input
              value={form.headline_after}
              onChange={(e) => set("headline_after", e.target.value)}
              placeholder="que atende sozinha."
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Subtítulo / descrição</Label>
          <Textarea
            value={form.subheadline}
            onChange={(e) => set("subheadline", e.target.value)}
            rows={3}
          />
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>CTA primário — label</Label>
            <Input
              value={form.cta_primary_label}
              onChange={(e) => set("cta_primary_label", e.target.value)}
              placeholder="Começar grátis"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CTA primário — destino (rota)</Label>
            <Input
              value={form.cta_primary_href}
              onChange={(e) => set("cta_primary_href", e.target.value)}
              placeholder="/cadastro"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>CTA secundário — label</Label>
            <Input
              value={form.cta_secondary_label}
              onChange={(e) => set("cta_secondary_label", e.target.value)}
              placeholder="Ver como funciona"
            />
          </div>
          <div className="space-y-1.5">
            <Label>CTA secundário — âncora</Label>
            <Input
              value={form.cta_secondary_anchor}
              onChange={(e) => set("cta_secondary_anchor", e.target.value)}
              placeholder="#como-funciona"
            />
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Trust badge 1 (IA)</Label>
            <Input
              value={form.trust_badge_1}
              onChange={(e) => set("trust_badge_1", e.target.value)}
              placeholder="Múltiplas IAs premium de vídeo"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Trust badge 2</Label>
            <Input
              value={form.trust_badge_2}
              onChange={(e) => set("trust_badge_2", e.target.value)}
              placeholder="Sem cartão de crédito"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Preview — citação do vídeo</Label>
          <Input
            value={form.preview_quote}
            onChange={(e) => set("preview_quote", e.target.value)}
            placeholder="Como reconhecer pensamentos automáticos em 30 segundos"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Preview — tags (separadas por vírgula)</Label>
          <Input
            value={form.preview_tags.join(", ")}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                preview_tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
              }))
            }
            placeholder="TCC, Ansiedade, 9:16"
          />
        </div>

        <div className="pt-2">
          <Button onClick={handleSave} disabled={update.isPending} className="gap-2">
            {update.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar Hero
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LandingOficialTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl text-foreground">Landing Oficial</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Edite o conteúdo da landing institucional. Alterações aparecem imediatamente em{" "}
          <strong>primeiropasso.online</strong> sem novo deploy.
        </p>
      </div>
      <HeroEditor />
    </div>
  );
}
