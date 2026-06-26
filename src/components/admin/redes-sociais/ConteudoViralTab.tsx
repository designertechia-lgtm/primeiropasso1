import { useState } from "react";
import { Copy, ExternalLink, Loader2, RefreshCw, SendHorizontal, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";

/**
 * Aba "Conteudo Viral" — harness de TESTE (somente desenvolvedor/owner).
 *
 * 1) Painel "Roteiro por IA": gera, via Claude (edge fn generate-text, campo
 *    `viral_video_script`), um roteiro de narracao editavel a partir de um
 *    briefing curto + contexto do profissional.
 * 2) "Enviar para a ferramenta": recarrega o iframe com ?subject=&script= —
 *    a WebUI (Main.py) le esses params e PRE-PREENCHE o campo "Video Script",
 *    entao o video usa o roteiro VERBATIM (nao reescreve). O iframe e
 *    cross-origin, por isso a passagem e via URL (nao da pra escrever no
 *    formulario por DOM).
 * 3) Embute a WebUI (clone do MoneyPrinterTurbo / Streamlit). URL via
 *    VITE_CONTEUDO_VIRAL_URL (default localhost:8501).
 */

const CV_URL = (
  (import.meta.env.VITE_CONTEUDO_VIRAL_URL as string | undefined) ??
  "http://localhost:8501"
).replace(/\/+$/, "");

const buildSrc = (subject?: string, script?: string) => {
  const params = new URLSearchParams({ embed: "true" });
  if (subject?.trim()) params.set("subject", subject.trim());
  if (script?.trim()) params.set("script", script.trim());
  return `${CV_URL}/?${params.toString()}`;
};

const textareaClass =
  "w-full resize-y rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

export default function ConteudoViralTab() {
  const { data: professional } = useProfessional();
  const [reloadKey, setReloadKey] = useState(0);
  const [iframeSrc, setIframeSrc] = useState(buildSrc());
  const [briefing, setBriefing] = useState("");
  const [script, setScript] = useState("");
  const [loading, setLoading] = useState(false);

  const gerarRoteiro = async () => {
    const tema = briefing.trim();
    if (!tema) {
      toast.error("Escreva um tema ou briefing para o roteiro.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-text", {
        body: {
          field: "viral_video_script",
          context: {
            name: (professional as { full_name?: string } | null)?.full_name || "Profissional",
            specialty:
              (professional as { approaches?: string[] } | null)?.approaches?.[0] || "",
            topic: tema,
          },
        },
      });
      if (error) throw error;
      const result = (data as { result?: string; error?: string } | null)?.result;
      if (!result || typeof result !== "string") {
        throw new Error((data as { error?: string } | null)?.error || "Resposta invalida da IA.");
      }
      setScript(result);
      toast.success("Roteiro gerado! Edite e clique em 'Enviar para a ferramenta'.");
    } catch (e) {
      toast.error(`Falha ao gerar roteiro: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const enviarParaFerramenta = () => {
    if (!script.trim() && !briefing.trim()) {
      toast.error("Gere ou escreva um roteiro antes de enviar.");
      return;
    }
    setIframeSrc(buildSrc(briefing, script));
    setReloadKey((k) => k + 1);
    toast.success("Roteiro enviado — preenchido na ferramenta abaixo.");
  };

  const copiarRoteiro = async () => {
    try {
      await navigator.clipboard.writeText(script);
      toast.success("Roteiro copiado.");
    } catch {
      toast.error("Nao consegui copiar — selecione e copie manualmente.");
    }
  };

  return (
    <div className="space-y-3">
      {/* Painel: Roteiro por IA */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-5 w-5 text-orange-500" />
            Roteiro por IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Tema ou briefing</label>
            <textarea
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              placeholder="Ex.: como lidar com a ansiedade antes de dormir"
              rows={2}
              className={textareaClass}
            />
          </div>
          <Button onClick={gerarRoteiro} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {loading ? "Gerando..." : "Gerar roteiro"}
          </Button>

          {script && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-sm font-medium">Roteiro (editável)</label>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={copiarRoteiro}>
                    <Copy className="h-4 w-4" /> Copiar
                  </Button>
                  <Button size="sm" className="gap-2" onClick={enviarParaFerramenta}>
                    <SendHorizontal className="h-4 w-4" /> Enviar para a ferramenta
                  </Button>
                </div>
              </div>
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                rows={6}
                className={textareaClass}
              />
              <p className="text-xs text-muted-foreground">
                "Enviar" preenche o campo <strong>Video Script</strong> da ferramenta abaixo com este
                texto — o vídeo usa o seu roteiro sem reescrever.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Toolbar do iframe */}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setReloadKey((k) => k + 1)}
        >
          <RefreshCw className="h-4 w-4" />
          Recarregar
        </Button>
        <Button asChild variant="outline" size="sm" className="gap-2">
          <a href={CV_URL} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            Abrir em nova aba
          </a>
        </Button>
      </div>

      {/* iframe da ferramenta */}
      <div className="overflow-hidden rounded-lg border bg-background">
        <iframe
          key={reloadKey}
          title="Conteudo Viral"
          src={iframeSrc}
          className="h-[calc(100vh-360px)] min-h-[520px] w-full"
          allow="clipboard-write; clipboard-read; fullscreen"
        />
      </div>
    </div>
  );
}
