import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LayoutDashboard,
  TrendingUp,
  Users,
  Activity,
  Banknote,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import ReceitaTab from "@/components/admin-gerente/ReceitaTab";
import PixPrecosTab from "@/components/admin-gerente/PixPrecosTab";
import UsuariosTab from "@/components/admin-gerente/UsuariosTab";
import EngajamentoTab from "@/components/admin-gerente/EngajamentoTab";
import OverviewTab from "@/components/admin-gerente/OverviewTab";
import FeedbackTab from "@/components/admin-gerente/FeedbackTab";
import AcessoTab from "@/components/admin-gerente/AcessoTab";

const VALID_TABS = [
  "overview",
  "receita",
  "usuarios",
  "engajamento",
  "pix",
  "feedback",
  "acesso",
] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function AdminGerente() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabValue)
    : "overview";

  const handleTabChange = (value: string) => {
    if (value === "overview") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-serif text-3xl text-foreground">Painel do Gerente</h1>
        <p className="text-sm text-muted-foreground">
          Métricas, receita, usuários e configurações do SaaS — visível apenas para você e usuários liberados.
        </p>
        {user?.email && (
          <p className="text-xs text-muted-foreground/70">Logado como {user.email}</p>
        )}
      </header>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="overview" className="gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Visão Geral</span>
          </TabsTrigger>
          <TabsTrigger value="receita" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Receita</span>
          </TabsTrigger>
          <TabsTrigger value="usuarios" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Usuários</span>
          </TabsTrigger>
          <TabsTrigger value="engajamento" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Engajamento</span>
          </TabsTrigger>
          <TabsTrigger value="pix" className="gap-2">
            <Banknote className="h-4 w-4" />
            <span className="hidden sm:inline">PIX & Preços</span>
          </TabsTrigger>
          <TabsTrigger value="feedback" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Feedback</span>
          </TabsTrigger>
          <TabsTrigger value="acesso" className="gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Acesso</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="receita" className="mt-6">
          <ReceitaTab />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <UsuariosTab />
        </TabsContent>

        <TabsContent value="engajamento" className="mt-6">
          <EngajamentoTab />
        </TabsContent>

        <TabsContent value="pix" className="mt-6">
          <PixPrecosTab />
        </TabsContent>

        <TabsContent value="feedback" className="mt-6">
          <FeedbackTab />
        </TabsContent>

        <TabsContent value="acesso" className="mt-6">
          <AcessoTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
