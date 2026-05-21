import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link2, Video, Clapperboard, Drama, Database, CalendarRange, Bot } from "lucide-react";
import { ConnectedAccounts } from "@/components/dashboard/ConnectedAccounts";
import AdminArtigos from "./AdminArtigos";
import AdminVideos from "./AdminVideos";
import AdminCriarVideo from "./AdminCriarVideo";
import AdminAvatares from "./AdminAvatares";
import AdminDocumentos from "./AdminDocumentos";
import PublicationCalendarTab from "@/components/admin/redes-sociais/PublicationCalendarTab";
import AutomacoesTab from "@/components/admin/redes-sociais/AutomacoesTab";

const VALID_TABS = ["calendario", "automacoes", "artigos", "videos", "criar-video", "personagens", "contas", "rag"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function AdminRedesSociais() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabValue)
    : "calendario";

  const handleTabChange = (value: string) => {
    if (value === "calendario") {
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
          <TabsTrigger value="calendario" className="gap-2">
            <CalendarRange className="h-4 w-4" />
            <span className="hidden sm:inline">Calendário</span>
          </TabsTrigger>
          <TabsTrigger value="automacoes" className="gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Automações</span>
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
        </TabsList>

        <TabsContent value="calendario" className="mt-4">
          <PublicationCalendarTab />
        </TabsContent>
        <TabsContent value="automacoes" className="mt-4">
          <AutomacoesTab />
        </TabsContent>
        <TabsContent value="artigos" className="mt-4">
          <AdminArtigos />
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
      </Tabs>
    </div>
  );
}
