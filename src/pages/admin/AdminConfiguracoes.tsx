import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { FieldHint } from "@/components/ui/FieldHint";
import { Mic, Square, Loader2, CheckCircle2, Upload } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://lpqkkbtadnqkbathdvzb.supabase.co";

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

  // Status colors
  const [colorStatusPending, setColorStatusPending] = useState("#EAB308");
  const [colorStatusConfirmed, setColorStatusConfirmed] = useState("#22C55E");
  const [colorStatusCompleted, setColorStatusCompleted] = useState("#3B82F6");
  const [colorStatusCancelled, setColorStatusCancelled] = useState("#EF4444");
  const [colorPaymentPending, setColorPaymentPending] = useState("#F97316");
  const [colorPaymentPaid, setColorPaymentPaid] = useState("#10B981");

  // Voz do agente (G4)
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [cloning, setCloning] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (professional) {
      setColorStatusPending((professional as any).color_status_pending || "#EAB308");
      setColorStatusConfirmed((professional as any).color_status_confirmed || "#22C55E");
      setColorStatusCompleted((professional as any).color_status_completed || "#3B82F6");
      setColorStatusCancelled((professional as any).color_status_cancelled || "#EF4444");
      setColorPaymentPending((professional as any).color_payment_pending || "#F97316");
      setColorPaymentPaid((professional as any).color_payment_paid || "#10B981");
      setVoiceEnabled(!!(professional as any).agent_voice_enabled);
      setVoiceId((professional as any).agent_voice_id || null);
    }
  }, [professional]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        setVoiceBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleClone = async () => {
    if (!professional || !voiceBlob) return;
    setCloning(true);
    try {
      const form = new FormData();
      form.append("audio", voiceBlob, "voz.webm");
      form.append("nome", `agente-${professional.slug || professional.id}`);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-proxy?action=clone`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao clonar voz");

      await supabase.from("professionals").update({ agent_voice_id: data.voice_id } as any).eq("id", professional.id);
      setVoiceId(data.voice_id);
      setVoiceBlob(null);
      queryClient.invalidateQueries({ queryKey: ["my-professional"] });
      toast.success("Voz clonada! Ative o toggle para o agente responder em áudio.");
    } catch (e: any) {
      toast.error("Erro ao clonar voz", { description: e.message });
    } finally {
      setCloning(false);
    }
  };

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
      agent_voice_enabled: voiceEnabled,
    } as any).eq("id", professional.id);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Configurações salvas!");
      queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Configurações</h1>


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

      {/* Voz do Agente (G4) — clonar voz e responder leads em áudio */}
      <Card>
        <CardHeader>
          <CardTitle>Voz do Agente no WhatsApp</CardTitle>
          <p className="text-sm text-muted-foreground">
            Clone sua voz para que o agente responda os leads em áudio, com a sua voz.
            Grave de 30s a 1min falando naturalmente (ou envie um áudio limpo).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status da voz clonada */}
          {voiceId ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Voz clonada e pronta. Regrave abaixo se quiser substituir.
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma voz clonada ainda.</p>
          )}

          {/* Gravação / upload */}
          <div className="flex flex-wrap items-center gap-2">
            {!recording ? (
              <Button type="button" variant="outline" size="sm" onClick={startRecording}>
                <Mic className="h-4 w-4 mr-2" /> Gravar voz
              </Button>
            ) : (
              <Button type="button" variant="destructive" size="sm" onClick={stopRecording}>
                <Square className="h-4 w-4 mr-2" /> Parar gravação
              </Button>
            )}

            <label className="inline-flex">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setVoiceBlob(f); e.target.value = ""; }}
              />
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-sm cursor-pointer hover:bg-muted">
                <Upload className="h-4 w-4" /> Enviar áudio
              </span>
            </label>

            {voiceBlob && (
              <Button type="button" size="sm" onClick={handleClone} disabled={cloning}>
                {cloning ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Clonando...</> : "Clonar esta voz"}
              </Button>
            )}
          </div>

          {voiceBlob && (
            <audio controls src={URL.createObjectURL(voiceBlob)} className="w-full max-w-sm" />
          )}

          {/* Toggle responder em áudio */}
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <Label className="text-sm font-medium">Responder leads em áudio</Label>
              <p className="text-xs text-muted-foreground">
                Quando ligado, o agente responde com sua voz clonada (cai pra texto se o áudio falhar).
              </p>
            </div>
            <Switch
              checked={voiceEnabled}
              onCheckedChange={setVoiceEnabled}
              disabled={!voiceId}
            />
          </div>
          {!voiceId && voiceEnabled === false && (
            <p className="text-xs text-muted-foreground">Clone uma voz primeiro para poder ativar.</p>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>
    </div>
  );
}
