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
  Loader2,
  Copy,
  ExternalLink,
  AlertTriangle,
  Facebook,
  Users,
} from "lucide-react";
import type { Campaign, Asset } from "./types";
import { META_CTA_LABEL } from "./types";

interface MetaPublishChecklistDialogProps {
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

export default function MetaPublishChecklistDialog({
  open,
  onOpenChange,
  campaign,
  assets,
}: MetaPublishChecklistDialogProps) {
  const qc = useQueryClient();
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const adSets = assets
    .filter((a) => a.asset_type === "ad_set")
    .sort((a, b) => a.position - b.position);
  const adsBySet = (setId: string) =>
    assets
      .filter((a) => a.asset_type === "meta_ad" && a.parent_id === setId)
      .sort((a, b) => a.position - b.position);
  const hasCreatives = assets.some((a) => a.asset_type === "creative_output");

  const publishMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("ads_campaigns" as any)
        .update({ status: "published" })
        .eq("id", campaign.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ads_campaigns"] });
      toast.success("Campanha marcada como publicada! 🎉", {
        description: "Lembre de LIGAR a campanha no Gerenciador quando quiser começar a veicular.",
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

  function copyPublicos() {
    const lines: string[] = [];
    for (const set of adSets) {
      const pub = set.payload.publico ?? {};
      lines.push(`CONJUNTO: ${set.payload.name}`);
      if (pub.descricao) lines.push(`Quem é: ${pub.descricao}`);
      if (pub.idade_min != null) lines.push(`Idade: ${pub.idade_min} a ${pub.idade_max}`);
      if (pub.raio_km != null) lines.push(`Localização: raio de ~${pub.raio_km} km`);
      if (Array.isArray(pub.interesses) && pub.interesses.length) {
        lines.push(`Interesses: ${pub.interesses.join(", ")}`);
      }
      lines.push("");
    }
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Públicos copiados!");
  }

  function copyTextos() {
    const lines: string[] = [];
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
    navigator.clipboard.writeText(lines.join("\n"));
    toast.success("Textos copiados!");
  }

  const steps: Step[] = [
    {
      id: "conta",
      title: "Ter conta no Gerenciador de Anúncios com pagamento",
      body: (
        <span>
          Acesse o{" "}
          <a
            href="https://business.facebook.com/adsmanager"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary underline"
          >
            Gerenciador de Anúncios <ExternalLink className="h-3 w-3" />
          </a>{" "}
          com seu Facebook e cadastre o cartão em{" "}
          <span className="font-medium">Configurações de pagamento</span>. A conta é 100% sua —
          a plataforma nunca acessa nem cobra nada nela.
        </span>
      ),
    },
    {
      id: "whatsapp",
      title: "Conectar seu WhatsApp à sua Página do Facebook",
      body: (
        <span>
          Pré-requisito do Click-to-WhatsApp: na sua{" "}
          <span className="font-medium">Página → Configurações → WhatsApp</span>, vincule o número
          que recebe seus pacientes (o mesmo do agente IA, se usar).
        </span>
      ),
    },
    {
      id: "campanha",
      title: "Criar a campanha de mensagens",
      body: (
        <span>
          No Gerenciador: <span className="font-medium">+ Criar</span> → objetivo{" "}
          <span className="font-medium">Interações</span> → local de conversão{" "}
          <span className="font-medium">Apps de mensagens → WhatsApp</span>. Nomeie como{" "}
          <span className="font-medium">"{campaign.name}"</span> pra achar fácil depois.
        </span>
      ),
    },
    {
      id: "conjunto",
      title: `Configurar público e orçamento (R$ ${Number(campaign.daily_budget_brl).toFixed(2)}/dia)`,
      body: (
        <div className="space-y-2">
          <p>
            Copie o público de cada conjunto (localização + idade + interesses) e use{" "}
            <span className="font-medium">posicionamentos Advantage+</span>:
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyPublicos}>
            <Users className="h-3.5 w-3.5" />
            Copiar públicos ({adSets.length} conjunto{adSets.length !== 1 ? "s" : ""})
          </Button>
          <p className="flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
            <span>O Meta também pode gastar até ~2× o diário num dia (compensa na média da semana).</span>
          </p>
        </div>
      ),
    },
    {
      id: "textos",
      title: "Colar os textos dos anúncios (3 variações por conjunto)",
      body: (
        <div className="space-y-2">
          <p>
            Cole texto principal, título e descrição de cada variação, e selecione o botão
            de chamada correspondente:
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={copyTextos}>
            <Copy className="h-3.5 w-3.5" />
            Copiar todos os textos
          </Button>
        </div>
      ),
    },
    {
      id: "criativos",
      title: "Subir os criativos (imagens/vídeo)",
      body: (
        <span>
          {hasCreatives
            ? "Baixe as imagens na galeria de cada brief (abra em nova aba → salvar) e suba no anúncio. Vídeo gerado no estúdio fica em Vídeos."
            : "Gere os criativos na campanha (botão \"Gerar este criativo\" em cada brief) ou use imagens suas. Vídeo 9:16, carrossel 1:1, imagem 1:1."}
        </span>
      ),
    },
    {
      id: "publicar",
      title: "Revisar e publicar",
      body: (
        <span>
          Revise tudo e clique em <span className="font-medium">Publicar</span>. Dica: deixe a
          campanha <span className="font-medium">desligada</span> (botão no topo) até decidir
          começar — a análise do Meta leva ~24h e roda mesmo desligada.
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
            <Facebook className="h-5 w-5 text-primary" />
            Publicar no Meta Ads
          </DialogTitle>
          <DialogDescription>
            Siga o passo a passo e marque cada etapa. Qualquer dúvida, pergunte ao Axel:{" "}
            <em>"como publicar minha campanha Meta"</em>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {steps.map((step, i) => (
            <div key={step.id} className="flex gap-3 rounded-lg border p-3">
              <Checkbox
                id={`mstep-${step.id}`}
                checked={checked.has(step.id)}
                onCheckedChange={() => toggle(step.id)}
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0 space-y-1">
                <label htmlFor={`mstep-${step.id}`} className="text-sm font-medium cursor-pointer">
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
              : <Facebook className="h-4 w-4" />}
            Marcar como publicada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
