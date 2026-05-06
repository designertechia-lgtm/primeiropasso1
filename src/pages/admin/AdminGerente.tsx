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

function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
      <h3 className="font-serif text-xl text-foreground">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      <p className="mt-4 text-xs uppercase tracking-wider text-muted-foreground/70">Em construção</p>
    </div>
  );
}

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
          <ComingSoon
            title="Visão Geral"
            description="KPIs do mês (MRR, assinantes ativos, churn, inadimplência), variação % vs período anterior, mini-gráfico de receita 90d e lista de itens que precisam de atenção."
          />
        </TabsContent>

        <TabsContent value="receita" className="mt-6">
          <ReceitaTab />
        </TabsContent>

        <TabsContent value="usuarios" className="mt-6">
          <ComingSoon
            title="Usuários"
            description="Volume de cadastros (trial vs pago), funil de ativação, segmentação heavy/médio/dormente e distribuição geográfica."
          />
        </TabsContent>

        <TabsContent value="engajamento" className="mt-6">
          <ComingSoon
            title="Engajamento"
            description="Posts publicados, vídeos gerados, distribuição reels/feed/carrossel, créditos consumidos por feature e top 10 usuários mais ativos."
          />
        </TabsContent>

        <TabsContent value="pix" className="mt-6">
          <PixPrecosTab />
        </TabsContent>

        <TabsContent value="feedback" className="mt-6">
          <ComingSoon
            title="Feedback"
            description="Sugestões e reclamações dos usuários em painel Kanban (novo / em análise / resolvido / arquivado), com resposta direta via WhatsApp e estimativa de NPS."
          />
        </TabsContent>

        <TabsContent value="acesso" className="mt-6">
          <ComingSoon
            title="Acesso"
            description="Lista de quem tem acesso ao painel, scopes liberados, formulário para conceder a novos usuários e botão para revogar. Audit log incluso."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
