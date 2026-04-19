import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Film, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const VIDEO_API_URL = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

const VIDEO_TYPES = [
  {
    id: "atrair_pacientes",
    label: "Atrair Pacientes",
    description: "Vídeo para anúncio mostrando que você perde pacientes sem automação",
    duration: "~25s",
  },
  {
    id: "demo_plataforma",
    label: "Demo da Plataforma",
    description: "Tour completo mostrando sua página e sistema de agendamento",
    duration: "~30s",
  },
  {
    id: "whatsapp_bot",
    label: "WhatsApp Automático",
    description: "Demonstra o assistente respondendo e agendando pacientes sozinho",
    duration: "~28s",
  },
];

type JobStatus = {
  status: "idle" | "processing" | "done" | "error";
  progress?: number;
  step?: string;
  video_url?: string;
  titulo?: string;
  message?: string;
};

export default function AdminCriarVideo() {
  const { data: professional } = useProfessional();
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>({ status: "idle" });

  const pollStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${VIDEO_API_URL}/status/${id}`);
        const data = await res.json();
        setJobStatus(data);

        if (data.status === "done" || data.status === "error") {
          clearInterval(interval);
          if (data.status === "done") {
            toast.success("Vídeo criado com sucesso! Disponível em Vídeos.");
          } else {
            toast.error("Erro ao gerar vídeo: " + data.message);
          }
        }
      } catch {
        clearInterval(interval);
        setJobStatus({ status: "error", message: "Erro de conexão com a API" });
      }
    }, 3000);
  };

  const handleGenerate = async () => {
    if (!selectedType || !professional?.slug) return;

    setJobStatus({ status: "processing", progress: 0, step: "Iniciando..." });

    try {
      const res = await fetch(`${VIDEO_API_URL}/gerar-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professional_slug: professional.slug,
          video_type: selectedType,
        }),
      });

      const data = await res.json();
      setJobId(data.job_id);
      pollStatus(data.job_id);
    } catch {
      setJobStatus({ status: "error", message: "Não foi possível conectar à API de vídeos" });
      toast.error("Erro ao conectar com a API de vídeos");
    }
  };

  const handleReset = () => {
    setSelectedType(null);
    setJobId(null);
    setJobStatus({ status: "idle" });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Criar Vídeo</h1>
        <p className="text-muted-foreground mt-1">
          Gere vídeos de divulgação automaticamente usando seus dados de perfil.
        </p>
      </div>

      {jobStatus.status === "idle" && (
        <>
          <div className="grid gap-4">
            {VIDEO_TYPES.map((type) => (
              <Card
                key={type.id}
                className={`cursor-pointer transition-all border-2 ${
                  selectedType === type.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50"
                }`}
                onClick={() => setSelectedType(type.id)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                    selectedType === type.id
                      ? "border-primary bg-primary"
                      : "border-muted-foreground"
                  }`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.duration}</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">{type.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button
            className="w-full"
            size="lg"
            disabled={!selectedType}
            onClick={handleGenerate}
          >
            <Film className="mr-2 h-5 w-5" />
            Gerar Vídeo
          </Button>
        </>
      )}

      {jobStatus.status === "processing" && (
        <Card>
          <CardContent className="py-10 flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center">
              <p className="font-medium text-lg">Gerando seu vídeo...</p>
              <p className="text-muted-foreground mt-1">{jobStatus.step}</p>
            </div>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
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
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div className="text-center">
              <p className="font-medium text-lg">Vídeo criado com sucesso!</p>
              <p className="text-muted-foreground mt-1">{jobStatus.titulo}</p>
            </div>
            {jobStatus.video_url && (
              <video
                src={jobStatus.video_url}
                controls
                className="w-full rounded-lg mt-2 max-h-64"
              />
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
            <AlertCircle className="h-12 w-12 text-destructive" />
            <div className="text-center">
              <p className="font-medium text-lg">Erro ao gerar vídeo</p>
              <p className="text-muted-foreground mt-1">{jobStatus.message}</p>
            </div>
            <Button onClick={handleReset} variant="outline">Tentar Novamente</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
