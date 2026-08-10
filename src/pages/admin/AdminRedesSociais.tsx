import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link2, Video, Drama, Database, FileImage, Flame, Clapperboard, Copy, Scissors, Sparkles, Loader2 } from "lucide-react";
import { useCloneJobAtivo } from "@/lib/cloneJobs";
import { ConnectedAccounts } from "@/components/dashboard/ConnectedAccounts";
import AdminArtigos from "./AdminArtigos";
import AdminEstudioViral from "./AdminEstudioViral";
import AdminClonarVideo from "./AdminClonarVideo";
import AdminVideos from "./AdminVideos";
import AdminAvatares from "./AdminAvatares";
import AdminEditorVideo from "./AdminEditorVideo";
import AdminDocumentos from "./AdminDocumentos";
import PostsTab from "@/components/admin/redes-sociais/PostsTab";
import DiretorEstudio from "@/components/admin/DiretorEstudio";

const VALID_TABS = ["posts", "videos", "contas", "rag"] as const;
type TabValue = (typeof VALID_TABS)[number];

// Sub-abas do guarda-chuva "Estúdio Viral": criação, diretor por chat, clonagem,
// personagens, artigos/carrosséis, editor, galeria.
const SUB_TABS = ["criar", "diretor", "clonar", "personagens", "artigos", "editor", "meus-videos"] as const;
type SubValue = (typeof SUB_TABS)[number];

// Abas/atalhos antigos que foram consolidados dentro de "Estúdio Viral" — links salvos
// continuam funcionando e caem na sub-aba certa.
const LEGACY_TAB_ALIASES: Record<string, { tab: TabValue; sub?: SubValue }> = {
  "criar-video": { tab: "videos", sub: "criar" },
  "conteudo-viral": { tab: "videos", sub: "criar" },
  "artigos": { tab: "videos", sub: "artigos" },
  "personagens": { tab: "videos", sub: "personagens" },
};

export default function AdminRedesSociais() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Clonagem em andamento: a sub-aba mostra o progresso mesmo com a tela do
  // Clonar Vídeo desmontada (o Radix Tabs descarta o conteúdo inativo), pra
  // ninguém achar que a geração paga se perdeu ao navegar.
  const cloneAtivo = useCloneJobAtivo();
  const rawTab = searchParams.get("tab") ?? "";
  const alias = LEGACY_TAB_ALIASES[rawTab];
  const tabParam = alias?.tab ?? rawTab;
  const isValidTab = (VALID_TABS as readonly string[]).includes(tabParam);
  const activeTab: TabValue = isValidTab ? (tabParam as TabValue) : "posts";

  const handleTabChange = (value: string) => {
    if (value === "posts") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", value);
    }
    // ao trocar de aba de topo, zera a sub-aba herdada de um alias antigo
    searchParams.delete("sub");
    setSearchParams(searchParams, { replace: true });
  };

  // Sub-aba de "Estúdio Viral" controlada pela URL (?sub=). Default = "criar", para que
  // "Reeditar com IA" (?tab=videos&edit=X) caia direto na tela de criação. Aliases antigos
  // (?tab=artigos, ?tab=personagens) trazem sua sub-aba embutida.
  const rawSub = searchParams.get("sub") || alias?.sub || "";
  const videosSub: SubValue = (SUB_TABS as readonly string[]).includes(rawSub) ? (rawSub as SubValue) : "criar";
  const handleVideosSubChange = (value: string) => {
    if (value === "criar") searchParams.delete("sub");
    else searchParams.set("sub", value);
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="posts" className="gap-2">
            <FileImage className="h-4 w-4" />
            <span className="hidden sm:inline">Posts</span>
          </TabsTrigger>
          <TabsTrigger value="videos" className="gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <span className="hidden sm:inline">Estúdio Viral</span>
          </TabsTrigger>
          <TabsTrigger value="contas" className="gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">Contas Conectadas</span>
          </TabsTrigger>
          <TabsTrigger value="rag" className="gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">RAG conteúdo criação</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-4">
          <PostsTab />
        </TabsContent>
        <TabsContent value="videos" className="mt-4">
          {/* Estúdio Viral: tudo de conteúdo junto — criação, personagens, artigos/carrosséis e galeria. */}
          <Tabs value={videosSub} onValueChange={handleVideosSubChange} className="w-full">
            <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1 bg-muted/40">
              {/* Ordem definida pelo Carlos (06/07): Personagens → Artigos →
                  Criar Vídeos → Editor → Meus Vídeos. O default de conteúdo
                  continua "criar" (links e Axel caem na criação). */}
              <TabsTrigger value="personagens" className="gap-2">
                <Drama className="h-4 w-4" /> Personagens
              </TabsTrigger>
              <TabsTrigger value="artigos" className="gap-2">
                <FileText className="h-4 w-4" /> Artigos e Carrosséis
              </TabsTrigger>
              <TabsTrigger value="criar" className="gap-2">
                <Clapperboard className="h-4 w-4 text-orange-500" /> Criar Vídeos
              </TabsTrigger>
              <TabsTrigger value="diretor" className="gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" /> Diretor IA
              </TabsTrigger>
              <TabsTrigger value="clonar" className="gap-2">
                {cloneAtivo
                  ? <Loader2 className="h-4 w-4 text-orange-500 animate-spin" />
                  : <Copy className="h-4 w-4 text-orange-500" />}
                Clonar Vídeo
                {cloneAtivo && (
                  <span className="text-[10px] font-medium text-orange-600">
                    {cloneAtivo.status.progress ?? 5}%
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="editor" className="gap-2">
                <Scissors className="h-4 w-4" /> Editor
              </TabsTrigger>
              <TabsTrigger value="meus-videos" className="gap-2">
                <Video className="h-4 w-4" /> Meus Vídeos
              </TabsTrigger>
            </TabsList>
            <TabsContent value="criar" className="mt-4">
              <AdminEstudioViral />
            </TabsContent>
            <TabsContent value="diretor" className="mt-4">
              <DiretorEstudio />
            </TabsContent>
            <TabsContent value="clonar" className="mt-4">
              <AdminClonarVideo />
            </TabsContent>
            <TabsContent value="personagens" className="mt-4">
              <AdminAvatares />
            </TabsContent>
            <TabsContent value="artigos" className="mt-4">
              <AdminArtigos />
            </TabsContent>
            <TabsContent value="editor" className="mt-4">
              <AdminEditorVideo />
            </TabsContent>
            <TabsContent value="meus-videos" className="mt-4">
              <AdminVideos />
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="contas" className="mt-4">
          <ConnectedAccounts />
        </TabsContent>
        <TabsContent value="rag" className="mt-4">
          <AdminDocumentos />
        </TabsContent>
      </Tabs>
    </div>
  );
}
