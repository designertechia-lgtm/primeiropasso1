import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Clapperboard, Wand2, Loader2, Heart, BookOpenCheck, Flame, TrendingUp } from "lucide-react";
import { videoApiAuthHeaders } from "@/lib/videoApi";
import { saveClonedVideoDraft } from "@/lib/criarVideoDraft";
import type { Script } from "@/pages/admin/AdminEstudioViral";

const API = import.meta.env.VITE_VIDEO_API_URL || "https://video-api.primeiropasso.online";

type Tom = "acolhedor" | "educativo" | "provocador" | "motivacional";

// Tela independente do fluxo normal de "Criar Vídeo": só a ENTRADA (upload/link
// + tema + tom) é própria daqui — depois de analisar, o roteiro cai no mesmo
// Estúdio de Cenas via handoff em localStorage (saveClonedVideoDraft).
export default function AdminClonarVideo() {
  const { data: professional } = useProfessional();
  const [searchParams, setSearchParams] = useSearchParams();

  const [refFile, setRefFile] = useState<File | null>(null);
  const [refUrl, setRefUrl] = useState("");
  const [refTema, setRefTema] = useState("");
  const [tom, setTom] = useState<Tom>("acolhedor");
  const [refAnalyzing, setRefAnalyzing] = useState(false);

  const irParaEstudioDeCenas = (script: Script) => {
    const objetivo = `Clone de vídeo de referência${refTema.trim() ? ` — ${refTema.trim()}` : ""}`;
    // Save → toast → troca de aba, tudo síncrono: o próximo mount de "Criar
    // Vídeos" precisa encontrar o draft já escrito no localStorage.
    saveClonedVideoDraft(script, { tom, objetivo });
    toast.success("Clone analisado! Abra o Estúdio de Cenas: cada cena será recriada por IA parecida com o original.", { duration: 9000 });
    searchParams.delete("sub");
    setSearchParams(searchParams, { replace: true });
  };

  const handleAnalisarReferencia = async () => {
    if (!refFile || !professional?.slug) return;
    setRefAnalyzing(true);
    try {
      const form = new FormData();
      form.append("file", refFile);
      form.append("professional_slug", professional.slug);
      form.append("tema", refTema.trim());
      form.append("tom", tom);
      const res = await fetch(`${API}/analisar-video-referencia`, {
        method: "POST",
        headers: await videoApiAuthHeaders(),   // sem Content-Type — o browser define o boundary
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao analisar o vídeo de referência");
      irParaEstudioDeCenas(data.script);
    } catch (e: any) {
      toast.error(e.message || "Erro ao analisar o vídeo de referência");
    } finally {
      setRefAnalyzing(false);
    }
  };

  // Cópia de referência por LINK (YouTube/TikTok/Instagram). Se a plataforma
  // não permitir baixar, o backend devolve o MOTIVO claro em `detail`.
  const handleAnalisarReferenciaUrl = async () => {
    if (!refUrl.trim() || !professional?.slug) return;
    setRefAnalyzing(true);
    try {
      const res = await fetch(`${API}/analisar-video-referencia-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await videoApiAuthHeaders()) },
        body: JSON.stringify({
          professional_slug: professional.slug,
          url: refUrl.trim(),
          tema: refTema.trim(),
          tom,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Falha ao analisar o vídeo do link");
      irParaEstudioDeCenas(data.script);
    } catch (e: any) {
      toast.error(e.message || "Erro ao analisar o vídeo do link", { duration: 8000 });
    } finally {
      setRefAnalyzing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clapperboard className="h-6 w-6 text-orange-500" /> Clonar Vídeo
        </h1>
        <p className="text-muted-foreground mt-1">
          Cole o link (ou envie o arquivo) e a IA recria o vídeo com o seu conteúdo.
        </p>
      </div>

      <Card className="border-dashed border-2 border-orange-300/50 bg-orange-50/30 dark:bg-orange-950/10">
        <CardContent className="p-4 space-y-3">
          <Label className="text-base font-semibold flex items-center gap-2">
            Clonar um vídeo que viralizou
            <Badge variant="outline" className="text-xs font-normal border-purple-400 text-purple-600">com IA · PRO</Badge>
          </Label>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Cole o link (ou envie o arquivo) e a IA <strong>recria o vídeo</strong>: mesma estrutura
            — gancho, ritmo, viradas e CTA — e <strong>cenas gerada por IA parecidas com as
            originais</strong>, adaptadas ao seu conteúdo no Estúdio de Cenas. Os ativos do original
            (imagens, áudio, rostos, marcas) nunca são copiados.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={refUrl}
              onChange={(e) => setRefUrl(e.target.value)}
              placeholder="Cole o link (YouTube, TikTok ou Instagram)…"
              className="text-sm"
              disabled={!!refFile}
            />
            <Input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
              className="text-xs file:text-xs"
              onChange={(e) => setRefFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <Input
            value={refTema}
            onChange={(e) => setRefTema(e.target.value)}
            placeholder="Sobre o que será o SEU vídeo? (opcional)"
            className="text-sm"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              size="sm"
              className="gap-2"
              disabled={(!refFile && !refUrl.trim()) || refAnalyzing}
              onClick={refFile ? handleAnalisarReferencia : handleAnalisarReferenciaUrl}
            >
              {refAnalyzing
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analisando a estrutura do vídeo...</>
                : <><Wand2 className="h-3.5 w-3.5" /> Replicar estrutura</>}
            </Button>
            {!refFile && !!refUrl.trim() && (
              <span className="text-[11px] text-muted-foreground">
                Instagram às vezes bloqueia o acesso — se falhar, baixe o vídeo e envie o arquivo.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Label className="text-base font-semibold">Tom da Narração</Label>
        <div className="grid grid-cols-2 gap-3">
          {([
            { value: "acolhedor",    label: "Acolhedor",    desc: "Empático e seguro",     Icon: Heart },
            { value: "educativo",    label: "Educativo",    desc: "Claro e informativo",   Icon: BookOpenCheck },
            { value: "provocador",   label: "Provocador",   desc: "Questiona e desafia",   Icon: Flame },
            { value: "motivacional", label: "Motivacional", desc: "Energia e ação",        Icon: TrendingUp },
          ] as const).map(({ value, label, desc, Icon }) => (
            <Card key={value}
              className={`cursor-pointer border-2 transition-all ${tom === value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onClick={() => setTom(value)}>
              <CardContent className="p-3 flex items-center gap-3">
                <Icon className={`h-5 w-5 shrink-0 ${tom === value ? "text-primary" : "text-muted-foreground"}`} />
                <div>
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
