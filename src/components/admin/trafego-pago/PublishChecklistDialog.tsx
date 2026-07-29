import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Download,
  Globe,
  Loader2,
  Copy,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import type { Campaign, Asset } from "./types";
import { downloadGoogleAdsEditorCsv } from "./exportGoogleAdsCsv";

interface PublishChecklistDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: Campaign;
  assets: Asset[];
}

interface Step {
  id: string;
  title: string;
  body: React.ReactNode;
}

export default function PublishChecklistDialog({
  open,
  onOpenChange,
  campaign,
  assets,
}: PublishChecklistDialogProps) {
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const sitelinks = assets.filter((a) => a.asset_type === "sitelink");
  const callouts = assets.filter((a) => a.asset_type === "callout");

  const publishMutation = useMutation({
    mutationFn: async () => {
      // Só promove de draft/approved. Nunca rebaixa uma campanha já 'active'/'published'/'paused'
      // no Google (a autodeclaração do checklist não pode sobrescrever o estado real da API).
      const { data, error } = await supabase
        .from("ads_campaigns" as any)
        .update({ status: "published" })
        .eq("id", campaign.id)
        .in("status", ["draft", "approved"])
        .select("id");
      if (error) throw error;
      return (data ?? []).length as number;
    },
    onSuccess: (changed: number) => {
      qc.invalidateQueries({ queryKey: ["ads_campaigns"] });
      if (changed === 0) {
        toast.info("A campanha já constava como publicada/ativa — status mantido.");
        onOpenChange(false);
        return;
      }
      toast.success("Campanha marcada como publicada! 🎉", {
        description: "Lembre de ATIVAR a campanha no Google Ads quando quiser começar a veicular.",
      });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error("Erro ao atualizar status", { description: e.message }),
  });

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function copyExtensions() {
    const lines: string[] = [];
    if (sitelinks.length > 0) {
      lines.push("SITELINKS:");
      for (const sl of sitelinks) {
        lines.push(`- ${sl.payload.text}${sl.payload.description ? ` — ${sl.payload.description}` : ""} → ${sl.payload.url ?? campaign.landing_url ?? ""}`);
      }
    }
    if (callouts.length > 0) {
      if (lines.length) lines.push("");
      lines.push("FRASES DE DESTAQUE (callouts):");
      for (const co of callouts) lines.push(`- ${co.payload.text}`);
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Extensões copiadas!");
  }

  const steps: Step[] = [
    {
      id: "editor",
      title: "Instalar o Google Ads Editor (gratuito)",
      body: (
        <a
          href="https://ads.google.com/intl/pt-BR/home/tools/ads-editor/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-primary underline"
        >
          Baixar Google Ads Editor <ExternalLink className="h-3 w-3" />
        </a>
      ),
    },
    {
      id: "conta",
      title: "Ter conta Google Ads com cartão cadastrado",
      body: (
        <span>
          Crie em{" "}
          <a href="https://ads.google.com" target="_blank" rel="noreferrer" className="text-primary underline">
            ads.google.com
          </a>{" "}
          e adicione seu cartão (Faturamento). A conta é 100% sua — a plataforma nunca acessa nem
          cobra nada nela; o orçamento de mídia vai direto pro Google.
        </span>
      ),
    },
    {
      id: "csv",
      title: "Baixar o CSV e importar no Editor",
      body: (
        <div className="space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => downloadGoogleAdsEditorCsv(campaign, assets)}
          >
            <Download className="h-3.5 w-3.5" />
            Baixar CSV da campanha
          </Button>
          <p>
            No Editor: <span className="font-medium">Conta → Importar → Do arquivo</span> → selecione o
            CSV → revise o resumo → <span className="font-medium">Manter</span>.
          </p>
        </div>
      ),
    },
    ...(sitelinks.length + callouts.length > 0
      ? [{
          id: "extensoes",
          title: "Adicionar as extensões (sitelinks e frases de destaque)",
          body: (
            <div className="space-y-2">
              <p>
                Extensões importam melhor manualmente. Copie e cadastre no Editor em{" "}
                <span className="font-medium">Recursos → Sitelinks / Frases de destaque</span>:
              </p>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyExtensions}>
                <Copy className="h-3.5 w-3.5" />
                Copiar extensões ({sitelinks.length + callouts.length})
              </Button>
            </div>
          ),
        }]
      : []),
    {
      id: "segmentacao",
      title: "Definir localização e idioma (o CSV NÃO carrega isso)",
      body: (
        <span className="flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <span>
            Sem esse passo o Google veicula no <span className="font-medium">mundo inteiro</span>. Na
            campanha importada, em <span className="font-medium">Configurações</span>, defina a{" "}
            <span className="font-medium">Localização</span>
            {campaign.geo_targeting?.cidade
              ? <> ({campaign.geo_targeting.cidade}{campaign.geo_targeting?.raio_km ? `, raio ~${campaign.geo_targeting.raio_km} km` : ""})</>
              : " (sua cidade/raio de atendimento)"}{" "}
            com a opção <span className="font-medium">"Presença: pessoas no local"</span> e o idioma{" "}
            <span className="font-medium">Português</span>.
          </span>
        </span>
      ),
    },
    {
      id: "orcamento",
      title: `Conferir o orçamento (R$ ${Number(campaign.daily_budget_brl).toFixed(2)}/dia)`,
      body: (
        <span className="flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
          <span>
            A campanha importa <span className="font-medium">PAUSADA</span> de propósito. Confira o
            orçamento antes de ativar — e lembre que o Google pode gastar até 2× o diário num dia
            (compensa na média do mês).
          </span>
        </span>
      ),
    },
    {
      id: "publicar",
      title: "Publicar no Editor e ativar",
      body: (
        <span>
          Clique em <span className="font-medium">Publicar</span> no Editor (envia pro Google — a
          aprovação leva 1-3 dias úteis). Quando quiser começar a veicular, mude a campanha de
          Pausada pra <span className="font-medium">Ativada</span> no próprio Google Ads.
        </span>
      ),
    },
  ];

  const allChecked = steps.every((s) => checked.has(s.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Publicar no Google Ads
          </DialogTitle>
          <DialogDescription>
            Siga o passo a passo e marque cada etapa. Qualquer dúvida, pergunte ao Axel: <em>"como publicar minha campanha"</em>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={step.id} className="flex gap-3 rounded-lg border p-3">
              <Checkbox
                id={`step-${step.id}`}
                checked={checked.has(step.id)}
                onCheckedChange={() => toggle(step.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <label htmlFor={`step-${step.id}`} className="text-sm font-medium cursor-pointer">
                  {i + 1}. {step.title}
                </label>
                <div className="text-xs text-muted-foreground">{step.body}</div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Continuar depois
          </Button>
          <Button
            onClick={() => publishMutation.mutate()}
            disabled={!allChecked || publishMutation.isPending}
            className="gap-1.5"
            title={allChecked ? undefined : "Marque todas as etapas pra concluir"}
          >
            {publishMutation.isPending
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Globe className="h-4 w-4" />}
            Marcar como publicada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
