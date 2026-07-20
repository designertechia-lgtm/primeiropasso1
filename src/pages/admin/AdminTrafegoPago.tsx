import { useSearchParams, Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TrendingUp, Facebook, BarChart2, Coins, Dna } from "lucide-react";
import { useCreditBalance } from "@/hooks/useBilling";
import { useProfessional } from "@/hooks/useProfessional";
import { hasDna } from "@/lib/onboardingGate";
import GoogleAdsTab from "@/components/admin/trafego-pago/GoogleAdsTab";
import MetaAdsTab from "@/components/admin/trafego-pago/MetaAdsTab";
import RelatoriosTab from "@/components/admin/trafego-pago/RelatoriosTab";

const VALID_TABS = ["google", "meta", "relatorios"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function AdminTrafegoPago() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabValue)
    : "google";

  const handleTabChange = (value: string) => {
    if (value === "google") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  const { data: creditData } = useCreditBalance();
  const balance = creditData?.balance ?? 0;

  // Gate progressivo: campanha nasce do DNA da Marca (a edge recusa sem ele — este banner é a
  // versão amigável). Campanhas antigas continuam visíveis; só a CRIAÇÃO fica bloqueada.
  // Enquanto o professional carrega, NÃO é "sem DNA": mostrar o gate nesse instante seria
  // flash de bloqueio pra usuário que tem DNA (a edge segura o caso raro do clique precoce).
  const { data: professional, isPending: profPending } = useProfessional();
  const dnaOk = profPending ? true : hasDna(professional);

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-primary" />
            Tráfego Pago
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Crie campanhas Google Ads e Meta Ads com ajuda da IA, e acompanhe o funil completo até o agendamento.
          </p>
        </div>

        {/* Saldo de créditos */}
        <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-4 py-2 border">
          <Coins className="h-4 w-4 text-yellow-500" />
          <div className="text-sm">
            <span className="font-semibold">{balance}</span>
            <span className="text-muted-foreground ml-1">crédito{balance !== 1 ? "s" : ""}</span>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/assinatura">Recarregar</Link>
          </Button>
        </div>
      </div>

      {!dnaOk && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <Dna className="h-5 w-5 shrink-0 text-primary" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-foreground">Crie seu DNA da Marca para gerar campanhas</p>
            <p className="text-xs text-muted-foreground">
              A IA monta anúncios com o seu posicionamento, público e voz — tudo isso vem do DNA.
            </p>
          </div>
          <Button size="sm" asChild>
            <Link to="/admin/landing?tab=dna">Criar meu DNA</Link>
          </Button>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="flex w-full flex-wrap h-auto justify-start gap-1 bg-muted/50 p-1">
          <TabsTrigger value="google" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Google Ads</span>
          </TabsTrigger>
          <TabsTrigger value="meta" className="gap-2">
            <Facebook className="h-4 w-4" />
            <span className="hidden sm:inline">Meta Ads</span>
          </TabsTrigger>
          <TabsTrigger value="relatorios" className="gap-2">
            <BarChart2 className="h-4 w-4" />
            <span className="hidden sm:inline">Relatórios</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="google" className="mt-4">
          <GoogleAdsTab creditBalance={balance} dnaOk={dnaOk} />
        </TabsContent>

        <TabsContent value="meta" className="mt-4">
          <MetaAdsTab creditBalance={balance} dnaOk={dnaOk} />
        </TabsContent>

        <TabsContent value="relatorios" className="mt-4">
          <RelatoriosTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

