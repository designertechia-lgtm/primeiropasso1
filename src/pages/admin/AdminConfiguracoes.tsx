import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { FieldHint } from "@/components/ui/FieldHint";
import { RoteiroAtendimentoEditor, novaEtapa, roteiroFromLanding, type RoteiroEtapa } from "@/components/admin/RoteiroAtendimentoEditor";

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

  const [saving, setSaving] = useState(false);

  // Preferências do agente (whatsapp-agent) — professionals.agent_preferences (jsonb)
  const TONE_PRESETS = ["Acolhedor", "Direto", "Formal", "Descontraído"];
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [agentReminders, setAgentReminders] = useState(true);
  const [agentSatisfaction, setAgentSatisfaction] = useState(true);
  const [agentTone, setAgentTone] = useState("");
  const [agentPhrases, setAgentPhrases] = useState("");
  const [agentRoteiro, setAgentRoteiro] = useState<RoteiroEtapa[]>([]);
  const [roteiroSugerido, setRoteiroSugerido] = useState(false); // rascunho vindo da landing, ainda não salvo

  // Status colors
  const [colorStatusPending, setColorStatusPending] = useState("#EAB308");
  const [colorStatusConfirmed, setColorStatusConfirmed] = useState("#22C55E");
  const [colorStatusCompleted, setColorStatusCompleted] = useState("#3B82F6");
  const [colorStatusCancelled, setColorStatusCancelled] = useState("#EF4444");
  const [colorPaymentPending, setColorPaymentPending] = useState("#F97316");
  const [colorPaymentPaid, setColorPaymentPaid] = useState("#10B981");

  useEffect(() => {
    if (professional) {
      setColorStatusPending((professional as any).color_status_pending || "#EAB308");
      setColorStatusConfirmed((professional as any).color_status_confirmed || "#22C55E");
      setColorStatusCompleted((professional as any).color_status_completed || "#3B82F6");
      setColorStatusCancelled((professional as any).color_status_cancelled || "#EF4444");
      setColorPaymentPending((professional as any).color_payment_pending || "#F97316");
      setColorPaymentPaid((professional as any).color_payment_paid || "#10B981");

      const ap = ((professional as any).agent_preferences || {}) as Record<string, any>;
      setAgentEnabled(ap.enabled !== false);            // default ligado
      setAgentReminders(ap.reminders !== false);        // default ligado
      setAgentSatisfaction(ap.satisfaction !== false);  // default ligado
      setAgentTone(ap.tone || "");
      setAgentPhrases(ap.preferred_phrases || "");
      const roteiro = Array.isArray(ap.roteiro) ? ap.roteiro : [];
      const carregado = roteiro
        .map((e: any) => novaEtapa((e?.titulo || "").toString(), (e?.conteudo || "").toString()))
        .filter((e: RoteiroEtapa) => e.titulo || e.conteudo);
      if (carregado.length > 0) {
        setAgentRoteiro(carregado);
        setRoteiroSugerido(false);
      } else {
        // Roteiro ainda vazio → pré-preenche um rascunho com o que já está na landing.
        const seed = roteiroFromLanding(professional);
        setAgentRoteiro(seed);
        setRoteiroSugerido(seed.length > 0);
      }
    }
  }, [professional]);

  const handleSave = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      color_status_pending: colorStatusPending,
      color_status_confirmed: colorStatusConfirmed,
      color_status_completed: colorStatusCompleted,
      color_status_cancelled: colorStatusCancelled,
      color_payment_pending: colorPaymentPending,
      color_payment_paid: colorPaymentPaid,
      agent_preferences: {
        enabled: agentEnabled,
        reminders: agentReminders,
        satisfaction: agentSatisfaction,
        tone: agentTone.trim(),
        preferred_phrases: agentPhrases.trim(),
        roteiro: agentRoteiro
          .map((e) => ({ titulo: e.titulo.trim(), conteudo: e.conteudo.trim() }))
          .filter((e) => e.titulo || e.conteudo),
      },
    } as any).eq("id", professional.id);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Configurações salvas!");
      queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    }
  };

  const regenerarRoteiroDaLanding = () => {
    if (
      agentRoteiro.length > 0 &&
      !window.confirm("Isso substitui as etapas atuais por um rascunho gerado da sua landing. Continuar?")
    )
      return;
    setAgentRoteiro(roteiroFromLanding(professional));
    setRoteiroSugerido(true);
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Configurações</h1>


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

      <Card>
        <CardHeader>
          <CardTitle>Agente de Atendimento (WhatsApp)</CardTitle>
          <p className="text-sm text-muted-foreground">Como o agente que conversa com seus clientes no WhatsApp deve se comportar.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Master switch */}
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg border">
            <div>
              <Label className="text-sm font-medium">Agente ligado</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Desligado, o agente não responde mensagens, nem envia lembretes ou pesquisa de satisfação.</p>
            </div>
            <Switch checked={agentEnabled} onCheckedChange={setAgentEnabled} />
          </div>

          {/* Sub-toggles (dependem do master) */}
          <div className={`space-y-3 ${agentEnabled ? "" : "opacity-50 pointer-events-none"}`}>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm">Lembretes de consulta</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Avisa o cliente 24h e 1h antes do atendimento.</p>
              </div>
              <Switch checked={agentReminders} onCheckedChange={setAgentReminders} disabled={!agentEnabled} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-sm">Pesquisa de satisfação (pós-atendimento)</Label>
                <p className="text-xs text-muted-foreground mt-0.5">30 min após o atendimento, pergunta como foi e atualiza o status do cliente.</p>
              </div>
              <Switch checked={agentSatisfaction} onCheckedChange={setAgentSatisfaction} disabled={!agentEnabled} />
            </div>
          </div>

          {/* Tom de voz: presets + livre */}
          <div className={`space-y-2 ${agentEnabled ? "" : "opacity-50 pointer-events-none"}`}>
            <Label className="text-sm">Tom de voz</Label>
            <div className="flex flex-wrap gap-2">
              {TONE_PRESETS.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant={agentTone === t ? "default" : "outline"}
                  onClick={() => setAgentTone(t)}
                  disabled={!agentEnabled}
                >
                  {t}
                </Button>
              ))}
            </div>
            <Input
              value={agentTone}
              onChange={(e) => setAgentTone(e.target.value)}
              placeholder="Ou descreva com suas palavras (ex.: acolhedor mas objetivo, sem formalidade)"
              disabled={!agentEnabled}
              className="text-sm"
            />
          </div>

          {/* Frases preferidas */}
          <div className={`space-y-2 ${agentEnabled ? "" : "opacity-50 pointer-events-none"}`}>
            <Label className="text-sm">
              Frases que você gosta
              <FieldHint text="Só expressões e jeitos de falar que combinam com você — não é um passo a passo. Para definir a sequência e o conteúdo do atendimento, use o Roteiro de Atendimento abaixo." />
            </Label>
            <Textarea
              value={agentPhrases}
              onChange={(e) => setAgentPhrases(e.target.value)}
              placeholder="Expressões/saudações que combinam com você, uma por linha. Ex.: Conta comigo! / Fico à disposição, tá?"
              disabled={!agentEnabled}
              className="min-h-[80px] text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Só expressões soltas (estilo). <strong>Não escreva um passo a passo aqui</strong> — a sequência do atendimento fica no Roteiro abaixo.
            </p>
          </div>

          {/* Roteiro de Atendimento (referência do Axel) */}
          <div className={`space-y-3 border-t pt-4 ${agentEnabled ? "" : "opacity-50 pointer-events-none"}`}>
            <div>
              <Label className="text-sm">
                Roteiro de Atendimento (referência)
                <FieldHint text="A sequência e o conteúdo que o Axel usa pra te conhecer e conduzir a conversa: quem você é, seu método, como funcionam as sessões, valores. O Axel usa como guia e se adapta ao cliente — nunca despeja tudo de uma vez." />
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Monte as etapas do atendimento na ordem ideal — arraste pela alça para reordenar. O Axel segue como referência, mas se adapta ao que o cliente pedir (nunca recita em bloco nem trava).
              </p>
            </div>

            {roteiroSugerido && (
              <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-foreground">
                ✨ Geramos um <strong>rascunho a partir da sua landing</strong>. Revise, ajuste e clique em <strong>Salvar Configurações</strong> para valer.
              </div>
            )}

            <RoteiroAtendimentoEditor value={agentRoteiro} onChange={setAgentRoteiro} disabled={!agentEnabled} />

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={regenerarRoteiroDaLanding}
              disabled={!agentEnabled}
              className="text-xs text-muted-foreground"
            >
              Sugerir etapas a partir da minha landing
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>
    </div>
  );
}
