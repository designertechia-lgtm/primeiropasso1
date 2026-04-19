import { useState } from "react";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Film, Loader2, CheckCircle2, AlertCircle,
  ChevronRight, ChevronLeft, Mic, Monitor, Smartphone, Sparkles,
} from "lucide-react";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

const VIDEO_TYPES = [
  {
    id: "objetivo_livre",
    label: "Objetivo Livre",
    description: "Você descreve o objetivo — o roteiro é gerado para você",
    duration: "~25s",
    highlight: true,
  },
  {
    id: "atrair_pacientes",
    label: "Atrair Pacientes",
    description: "Mostre que você perde pacientes sem automação",
    duration: "~25s",
  },
  {
    id: "demo_plataforma",
    label: "Demo da Plataforma",
    description: "Tour completo da sua página e sistema de agendamento",
    duration: "~30s",
  },
  {
    id: "whatsapp_bot",
    label: "WhatsApp Automático",
    description: "Demonstra o assistente agendando pacientes sozinho",
    duration: "~28s",
  },
];

const VOICES = [
  { id: "pt-BR-FranciscaNeural", label: "Francisca", gender: "Feminina" },
  { id: "pt-BR-ThalitaNeural",   label: "Thalita",   gender: "Feminina, jovem" },
  { id: "pt-BR-AntonioNeural",   label: "Antônio",   gender: "Masculina" },
];

