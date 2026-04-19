import { useState } from "react";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Film, Loader2, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, Mic, Monitor, Smartphone, Lightbulb,
} from "lucide-react";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

const OBJETIVO_EXEMPLOS = [
  "Atrair terapeutas sem presença digital que querem lotar a agenda",
  "Mostrar como o WhatsApp automático agenda pacientes enquanto você dorme",
  "Apresentar minha plataforma para psicólogos que perdem pacientes por demora no retorno",
];

const VOICES = [
  { id: "pt-BR-FranciscaNeural", label: "Francisca", gender: "Feminina" },
  { id: "pt-BR-ThalitaNeural",   label: "Thalita",   gender: "Feminina, jovem" },
  { id: "pt-BR-AntonioNeural",   label: "Antônio",   gender: "Masculina" },
];

type Legenda   = { tempo: number; texto: string };
type Script    = { titulo: string; narracao: string; cta: string; legendas: Legenda[] };
type JobStatus = {
  status: "idle" | "loading" | "editing" | "processing" | "done" | "error";
  progress?: number;
  step?: string;
  video_url?: string;
  titulo?: string;
  message?: string;
};

export default function AdminCriarVideo() {
  const { data: professional } = useProfessional();
  const [step, setStep]           = useState<1 | 2 | 3>(1);
  const [objetivo, setObjetivo]   = useState("");
  const [script, setScript]       = useState<Script | null>(null);
  const [voice, setVoice]         = useState("pt-BR-FranciscaNeural");
  const [format, setFormat]       = useState<"landscape" | "portrait">("portrait");
  const [jobStatus, setJobStatus] = useState<JobStatus>({ status: "idle" });

  const handleNextStep = async () => {
    if (!professional?.slug || !objetivo.trim()) return;
    setJobStatus({ status: "loading" });
    try {
      const res = await fetch(`${API}/preview-roteiro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional.slug,
          video_type: "objetivo_livre",
          objetivo: objetivo.trim(),
        }),
      });
      const data: Script = await res.json();
      setScript(data);
      setJobStatus({ status: "editing" });
      setStep(2);
    } catch {
      setJobStatus({ status: "idle" });
      toast.error("Não foi possível carregar o roteiro");
    }
  };

  const handleGenerate = async () => {
    if (!professional?.slug || !script) return;
    setJobStatus({ status: "processing", progress: 0, step: "Iniciando..." });
    setStep(3);
    try {
      const res = await fetch(`${API}/gerar-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional.slug,
          video_type: "objetivo_livre",
          objetivo: objetivo.trim(),
          script,
          voice,
          format,
        }),
      });
      const data = await res.json();
      pollStatus(data.job_id);
    } catch {
      setJobStatus({ status: "error", message: "Não foi possível conectar à API de vídeos" });
    }
  };

  const pollStatus = (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res  = await fetch(`${API}/status/${id}`);
        const data = await res.json();
        setJobStatus(data);
        if (data.status === "done" || data.status === "error") {
          clearInterval(interval);
          if (data.status === "done") toast.success("Vídeo criado com sucesso!");
          else toast.error("Erro: " + data.message);
        }
      } catch {
        clearInterval(interval);
        setJobStatus({ status: "error", message: "Erro de conexão com a API" });
      }
    }, 3000);
  };

  const handleReset = () => {
    setStep(1); setScript(null); setObjetivo("");
    setVoice("pt-BR-FranciscaNeural"); setFormat("portrait");
    setJobStatus({ status: "idle" });
  };

  const updateLegenda = (i: number, field: keyof Legenda, value: string | number) => {
    if (!script) return;
    const legendas = [...script.legendas];
    legendas[i] = { ...legendas[i], [field]: field === "tempo" ? Number(value) : value };
    setScript({ ...script, legendas });
  };

  const addLegenda = () => {
    if (!script) return;
    const last = script.legendas[script.legendas.length - 1];
    setScript({ ...script, legendas: [...script.legendas, { tempo: (last?.tempo ?? 0) + 4, texto: "" }] });
  };

  const removeLegenda = (i: number) => {
    if (!script || script.legendas.length <= 1) return;
    setScript({ ...script, legendas: script.legendas.filter((_, idx) => idx !== i) });
  };

  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-8">
      {[{ n: 1, label: "Objetivo" }, { n: 2, label: "Revisar" }, { n: 3, label: "Gerar" }].map(({ n, label }, i) => (
        <div key={n} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 ${step === n ? "text-primary font-semibold" : step > n ? "text-green-500" : "text-muted-foreground"}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step === n ? "border-primary bg-primary text-white" : step > n ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground"}`}>
              {step > n ? "✓" : n}
            </div>
            <span className="text-sm hidden sm:inline">{label}</span>
          </div>
          {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );

  // ── Step 1: Objetivo ───────────────────────────────────────
  if (step === 1) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Criar Vídeo</h1>
        <p className="text-muted-foreground mt-1">
          Descreva o objetivo do vídeo e geraremos o roteiro, narração e imagens automaticamente.
        </p>
      </div>
      <StepIndicator />

      <div className="space-y-3">
        <Label className="text-base font-semibold">Qual o objetivo deste vídeo?</Label>
        <Textarea
          rows={4}
          value={objetivo}
          onChange={(e) => setObjetivo(e.target.value)}
          placeholder="Ex: quero atrair terapeutas que ainda não têm presença digital e mostrar que é possível ter a agenda cheia sem esforço manual..."
          className="resize-none text-base"
        />
        <p className="text-xs text-muted-foreground">
          Quanto mais específico, melhor o roteiro gerado.
        </p>
      </div>

      {/* Exemplos rápidos */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5" /> Exemplos de objetivo
        </p>
        <div className="flex flex-col gap-2">
          {OBJETIVO_EXEMPLOS.map((ex) => (
            <button
              key={ex}
              className="text-left text-sm px-3 py-2 rounded-lg border border-dashed border-muted-foreground/40 hover:border-primary hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground"
              onClick={() => setObjetivo(ex)}
            >
              "{ex}"
            </button>
          ))}
        </div>
      </div>

      <Button
        className="w-full" size="lg"
        disabled={!objetivo.trim() || jobStatus.status === "loading"}
        onClick={handleNextStep}
      >
        {jobStatus.status === "loading"
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Gerando roteiro...</>
          : <><ChevronRight className="mr-2 h-4 w-4" /> Gerar Roteiro</>}
      </Button>
    </div>
  );

  // ── Step 2: Revisar ────────────────────────────────────────
  if (step === 2 && script) return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Revisar Roteiro</h1>
        <p className="text-muted-foreground mt-1">Edite o conteúdo, escolha a voz e o formato.</p>
      </div>
      <StepIndicator />

      {/* Narração */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Narração</Label>
        <Textarea
          rows={5}
          value={script.narracao}
          onChange={(e) => setScript({ ...script, narracao: e.target.value })}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground">
          {script.narracao.length} caracteres · aprox. {Math.round(script.narracao.length / 15)}s de duração
        </p>
      </div>

      {/* Slides */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Slides</Label>
          <Button variant="outline" size="sm" onClick={addLegenda}>+ Slide</Button>
        </div>
        <div className="space-y-2">
          {script.legendas.map((leg, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="w-16 flex-shrink-0">
                <Input
                  type="number" min={0} value={leg.tempo}
                  onChange={(e) => updateLegenda(i, "tempo", e.target.value)}
                  className="text-center text-sm"
                />
                <p className="text-xs text-center text-muted-foreground mt-0.5">seg</p>
              </div>
              <Input
                value={leg.texto}
                onChange={(e) => updateLegenda(i, "texto", e.target.value)}
                placeholder="Texto do slide..."
                className="flex-1"
              />
              <Button
                variant="ghost" size="sm" className="text-destructive px-2"
                onClick={() => removeLegenda(i)} disabled={script.legendas.length <= 1}
              >✕</Button>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Call to Action (slide final)</Label>
        <Input value={script.cta} onChange={(e) => setScript({ ...script, cta: e.target.value })} />
      </div>

      {/* Voz */}
      <div className="space-y-2">
        <Label className="text-base font-semibold flex items-center gap-2">
          <Mic className="h-4 w-4" /> Voz da Narração
        </Label>
        <div className="grid grid-cols-3 gap-3">
          {VOICES.map((v) => (
            <Card
              key={v.id}
              className={`cursor-pointer border-2 transition-all ${voice === v.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              onClick={() => setVoice(v.id)}
            >
              <CardContent className="p-3 text-center">
                <p className="font-medium text-sm">{v.label}</p>
                <p className="text-xs text-muted-foreground">{v.gender}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Formato */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Formato</Label>
        <div className="grid grid-cols-2 gap-3">
          <Card
            className={`cursor-pointer border-2 transition-all ${format === "portrait" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            onClick={() => setFormat("portrait")}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <Smartphone className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium text-sm">Vertical 9:16</p>
                <p className="text-xs text-muted-foreground">Reels, Stories, TikTok</p>
              </div>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer border-2 transition-all ${format === "landscape" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
            onClick={() => setFormat("landscape")}
          >
            <CardContent className="p-4 flex items-center gap-3">
              <Monitor className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium text-sm">Paisagem 16:9</p>
                <p className="text-xs text-muted-foreground">YouTube, Feed</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={() => setStep(1)}>
          <ChevronLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button className="flex-1" size="lg" onClick={handleGenerate}>
          <Film className="mr-2 h-5 w-5" /> Gerar Vídeo
        </Button>
      </div>
    </div>
  );

  // ── Step 3: Processando / Resultado ───────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Criar Vídeo</h1>
        <p className="text-muted-foreground mt-1">Aguarde enquanto seu vídeo é gerado.</p>
      </div>
      <StepIndicator />

      {jobStatus.status === "processing" && (
        <Card>
          <CardContent className="py-12 flex flex-col items-center gap-5">
            <Loader2 className="h-14 w-14 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-semibold text-lg">Gerando seu vídeo...</p>
              <p className="text-muted-foreground mt-1 text-sm">{jobStatus.step}</p>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${jobStatus.progress || 0}%` }}
              />
            </div>
            <p className="text-sm text-muted-foreground">{jobStatus.progress || 0}%</p>
          </CardContent>
        </Card>
      )}

      {jobStatus.status === "done" && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <CheckCircle2 className="h-14 w-14 text-green-500" />
            <div className="text-center">
              <p className="font-semibold text-lg">Vídeo criado com sucesso!</p>
              <p className="text-muted-foreground mt-1 text-sm">{jobStatus.titulo}</p>
            </div>
            {jobStatus.video_url && (
              <video src={jobStatus.video_url} controls className="w-full max-w-xs rounded-xl mt-2 shadow-lg" />
            )}
            <div className="flex gap-3 mt-2">
              {jobStatus.video_url && (
                <Button asChild variant="outline">
                  <a href={jobStatus.video_url} download>Baixar Vídeo</a>
                </Button>
              )}
              <Button onClick={handleReset}>Criar Outro Vídeo</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {jobStatus.status === "error" && (
        <Card className="border-destructive">
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <AlertCircle className="h-14 w-14 text-destructive" />
            <div className="text-center">
              <p className="font-semibold text-lg">Erro ao gerar vídeo</p>
              <p className="text-muted-foreground mt-1 text-sm">{jobStatus.message}</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setStep(2)} variant="outline">
                <ChevronLeft className="mr-2 h-4 w-4" /> Editar Roteiro
              </Button>
              <Button onClick={handleReset} variant="outline">Recomeçar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
