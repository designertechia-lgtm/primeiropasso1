import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link2, Video, Clapperboard, Drama, Database, FileImage, Flame, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ConnectedAccounts } from "@/components/dashboard/ConnectedAccounts";
import AdminArtigos from "./AdminArtigos";
import AdminEstudioViral from "./AdminEstudioViral";
import AdminVideos from "./AdminVideos";
import AdminCriarVideo from "./AdminCriarVideo";
import AdminAvatares from "./AdminAvatares";
import AdminDocumentos from "./AdminDocumentos";
import PostsTab from "@/components/admin/redes-sociais/PostsTab";
import ConteudoViralTab from "@/components/admin/redes-sociais/ConteudoViralTab";

const VALID_TABS = ["posts", "artigos", "videos", "criar-video", "personagens", "contas", "rag", "conteudo-viral"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function AdminRedesSociais() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDeveloper } = useAuth();
  const tabParam = searchParams.get("tab");
  // a aba "conteudo-viral" e um harness de TESTE exclusivo da conta de desenvolvedor
  const isValidTab =
    (VALID_TABS as readonly string[]).includes(tabParam ?? "") &&
    !(tabParam === "conteudo-viral" && !isDeveloper);
  const activeTab: TabValue = isValidTab ? (tabParam as TabValue) : "posts";

  const handleTabChange = (value: string) => {
    if (value === "posts") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", value);
    }
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
          <TabsTrigger value="criar-video" className="gap-2">
            <Clapperboard className="h-4 w-4" />
            <span className="hidden sm:inline">Criar Vídeo</span>
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
          {isDeveloper && (
            <TabsTrigger value="conteudo-viral" className="gap-2">
              <Sparkles className="h-4 w-4 text-orange-500" />
              <span className="hidden sm:inline">Conteúdo Viral</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="posts" className="mt-4">
          <PostsTab />
        </TabsContent>
        <TabsContent value="artigos" className="mt-4">
          {/* Hub de conteúdo: Artigos (texto/carrossel) + Estúdio Viral (Reels). Componentes SEPARADOS. */}
          <Tabs defaultValue="escrever" className="w-full">
            <TabsList className="bg-muted/40">
              <TabsTrigger value="escrever" className="gap-2">
                <FileText className="h-4 w-4" /> Artigos
              </TabsTrigger>
              <TabsTrigger value="estudio" className="gap-2">
                <Flame className="h-4 w-4 text-orange-500" /> Estúdio Viral
              </TabsTrigger>
            </TabsList>
            <TabsContent value="escrever" className="mt-4">
              <AdminArtigos />
            </TabsContent>
            <TabsContent value="estudio" className="mt-4">
              <AdminEstudioViral />
            </TabsContent>
          </Tabs>
        </TabsContent>
        <TabsContent value="videos" className="mt-4">
          <AdminVideos />
        </TabsContent>
        <TabsContent value="criar-video" className="mt-4">
          <AdminCriarVideo />
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
        {isDeveloper && (
          <TabsContent value="conteudo-viral" className="mt-4">
            <ConteudoViralTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
