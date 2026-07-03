import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link2, Video, Drama, Database, FileImage, Flame } from "lucide-react";
import { ConnectedAccounts } from "@/components/dashboard/ConnectedAccounts";
import AdminArtigos from "./AdminArtigos";
import AdminEstudioViral from "./AdminEstudioViral";
import AdminVideos from "./AdminVideos";
import AdminAvatares from "./AdminAvatares";
import AdminDocumentos from "./AdminDocumentos";
import PostsTab from "@/components/admin/redes-sociais/PostsTab";

const VALID_TABS = ["posts", "artigos", "videos", "personagens", "contas", "rag"] as const;
type TabValue = (typeof VALID_TABS)[number];

// Abas antigas que foram unificadas dentro de "Vídeos" (Estúdio Viral) —
// links salvos/atalhos continuam funcionando.
const LEGACY_TAB_ALIASES: Record<string, TabValue> = {
  "criar-video": "videos",
  "conteudo-viral": "videos",
};

export default function AdminRedesSociais() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") ?? "";
  const tabParam = LEGACY_TAB_ALIASES[rawTab] ?? rawTab;
  const isValidTab = (VALID_TABS as readonly string[]).includes(tabParam);
  const activeTab: TabValue = isValidTab ? (tabParam as TabValue) : "posts";

  const handleTabChange = (value: string) => {
    if (value === "posts") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  // Sub-aba de Vídeos controlada pela URL (?sub=) — assim "Reeditar com IA"
  // (?tab=videos&edit=X) cai direto no Estúdio Viral, que é o default.
  const videosSub = searchParams.get("sub") === "meus-videos" ? "meus-videos" : "estudio";
  const handleVideosSubChange = (value: string) => {
    if (value === "estudio") searchParams.delete("sub");
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
          <TabsTrigger value="artigos" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Artigos</span>
          </TabsTrigger>
          <TabsTrigger value="videos" className="gap-2">
            <Video className="h-4 w-4" />
            <span className="hidden sm:inline">Vídeos</span>
          </TabsTrigger>
          <TabsTrigger value="personagens" className="gap-2">
            <Drama className="h-4 w-4" />
            <span className="hidden sm:inline">Personagens</span>
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
        <TabsContent value="artigos" className="mt-4">
          <AdminArtigos />
        </TabsContent>
        <TabsContent value="videos" className="mt-4">
          {/* Vídeos: Estúdio Viral (criação — nome oficial) + Meus Vídeos (galeria) */}
          <Tabs value={videosSub} onValueChange={handleVideosSubChange} className="w-full">
            <TabsList className="bg-muted/40">
              <TabsTrigger value="estudio" className="gap-2">
                <Flame className="h-4 w-4 text-orange-500" /> Estúdio Viral
              </TabsTrigger>
              <TabsTrigger value="meus-videos" className="gap-2">
                <Video className="h-4 w-4" /> Meus Vídeos
              </TabsTrigger>
            </TabsList>
            <TabsContent value="estudio" className="mt-4">
              <AdminEstudioViral />
            </TabsContent>
            <TabsContent value="meus-videos" className="mt-4">
              <AdminVideos />
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="personagens" className="mt-4">
          <AdminAvatares />
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
