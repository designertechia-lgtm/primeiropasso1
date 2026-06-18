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
  MessageCircle,
  Users,
  Bot,
  Video,
  Mic,
  Sparkles,
} from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useSubscription,
  useCreditBalance,
  useCreditLedger,
  useServicePricing,
  useCreditPacks,
  useSetMyAutoRenew,
} from "@/hooks/useBilling";
import { PixCheckoutModal } from "@/components/dashboard/PixCheckoutModal";
import { AsaasSubscribeDialog } from "@/components/dashboard/AsaasSubscribeDialog";
import { CreditCheckoutDialog } from "@/components/dashboard/CreditCheckoutDialog";
import { useProfessional } from "@/hooks/useProfessional";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  credit_card: "Cartão de crédito",
  pix: "PIX",
  boleto: "Boleto",
};

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

  const { data: professional } = useProfessional();

  const [pixOpen, setPixOpen] = useState(false);
  const [pixKind, setPixKind] = useState<"subscription_renewal" | "credit_pack">("subscription_renewal");
  const [pixRef, setPixRef] = useState<string | undefined>(undefined);
  const [pixLabel, setPixLabel] = useState("");
  const [pixAmount, setPixAmount] = useState("");
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [creditPack, setCreditPack] = useState<any | null>(null);

  const status = subscriptionStatus(sub);
  const StatusIcon = status.icon;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const billingExempt = !!(professional as any)?.billing_exempt;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sub as any;
  const hasAsaasSub = !!s?.asaas_subscription_id;

  const openRenewManual = () => {
    setPixKind("subscription_renewal");
    setPixRef(undefined);
    setPixLabel("Renovação da mensalidade");
    setPixAmount("R$ 349,00");
    setPixOpen(true);
  };

  // Abre o checkout Asaas do pacote; o fallback manual reabre o PixCheckoutModal.
  const openPack = (pack: any) => setCreditPack(pack);

  const openPackManual = (pack: any) => {
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

          {billingExempt ? (
            <div className="flex items-start gap-3 rounded-lg border bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900 p-3">
              <Sparkles className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Cortesia ativa</p>
                <p className="text-[11px] text-muted-foreground">
                  Sua conta está isenta de cobrança. Aproveite a plataforma sem mensalidade.
                </p>
              </div>
            </div>
          ) : hasAsaasSub ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
                <CreditCard className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Forma de pagamento:{" "}
                  <span className="font-medium text-foreground">
                    {PAYMENT_METHOD_LABEL[s?.payment_method] ?? "Configurada"}
                    {s?.payment_method === "credit_card" && s?.card_last4 ? ` •••• ${s.card_last4}` : ""}
                  </span>
                </span>
              </div>
              {s?.payment_method === "credit_card" ? (
                <p className="text-xs text-muted-foreground">
                  A mensalidade é debitada automaticamente todo mês.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Você recebe a cobrança mensal por {PAYMENT_METHOD_LABEL[s?.payment_method] ?? "PIX/boleto"} e paga a cada ciclo.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Button onClick={() => setSubscribeOpen(true)} className="gap-2">
                <CreditCard className="h-4 w-4" />
                Adicionar forma de pagamento
              </Button>
              <button
                type="button"
                onClick={openRenewManual}
                className="block text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Prefiro renovar via PIX manual (enviar comprovante)
              </button>
            </div>
          )}

          {!billingExempt && <AutoRenewSection autoRenew={!!sub?.auto_renew} />}
        </CardContent>
      </Card>

      {/* ── Card 1.5: Benefícios da Assinatura ──────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="h-5 w-5 text-primary" />
            Benefícios da Assinatura
          </CardTitle>
          <CardDescription>
            O que está incluso no seu plano e o que é cobrado por créditos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Incluso na assinatura */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="h-4 w-4" /> Incluso na sua assinatura
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex gap-3 p-3 rounded-lg border bg-green-50 dark:bg-green-950/20">
                <MessageCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Agente WhatsApp</p>
                  <p className="text-xs text-muted-foreground">
                    Atendimento automatizado 24/7 para seus pacientes via WhatsApp.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-lg border bg-green-50 dark:bg-green-950/20">
                <Users className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Funil de Clientes (CRM)</p>
                  <p className="text-xs text-muted-foreground">
                    Kanban completo para gerenciar leads, agendamentos e relacionamento.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-lg border bg-green-50 dark:bg-green-950/20">
                <Bot className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Agentes de Texto</p>
                  <p className="text-xs text-muted-foreground">
                    IA para criar artigos, posts, respostas e textos institucionais.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-lg border bg-green-50 dark:bg-green-950/20">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Agenda + Site Profissional</p>
                  <p className="text-xs text-muted-foreground">
                    Landing page personalizada, agendamento online e área do paciente.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Cobrado por créditos */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5 text-amber-600">
              <Zap className="h-4 w-4" /> Cobrado por créditos (uso sob demanda)
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Recursos de IA premium são cobrados por uso para que você só pague pelo que utiliza.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex gap-3 p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/20">
                <Video className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Criação de Vídeos com IA</p>
                  <p className="text-xs text-muted-foreground">
                    Geração de vídeos com motores premium de IA.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-lg border bg-amber-50 dark:bg-amber-950/20">
                <Mic className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Voz Sintética (ElevenLabs)</p>
                  <p className="text-xs text-muted-foreground">
                    Narração profissional com vozes realistas para seus vídeos.
                  </p>
                </div>
              </div>
            </div>
          </div>
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

      {/* Assinatura recorrente via Asaas (cartão/PIX/boleto) */}
      <AsaasSubscribeDialog open={subscribeOpen} onOpenChange={setSubscribeOpen} />

      {/* Checkout de créditos via Asaas (com fallback PIX manual) */}
      <CreditCheckoutDialog
        open={!!creditPack}
        onOpenChange={(v) => !v && setCreditPack(null)}
        pack={creditPack}
        onManualFallback={() => { if (creditPack) openPackManual(creditPack); }}
      />

      {/* PIX Modal (fallback manual) */}
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

function AutoRenewSection({ autoRenew }: { autoRenew: boolean }) {
  const setAutoRenew = useSetMyAutoRenew();

  const handleToggle = async (next: boolean) => {
    try {
      await setAutoRenew.mutateAsync(next);
      toast.success(
        next
          ? "Auto-renovação ativada"
          : "Auto-renovação desativada — você precisará renovar manualmente",
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar");
    }
  };

  return (
    <div className="mt-2 flex items-start gap-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900 p-3">
      <RefreshCw className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
      <div className="flex-1 space-y-1">
        <div className="flex items-center justify-between">
          <Label htmlFor="auto_renew_page_toggle" className="text-sm font-medium cursor-pointer">
            Renovação automática
          </Label>
          <Switch
            id="auto_renew_page_toggle"
            checked={autoRenew}
            disabled={setAutoRenew.isPending}
            onCheckedChange={handleToggle}
          />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {autoRenew
            ? "Ativa: 5 dias antes do vencimento, você recebe um WhatsApp com a próxima cobrança PIX já preparada (com QR e valor)."
            : "Inativa: você precisa lembrar de pagar a renovação manualmente todo mês."}
        </p>
      </div>
    </div>
  );
}
