/**
 * ConhecimentoTab — Gestão da base de conhecimento GLOBAL do produto.
 *
 * Permite ao super-admin (designertech.ia@gmail.com):
 * - Visualizar e editar o markdown da base de conhecimento do Axel
 * - Re-ingerir (embeddar) no worker RAG com UUID sentinela
 *
 * A base global é indexada com professional_id = 00000000-0000-0000-0000-000000000000
 * e usada pela tool consultar_conhecimento da edge function axel-agent.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BookOpen,
  Save,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

// UUID sentinela: dono da base de conhecimento GLOBAL do produto
const PLATFORM_KB_ID = "00000000-0000-0000-0000-000000000000";

// Conteúdo padrão inicial (fallback se o arquivo remoto não estiver disponível)
const DEFAULT_KB = `# 📚 Conhecimento do Axel — PrimeiroPasso

## Sobre a Plataforma
- **PrimeiroPasso** é uma plataforma SaaS para psicólogos e terapeutas
- Oferece: agenda online, teleconsulta, gestão de pacientes, marketing digital

## Funcionalidades Principais

### 📅 Agenda
- Gerenciamento de horários, agendamentos, bloqueios e teleconsulta
- Endereço: /admin/agenda

### 👥 Pacientes/Clientes
- Pipeline CRM Kanban, leads via site e WhatsApp, agente IA automático
- Endereço: /admin/clientes

### 📝 Redes Sociais & Conteúdo
- Artigos com carrossel, vídeos, estúdio viral, avatares, RAG
- Endereço: /admin/redes-sociais

### 🎨 Landing Page
- Página profissional com hero, dores, solução, bio, preços e agendamento
- Endereço: /admin/landing

### 👤 Perfil
- Nome, CRP, bio, foto, redes sociais, cores e WhatsApp
- Endereço: /admin/perfil

### 💳 Assinatura
- Planos, PIX, créditos para recursos avançados
- Endereço: /admin/assinatura

## Fluxo de Onboarding
1. Completar perfil (/admin/perfil)
2. Configurar agenda (/admin/agenda)
3. Personalizar landing (/admin/landing)
4. Conectar WhatsApp (/admin/clientes)
5. Criar primeiro conteúdo (/admin/redes-sociais)
`;

export default function ConhecimentoTab() {
  const [markdown, setMarkdown] = useState("");
  const [originalMd, setOriginalMd] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<"idle" | "success" | "error">("idle");
  const [ingestChunks, setIngestChunks] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Carrega o conteúdo atual da base (do localStorage local ou do worker)
  useEffect(() => {
    const saved = localStorage.getItem("axel_platform_kb");
    if (saved) {
      setMarkdown(saved);
      setOriginalMd(saved);
      setLastUpdated(localStorage.getItem("axel_platform_kb_updated") || null);
    } else {
      setMarkdown(DEFAULT_KB);
      setOriginalMd(DEFAULT_KB);
    }
    setIsLoading(false);
  }, []);

  const hasChanges = markdown !== originalMd;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const now = new Date().toISOString();
      localStorage.setItem("axel_platform_kb", markdown);
      localStorage.setItem("axel_platform_kb_updated", now);
      setOriginalMd(markdown);
      setLastUpdated(now);
      toast.success("Base de conhecimento salva localmente. Clique em 'Re-ingerir no RAG' para indexar no worker.");
    } catch (err) {
      toast.error("Erro ao salvar.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleIngest = async () => {
    // Salva primeiro se houver alterações
    if (hasChanges) {
      await handleSave();
    }

    setIsIngesting(true);
    setIngestStatus("idle");
    setIngestChunks(null);

    try {
      const workerUrl = localStorage.getItem("WORKER_RAG_URL") || "";
      if (!workerUrl) {
        toast.error("URL do worker RAG não configurada. Defina WORKER_RAG_URL.");
        setIngestStatus("error");
        return;
      }

      const res = await fetch(`${workerUrl.replace(/\/$/, "")}/rag/ingest-text/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: markdown,
          file_name: "conhecimento.md",
          professional_id: PLATFORM_KB_ID,
          document_id: PLATFORM_KB_ID, // fixo — re-ingest idempotente
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Worker respondeu ${res.status}: ${err}`);
      }

      const data = await res.json();
      setIngestChunks(data.chunks_inserted || 0);
      setIngestStatus("success");
      toast.success(`Base re-ingerida com sucesso! ${data.chunks_inserted} chunks indexados.`);
    } catch (err: any) {
      console.error("[ConhecimentoTab] Ingest error:", err);
      setIngestStatus("error");
      toast.error(`Erro ao re-ingerir: ${err.message}`);
    } finally {
      setIsIngesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <CardTitle>Base de Conhecimento do Axel</CardTitle>
                <CardDescription>
                  Este markdown é indexado no RAG com o UUID sentinela ({PLATFORM_KB_ID}) e usado pela tool{" "}
                  <code className="text-xs bg-muted px-1 rounded">consultar_conhecimento</code> do agente Axel.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {lastUpdated && (
                <span className="text-xs text-muted-foreground">
                  Última edição: {new Date(lastUpdated).toLocaleString("pt-BR")}
                </span>
              )}
              {ingestStatus === "success" && (
                <Badge variant="default" className="bg-green-500/10 text-green-400 border-green-500/20 gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  {ingestChunks} chunks
                </Badge>
              )}
              {ingestStatus === "error" && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Falha
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="Escreva o markdown da base de conhecimento do produto..."
            className="min-h-[500px] font-mono text-sm bg-white/5 border-white/10 rounded-xl resize-y focus:border-purple-500/50"
          />

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="gap-2 rounded-xl"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar
            </Button>

            <Button
              onClick={handleIngest}
              disabled={isIngesting}
              variant="secondary"
              className="gap-2 rounded-xl bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/20"
            >
              {isIngesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Re-ingerir no RAG
            </Button>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              💡 <strong>Dica:</strong> Use títulos (##), listas e palavras-chave que o Axel usará para buscar.
              Queries curtas (1-3 palavras) funcionam melhor com o RAG.
            </p>
            <p>
              🔒 <strong>Segurança:</strong> Apenas o super-admin (<code>designertech.ia@gmail.com</code>) tem acesso a esta página.
              A re-ingestão é idempotente (substitui chunks anteriores do mesmo document_id).
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}