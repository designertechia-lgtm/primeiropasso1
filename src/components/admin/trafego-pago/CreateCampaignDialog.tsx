import { useState } from "react";
import { Link } from "react-router-dom";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Sparkles, Loader2, Coins, AlertTriangle } from "lucide-react";
import { CAMPAIGN_COST, OBJECTIVE_LABEL } from "./types";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditBalance: number;
  onCreated: (campaignId: string) => void;
  platform?: "google_ads" | "meta_ads";
}

export default function CreateCampaignDialog({
  open,
  onOpenChange,
  creditBalance,
  onCreated,
  platform = "google_ads",
}: CreateCampaignDialogProps) {
  const isMeta = platform === "meta_ads";
  const [servico, setServico] = useState("");
  const [cidade, setCidade] = useState("");
  const [raioKm, setRaioKm] = useState("20");
  const [orcamentoMensal, setOrcamentoMensal] = useState("");
  const [objective, setObjective] = useState("leads");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [diferencial, setDiferencial] = useState("");
  const [publico, setPublico] = useState("");
  const [generating, setGenerating] = useState(false);

  const canAfford = creditBalance >= CAMPAIGN_COST;
  const mensal = Number(orcamentoMensal) || 0;
  const dailyBudget = mensal > 0 ? +(mensal / 30.4).toFixed(2) : 0;
  const periodInvalid = !!startDate && !!endDate && endDate < startDate;
  const canSubmit =
    canAfford && servico.trim() && cidade.trim() && mensal > 0 && !periodInvalid && !generating;

  async function handleGenerate() {
    if (!canSubmit) return;
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("ads-campaign-generator", {
        body: {
          brief: {
            servico: servico.trim(),
            cidade: cidade.trim(),
            raio_km: Number(raioKm) || 20,
            orcamento_mensal: mensal,
            diferencial: diferencial.trim() || undefined,
            publico: publico.trim() || undefined,
            objetivo: OBJECTIVE_LABEL[objective] ?? objective,
          },
          daily_budget_brl: dailyBudget,
          objective: isMeta ? "whatsapp" : objective,
          platform,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          created_by: "user",
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.mensagem ?? data.error);

      toast.success(`Campanha "${data.campaign_name}" criada!`, {
        description: `${data.creditos_debitados} créditos debitados. Revise e aprove.`,
      });
      resetForm();
      onCreated(data.campaign_id);
    } catch (e: any) {
      toast.error("Erro ao gerar campanha", { description: e?.message });
    } finally {
      setGenerating(false);
    }
  }

  function resetForm() {
    setServico(""); setCidade(""); setRaioKm("20"); setOrcamentoMensal("");
    setObjective("leads"); setStartDate(""); setEndDate("");
    setDiferencial(""); setPublico("");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!generating) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {isMeta ? "Criar campanha Meta Ads (Instagram/Facebook)" : "Criar campanha Google Ads"}
          </DialogTitle>
          <DialogDescription>
            {isMeta
              ? "A IA gera a campanha Click-to-WhatsApp completa: públicos, 3 variações de anúncio e briefs de criativo (vídeo, carrossel e imagem). Você revisa e aprova."
              : "A IA gera a campanha completa (anúncios, palavras-chave e extensões). Você revisa e aprova antes de publicar."}
          </DialogDescription>
        </DialogHeader>

        {/* Custo visível ANTES de gerar */}
        <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${
          canAfford
            ? "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300"
            : "bg-destructive/10 border-destructive/20 text-destructive"
        }`}>
          {canAfford ? (
            <>
              <Coins className="h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">{CAMPAIGN_COST} créditos</span> por geração — você tem {creditBalance}.
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                Saldo insuficiente ({creditBalance}/{CAMPAIGN_COST}).{" "}
                <Link to="/admin/assinatura" className="underline">Recarregar</Link>
              </span>
            </>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cc-servico">Serviço principal *</Label>
            <Input
              id="cc-servico"
              placeholder='Ex.: "terapia de casal", "psicoterapia infantil"'
              value={servico}
              onChange={(e) => setServico(e.target.value)}
              disabled={generating}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cc-cidade">Cidade *</Label>
              <Input
                id="cc-cidade"
                placeholder="Ex.: São Paulo"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                disabled={generating}
              />
            </div>
            <div className="space-y-1.5 w-24">
              <Label htmlFor="cc-raio">Raio (km)</Label>
              <Input
                id="cc-raio"
                type="number"
                min={1}
                max={100}
                value={raioKm}
                onChange={(e) => setRaioKm(e.target.value)}
                disabled={generating}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cc-orcamento">Orçamento mensal (R$) *</Label>
              <Input
                id="cc-orcamento"
                type="number"
                min={1}
                placeholder="Ex.: 600"
                value={orcamentoMensal}
                onChange={(e) => setOrcamentoMensal(e.target.value)}
                disabled={generating}
              />
              {dailyBudget > 0 && (
                <p className="text-xs text-muted-foreground">
                  ≈ R$ {dailyBudget.toFixed(2)}/dia
                  <span className="text-yellow-600 dark:text-yellow-400"> · Google pode gastar até 2× o diário</span>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Objetivo</Label>
              {isMeta ? (
                <p className="text-sm h-10 flex items-center px-3 rounded-md border bg-muted/30">
                  Click-to-WhatsApp
                </p>
              ) : (
                <Select value={objective} onValueChange={setObjective} disabled={generating}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(OBJECTIVE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cc-inicio">Início (opcional)</Label>
              <Input
                id="cc-inicio"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={generating}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cc-fim">Fim (opcional)</Label>
              <Input
                id="cc-fim"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={generating}
              />
            </div>
          </div>
          {periodInvalid && (
            <p className="text-xs text-destructive">A data de fim precisa ser igual ou depois do início.</p>
          )}
          {!startDate && !endDate && (
            <p className="text-xs text-muted-foreground">Sem datas, a campanha é contínua (roda até você pausar).</p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="cc-diferencial">Diferencial (opcional)</Label>
            <Textarea
              id="cc-diferencial"
              placeholder="Ex.: atendimento online e presencial, 15 anos de experiência…"
              value={diferencial}
              onChange={(e) => setDiferencial(e.target.value)}
              className="resize-none min-h-[3.5rem]"
              disabled={generating}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cc-publico">Público-alvo (opcional)</Label>
            <Input
              id="cc-publico"
              placeholder="Ex.: pais de crianças com TEA, casais em crise…"
              value={publico}
              onChange={(e) => setPublico(e.target.value)}
              disabled={generating}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>
            Cancelar
          </Button>
          <Button onClick={handleGenerate} disabled={!canSubmit} className="gap-2">
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Gerando (até 1 min)…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Gerar por {CAMPAIGN_COST} créditos
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
