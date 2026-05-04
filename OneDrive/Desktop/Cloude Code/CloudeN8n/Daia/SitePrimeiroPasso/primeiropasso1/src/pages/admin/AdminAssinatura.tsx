import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CreditCard,
  Zap,
  History,
  Tag,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Package,
  Loader2,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useSubscription,
  useCreditBalance,
  useCreditLedger,
  useServicePricing,
  useCreditPacks,
} from "@/hooks/useBilling";
import { PixCheckoutModal } from "@/components/dashboard/PixCheckoutModal";

/* ── helpers ─────────────────────────────────────────── */

function subscriptionStatus(sub: any) {
  if (!sub) return { label: "Sem assinatura", color: "text-muted-foreground", icon: XCircle, variant: "outline" as const };
  const daysLeft = sub.current_period_end
    ? differenceInDays(parseISO(sub.current_period_end), new Date())
    : null;
  if (sub.status === "expired" || (daysLeft !== null && daysLeft < 0))
    return { label: "Vencida", color: "text-red-500", icon: XCircle, variant: "destructive" as const };
  if (daysLeft !== null && daysLeft <= 5)
    return { label: `Vence em ${daysLeft} dia${daysLeft === 1 ? "" : "s"}`, color: "text-yellow-500", icon: AlertTriangle, variant: "secondary" as const };
  if (sub.status === "active")
    return { label: "Ativa", color: "text-green-500", icon: CheckCircle2, variant: "default" as const };
  if (sub.status === "trial")
    return { label: "Período de teste", color: "text-blue-500", icon: Zap, variant: "secondary" as const };
  return { label: sub.status, color: "text-muted-foreground", icon: CreditCard, variant: "outline" as const };
}