type Legenda  = { tempo: number; texto: string };
type Script   = { titulo: string; narracao: string; cta: string; legendas: Legenda[] };
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
  const [step, setStep]               = useState<1 | 2 | 3>(1);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [objetivo, setObjetivo]       = useState("");
  const [script, setScript]           = useState<Script | null>(null);
  const [voice, setVoice]             = useState("pt-BR-FranciscaNeural");
  const [format, setFormat]           = useState<"landscape" | "portrait">("landscape");
  const [jobStatus, setJobStatus]     = useState<JobStatus>({ status: "idle" });

  const handleNextStep = async () => {
    if (!selectedType || !professional?.slug) return;
    if (selectedType === "objetivo_livre" && !objetivo.trim()) {
      toast.error("Descreva o objetivo do vídeo antes de continuar.");
      return;
    }
    setJobStatus({ status: "loading" });
    try {
      const res = await fetch(`${API}/preview-roteiro`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional.slug,
          video_type: selectedType,
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
          video_type: selectedType,
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
    setStep(1); setSelectedType(null); setScript(null);
    setObjetivo(""); setVoice("pt-BR-FranciscaNeural");
    setFormat("landscape"); setJobStatus({ status: "idle" });
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
    <div className="flex items-center gap-2 mb-6">
      {[{ n: 1, label: "Tipo" }, { n: 2, label: "Personalizar" }, { n: 3, label: "Gerar" }].map(({ n, label }, i) => (
        <div key={n} className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 ${step === n ? "text-primary font-semibold" : step > n ? "text-green-500" : "text-muted-foreground"}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${step === n ? "border-primary bg-primary text-white" : step > n ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground"}`}>
              {step > n ? "✓" : n}
            </div>
            <span className="text-sm hidden sm:inline">{label}</span>
          </div>
          {i < 2 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      ))}
    </div>
  );

  // ── Step 1 ─────────────────────────────────────────────────
  if (step === 1) return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Criar Vídeo</h1>
        <p className="text-muted-foreground mt-1">Gere vídeos de divulgação com imagens reais e narração automática.</p>
      </div>
      <StepIndicator />

      <div className="grid gap-4">
        {VIDEO_TYPES.map((type) => (
          <Card
            key={type.id}
            className={`cursor-pointer transition-all border-2 ${selectedType === type.id ? "border-primary bg-primary/5" : type.highlight ? "border-primary/40 hover:border-primary" : "border-border hover:border-primary/50"}`}
            onClick={() => setSelectedType(type.id)}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${selectedType === type.id ? "border-primary bg-primary" : "border-muted-foreground"}`} />
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{type.label}</span>
                    {type.highlight && <Badge variant="secondary" className="text-xs gap-1"><Sparkles className="h-3 w-3" />Recomendado</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">{type.duration}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{type.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedType === "objetivo_livre" && (
        <div className="space-y-2">
          <Label className="text-base font-semibold">Qual o objetivo do seu vídeo?</Label>
          <Textarea
            rows={3}
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            placeholder="Ex: quero atrair mães que buscam terapia infantil em São Paulo..."
            className="resize-none"
          />
          <p className="text-xs text-muted-foreground">Seja específico — o roteiro será gerado com base nesse objetivo.</p>
        </div>
      )}

      <Button
        className="w-full" size="lg"
        disabled={!selectedType || jobStatus.status === "loading" || (selectedType === "objetivo_livre" && !objetivo.trim())}
        onClick={handleNextStep}
      >
        {jobStatus.status === "loading"
          ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          : <ChevronRight className="mr-2 h-4 w-4" />}
        Próximo: Personalizar
      </Button>
    </div>
  );

  // ── Step 2 ─────────────────────────────────────────────────
  if (step === 2 && script) return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Criar Vídeo</h1>
        <p className="text-muted-foreground mt-1">Edite o roteiro e configure voz e formato.</p>
      </div>
      <StepIndicator />

      {/* Narração */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">Narração (texto falado)</Label>
        <Textarea
          rows={5}
          value={script.narracao}
          onChange={(e) => setScript({ ...script, narracao: e.target.value })}
          placeholder="Texto que será narrado..."
        />
        <p className="text-xs text-muted-foreground">{script.narracao.length} caracteres · aprox. {Math.round(script.narracao.length / 15)}s</p>
      </div>

      {/* Slides */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Slides</Label>
          <Button variant="outline" size="sm" onClick={addLegenda}>+ Adicionar slide</Button>
        </div>
        <div className="space-y-2">
          {script.legendas.map((leg, i) => (
            <div key={i} className="flex gap-2 items-center">
              <div className="w-16">
                <Input type="number" min={0} value={leg.tempo} onChange={(e) => updateLegenda(i, "tempo", e.target.value)} className="text-center text-sm" />
                <p className="text-xs text-center text-muted-foreground mt-0.5">seg</p>
              </div>
              <Input value={leg.texto} onChange={(e) => updateLegenda(i, "texto", e.target.value)} placeholder="Texto do slide..." className="flex-1" />
              <Button variant="ghost" size="sm" className="text-destructive px-2" onClick={() => removeLegenda(i)} disabled={script.legendas.length <= 1}>✕</Button>
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
        <Label className="text-base font-semibold flex items-center gap-2"><Mic className="h-4 w-4" /> Voz</Label>
        <div className="grid grid-cols-3 gap-3">
          {VOICES.map((v) => (
            <Card key={v.id} className={`cursor-pointer border-2 transition-all ${voice === v.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`} onClick={() => setVoice(v.id)}>
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
          <Card className={`cursor-pointer border-2 transition-all ${format === "landscape" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`} onClick={() => setFormat("landscape")}>
            <CardContent className="p-4 flex items-center gap-3">
              <Monitor className="h-6 w-6 text-primary" />
              <div><p className="font-medium text-sm">Paisagem 16:9</p><p className="text-xs text-muted-foreground">YouTube, Feed</p></div>
            </CardContent>
          </Card>
          <Card className={`cursor-pointer border-2 transition-all ${format === "portrait" ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`} onClick={() => setFormat("portrait")}>
            <CardContent className="p-4 flex items-center gap-3">
              <Smartphone className="h-6 w-6 text-primary" />
              <div><p className="font-medium text-sm">Vertical 9:16</p><p className="text-xs text-muted-foreground">Reels, Stories, TikTok</p></div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="mr-2 h-4 w-4" /> Voltar</Button>
        <Button className="flex-1" size="lg" onClick={handleGenerate}><Film className="mr-2 h-5 w-5" /> Gerar Vídeo</Button>
      </div>
    </div>
  );

  // ── Step 3 ─────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Criar Vídeo</h1>
        <p className="text-muted-foreground mt-1">Aguarde enquanto seu vídeo é gerado.</p>
      </div>
      <StepIndicator />

      {jobStatus.status === "processing" && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium text-lg">Gerando seu vídeo...</p>
              <p className="text-muted-foreground mt-1">{jobStatus.step}</p>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div className="bg-primary h-2 rounded-full transition-all duration-500" style={{ width: `${jobStatus.progress || 0}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">{jobStatus.progress || 0}%</p>
          </CardContent>
        </Card>
      )}

      {jobStatus.status === "done" && (
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div className="text-center">
              <p className="font-medium text-lg">Vídeo criado com sucesso!</p>
              <p className="text-muted-foreground mt-1">{jobStatus.titulo}</p>
            </div>
            {jobStatus.video_url && <video src={jobStatus.video_url} controls className="w-full rounded-lg mt-2 max-h-72" />}
            <div className="flex gap-3 mt-2">
              {jobStatus.video_url && <Button asChild variant="outline"><a href={jobStatus.video_url} download>Baixar Vídeo</a></Button>}
              <Button onClick={handleReset}>Criar Outro Vídeo</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {jobStatus.status === "error" && (
        <Card className="border-destructive">
          <CardContent className="py-8 flex flex-col items-center gap-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div className="text-center">
              <p className="font-medium text-lg">Erro ao gerar vídeo</p>
              <p className="text-muted-foreground mt-1">{jobStatus.message}</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => setStep(2)} variant="outline"><ChevronLeft className="mr-2 h-4 w-4" /> Editar Roteiro</Button>
              <Button onClick={handleReset} variant="outline">Recomeçar</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
