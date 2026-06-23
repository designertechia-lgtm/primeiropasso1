import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
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
import { toWhatsAppNumber } from "@/lib/utils";
import { RoteiroAtendimentoEditor, novaEtapa, roteiroFromLanding, type RoteiroEtapa } from "@/components/admin/RoteiroAtendimentoEditor";

export default function AdminConfiguracoes() {
  const { data: professional, isLoading } = useProfessional();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);

  // Detecção de alterações não salvas POR CONTEÚDO (ver AdminPerfil): isDirty é
  // derivado da comparação com um retrato dos dados carregados, então não dá
  // falso positivo em refetch do react-query nem depende de ordem de efeitos.
  const baselineRef = useRef<string | null>(null);
  const buildSnapshot = (v: {
    agentEnabled: boolean; agentReminders: boolean; agentSatisfaction: boolean;
    agentTone: string; agentPhrases: string; agentRoteiro: RoteiroEtapa[];
    ownerWhatsapp: string;
  }) =>
    JSON.stringify([
      v.agentEnabled, v.agentReminders, v.agentSatisfaction,
      v.agentTone, v.agentPhrases,
      v.agentRoteiro.map((e) => [e.titulo, e.conteudo]),
      v.ownerWhatsapp,
    ]);

  // Preferências do agente (whatsapp-agent) — professionals.agent_preferences (jsonb)
  const TONE_PRESETS = ["Acolhedor", "Direto", "Formal", "Descontraído"];
  const [agentEnabled, setAgentEnabled] = useState(true);
  const [agentReminders, setAgentReminders] = useState(true);
  const [agentSatisfaction, setAgentSatisfaction] = useState(true);
  const [agentTone, setAgentTone] = useState("");
  const [agentPhrases, setAgentPhrases] = useState("");
  const [ownerWhatsapp, setOwnerWhatsapp] = useState(""); // número do dono: canal Axel Web + alertas
  const [agentRoteiro, setAgentRoteiro] = useState<RoteiroEtapa[]>([]);
  const [roteiroSugerido, setRoteiroSugerido] = useState(false); // rascunho vindo da landing, ainda não salvo

  useEffect(() => {
    if (!professional) return;
    const ap = ((professional as any).agent_preferences || {}) as Record<string, any>;
    const agentEnabledV = ap.enabled !== false;            // default ligado
    const agentRemindersV = ap.reminders !== false;        // default ligado
    const agentSatisfactionV = ap.satisfaction !== false;  // default ligado
    const agentToneV = ap.tone || "";
    const agentPhrasesV = ap.preferred_phrases || "";
    const ownerWhatsappV = ap.owner_whatsapp || "";
    const roteiro = Array.isArray(ap.roteiro) ? ap.roteiro : [];
    const carregado = roteiro
      .map((e: any) => novaEtapa((e?.titulo || "").toString(), (e?.conteudo || "").toString()))
      .filter((e: RoteiroEtapa) => e.titulo || e.conteudo);
    let agentRoteiroV: RoteiroEtapa[];
    let roteiroSugeridoV: boolean;
    if (carregado.length > 0) {
      agentRoteiroV = carregado;
      roteiroSugeridoV = false;
    } else {
      // Roteiro ainda vazio → pré-preenche um rascunho com o que já está na landing.
      agentRoteiroV = roteiroFromLanding(professional);
      roteiroSugeridoV = agentRoteiroV.length > 0;
    }

    setAgentEnabled(agentEnabledV);
    setAgentReminders(agentRemindersV);
    setAgentSatisfaction(agentSatisfactionV);
    setAgentTone(agentToneV);
    setAgentPhrases(agentPhrasesV);
    setOwnerWhatsapp(ownerWhatsappV);
    setAgentRoteiro(agentRoteiroV);
    setRoteiroSugerido(roteiroSugeridoV);

    // Retrato dos dados carregados (inclui o rascunho da landing, que por si só
    // não conta como edição do usuário).
    baselineRef.current = buildSnapshot({
      agentEnabled: agentEnabledV, agentReminders: agentRemindersV,
      agentSatisfaction: agentSatisfactionV, agentTone: agentToneV,
      agentPhrases: agentPhrasesV, agentRoteiro: agentRoteiroV,
      ownerWhatsapp: ownerWhatsappV,
    });
  }, [professional]);

  const snapshot = buildSnapshot({
    agentEnabled, agentReminders, agentSatisfaction, agentTone, agentPhrases, agentRoteiro, ownerWhatsapp,
  });
  const isDirty = baselineRef.current !== null && snapshot !== baselineRef.current;

  const handleSave = async (): Promise<boolean> => {
    if (!professional) return false;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      agent_preferences: {
        enabled: agentEnabled,
        reminders: agentReminders,
        satisfaction: agentSatisfaction,
        tone: agentTone.trim(),
        preferred_phrases: agentPhrases.trim(),
        owner_whatsapp: toWhatsAppNumber(ownerWhatsapp),
        roteiro: agentRoteiro
          .map((e) => ({ titulo: e.titulo.trim(), conteudo: e.conteudo.trim() }))
          .filter((e) => e.titulo || e.conteudo),
      },
    } as any).eq("id", professional.id);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
      return false;
    }
    toast.success("Configurações salvas!");
    baselineRef.current = snapshot; // o que está na tela agora é o novo "salvo"
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    return true;
  };

  // Liga o aviso de "alterações não salvas" ao guarda global de navegação.
  useUnsavedChanges(isDirty, handleSave);

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

          {/* Número autorizado do dono: canal Axel Web (Pai) + alertas */}
          <div className="space-y-2 p-3 rounded-lg border">
            <Label className="text-sm font-medium">Seu número de WhatsApp (autorizado)</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              É o <strong>único</strong> número que conversa com o Axel Web da sua conta e que recebe os alertas (lead em risco/crise, contato pessoal, ou pedido de falar com você). Use seu WhatsApp pessoal — diferente do número que atende seus clientes.
            </p>
            <Input
              value={ownerWhatsapp}
              onChange={(e) => setOwnerWhatsapp(e.target.value)}
              placeholder="Ex.: (49) 99999-9999"
              inputMode="tel"
              className="text-sm"
            />
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