const LEDGER_TYPE_MAP: Record<string, { label: string; className: string }> = {
  purchase:   { label: "Compra",     className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  usage:      { label: "Uso",        className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  bonus:      { label: "Bônus",      className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  adjustment: { label: "Ajuste",     className: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  refund:     { label: "Reembolso",  className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
};

const UNIT_LABEL: Record<string, string> = {
  char: "caractere",
  second: "segundo",
  video_5s: "vídeo 5s",
  video_10s: "vídeo 10s",
};

/* ── main component ──────────────────────────────────── */

export default function AdminAssinatura() {
  const { data: sub, isLoading: loadingSub } = useSubscription();
  const { data: bal, isLoading: loadingBal } = useCreditBalance();
  const { data: ledger, isLoading: loadingLedger } = useCreditLedger(50);
  const { data: pricing, isLoading: loadingPricing } = useServicePricing();
  const { data: packs, isLoading: loadingPacks } = useCreditPacks();

  const [pixOpen, setPixOpen] = useState(false);
  const [pixKind, setPixKind] = useState<"subscription_renewal" | "credit_pack">("subscription_renewal");
  const [pixRef, setPixRef] = useState<string | undefined>(undefined);
  const [pixLabel, setPixLabel] = useState("");
  const [pixAmount, setPixAmount] = useState("");

  const status = subscriptionStatus(sub);
  const StatusIcon = status.icon;

  const openRenew = () => {
    setPixKind("subscription_renewal");
    setPixRef(undefined);
    setPixLabel("Renovação da mensalidade");
    setPixAmount("R$ 349,00");
    setPixOpen(true);
  };

  const openPack = (pack: any) => {
    setPixKind("credit_pack");
    setPixRef(pack.id);
    setPixLabel(`Recarga de créditos — ${pack.name}`);
    setPixAmount(
      pack.price_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    );
    setPixOpen(true);
  };

  const isLoading = loadingSub || loadingBal || loadingLedger || loadingPricing || loadingPacks;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Carregando dados de assinatura…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Assinatura & Créditos</h1>
        <p className="text-muted-foreground mt-1">
          Gerencie seu plano, saldo de créditos e pagamentos.
        </p>
      </div>

      {/* ── Card 1: Mensalidade ────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <CreditCard className="h-5 w-5" />
              Mensalidade
            </CardTitle>
            <CardDescription>Plano PrimeiroPasso — R$ 349/mês</CardDescription>
          </div>
          <Badge variant={status.variant} className="flex items-center gap-1.5 text-sm px-3 py-1">
            <StatusIcon className={`h-3.5 w-3.5 ${status.color}`} />
            {status.label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {sub?.current_period_end && (
            <p className="text-sm text-muted-foreground">
              {differenceInDays(parseISO(sub.current_period_end), new Date()) < 0
                ? "Venceu em "
                : "Renova em "}
              <span className="font-medium text-foreground">
                {format(parseISO(sub.current_period_end), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </span>
            </p>
          )}
          <Button onClick={openRenew} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Renovar agora via PIX
          </Button>
        </CardContent>
      </Card>

      {/* ── Card 2: Saldo de Créditos ──────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Zap className="h-5 w-5" />
            Saldo de Créditos
          </CardTitle>
          <CardDescription>1 crédito = R$ 1,00</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold">{bal?.balance ?? 0}</span>
            <span className="text-lg text-muted-foreground">créditos</span>
            <span className="text-sm text-muted-foreground ml-auto">
              ({(bal?.balance ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})
            </span>
          </div>

          {bal?.last_purchase_at && (
            <p className="text-xs text-muted-foreground">
              Última recarga: {format(parseISO(bal.last_purchase_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          )}

          <Separator />

          <div>
            <p className="text-sm font-medium mb-3 flex items-center gap-1.5">
              <Package className="h-4 w-4" /> Pacotes de Recarga
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(packs ?? []).map((pack: any) => (
                <button
                  key={pack.id}
                  onClick={() => openPack(pack)}
                  className="group relative rounded-xl border bg-card p-4 text-left transition-all hover:border-primary hover:shadow-md"
                >
                  <p className="font-semibold text-base">
                    {pack.price_brl.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {pack.credits} créditos
                  </p>
                  {pack.bonus_credits > 0 && (
                    <Badge variant="secondary" className="absolute -top-2 -right-2 text-xs">
                      +{pack.bonus_credits} bônus
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 3: Histórico de uso ───────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <History className="h-5 w-5" />
            Histórico de Movimentações
          </CardTitle>
          <CardDescription>Últimas 50 movimentações</CardDescription>
        </CardHeader>
        <CardContent>
          {(ledger ?? []).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhuma movimentação registrada.
            </p>
          ) : (
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Créditos</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(ledger ?? []).map((entry: any) => {
                    const t = LEDGER_TYPE_MAP[entry.type] ?? { label: entry.type, className: "bg-gray-100 text-gray-800" };
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(parseISO(entry.created_at), "dd/MM/yy HH:mm")}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${t.className}`}>
                            {t.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">
                          {entry.description || "—"}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${entry.amount >= 0 ? "text-green-600" : "text-red-500"}`}>
                          {entry.amount >= 0 ? "+" : ""}{entry.amount}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Card 4: Tabela de preços ───────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Tag className="h-5 w-5" />
            Tabela de Preços
          </CardTitle>
          <CardDescription>Serviços de IA pagos por crédito</CardDescription>
        </CardHeader>
        <CardContent>
          {(pricing ?? []).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              Nenhum serviço cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serviço</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right">Preço (créditos)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(pricing ?? []).map((svc: any) => {
                  const price = svc.base_cost_brl * (1 + svc.markup_pct / 100);
                  return (
                    <TableRow key={svc.service_key}>
                      <TableCell className="font-medium">{svc.display_name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        por {UNIT_LABEL[svc.unit] ?? svc.unit}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {Math.ceil(price)} crédito{Math.ceil(price) > 1 ? "s" : ""}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {(pricing ?? []).length > 0 && pricing?.[0]?.updated_at && (
            <p className="text-xs text-muted-foreground mt-3 text-right">
              Atualizado em {format(parseISO(pricing[0].updated_at), "dd/MM/yyyy")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* PIX Modal */}
      <PixCheckoutModal
        open={pixOpen}
        onOpenChange={setPixOpen}
        kind={pixKind}
        referenceId={pixRef}
        label={pixLabel}
        amountLabel={pixAmount}
      />
    </div>
  );
}
