import { useSearchParams, Link } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TrendingUp, Facebook, BarChart2, Coins } from "lucide-react";
import { useCreditBalance } from "@/hooks/useBilling";
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
          <GoogleAdsTab creditBalance={balance} />
        </TabsContent>

        <TabsContent value="meta" className="mt-4">
          <MetaAdsTab creditBalance={balance} />
        </TabsContent>

        <TabsContent value="relatorios" className="mt-4">
          <RelatoriosTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

