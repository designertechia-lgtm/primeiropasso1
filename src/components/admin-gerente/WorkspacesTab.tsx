// Aba "Workspaces" — painel de manutenção conta-a-conta, exclusivo do desenvolvedor
// (designertech.ia). Layout mestre-detalhe: lista de contas à esquerda, snapshot de
// saúde + ações de manutenção à direita. Não troca de login (sem impersonation);
// tudo via RPCs owner_* que rodam como super-admin.
import { useMemo, useState, useEffect } from "react";
import {
  useOwnerListAllUsers,
  useOwnerWorkspaceDetail,
  useOwnerCancelSubscription,
  useOwnerSetBillingExempt,
  type OwnerUserRow,
} from "@/hooks/useOwnerStats";
import {
  GrantSubscriptionDialog,
  GrantCreditsDialog,
  DeleteProfessionalDialog,
} from "./ownerUserDialogs";
import { useImpersonation } from "@/hooks/useImpersonation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Search,
  Users,
  CheckCircle2,
  XCircle,
  ExternalLink,
  LogIn,
  Gift,
  Coins,
  Trash2,
  MessageSquare,
  CalendarDays,
  UserPlus,
  Image as ImageIcon,
  Wallet,
  UserCircle,
  Link2,
  Smartphone,
  CalendarClock,
  Briefcase,
  Globe,
} from "lucide-react";
import { toast } from "sonner";

function statusBadge(row: OwnerUserRow) {
  if (row.cancelled_at) return <Badge variant="outline" className="text-muted-foreground">Cancelada</Badge>;
  if (!row.current_period_end) return <Badge variant="outline" className="text-muted-foreground">Sem assinatura</Badge>;
  const days = row.days_until_expiry ?? 0;
  if (days < 0) return <Badge variant="destructive">Vencida há {Math.abs(days)}d</Badge>;
  if (days === 0) return <Badge className="bg-amber-500 hover:bg-amber-500">Vence hoje</Badge>;
  if (days <= 5) return <Badge className="bg-amber-500 hover:bg-amber-500">{days}d restantes</Badge>;
  return <Badge className="bg-emerald-500 hover:bg-emerald-500">{days}d ativos</Badge>;
}

function ChecklistItem({
  ok,
  label,
  icon: Icon,
}: {
  ok: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm">{label}</span>
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
      )}
    </div>
  );
}

function CounterStat({
  value,
  label,
  icon: Icon,
}: {
  value: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <Icon className="h-4 w-4 text-primary shrink-0" />
      <div className="leading-tight">
        <p className="text-base font-semibold tabular-nums">{Number(value ?? 0).toLocaleString("pt-BR")}</p>
        <p className="text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function WorkspaceDetailPanel({ row }: { row: OwnerUserRow }) {
  const { data: detail, isLoading } = useOwnerWorkspaceDetail(row.professional_id);
  const cancel = useOwnerCancelSubscription();
  const setExempt = useOwnerSetBillingExempt();
  const { enterImpersonation, isBusy: impersonationBusy } = useImpersonation();

  const [grantOpen, setGrantOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const landingUrl = row.slug ? `${window.location.origin}/${row.slug}` : null;

  const handleCancel = async () => {
    if (!confirm(`Cancelar assinatura de ${row.full_name ?? row.email}?`)) return;
    try {
      const affected = await cancel.mutateAsync(row.professional_id);
      if (affected > 0) toast.success("Assinatura cancelada");
      else toast.info("Nenhuma assinatura ativa para cancelar");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao cancelar");
    }
  };

  const handleToggleExempt = async (next: boolean) => {
    try {
      await setExempt.mutateAsync({ professional_id: row.professional_id, exempt: next });
      toast.success(
        next
          ? `${row.full_name ?? row.email} agora está em cortesia (isento de cobrança)`
          : `Cobrança reativada para ${row.full_name ?? row.email}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao alterar cobrança");
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {row.full_name ?? "Sem nome"} {statusBadge(row)}
            </CardTitle>
            <CardDescription className="space-y-0.5">
              <span className="block">{row.email}</span>
              <span className="block text-xs">
                {row.slug ? `/${row.slug}` : "sem slug"} · {row.whatsapp ?? "sem WhatsApp"}
              </span>
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {landingUrl && (
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={landingUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" /> Abrir landing
                </a>
              </Button>
            )}
            <Button
              size="sm"
              className="gap-1.5"
              disabled={impersonationBusy}
              onClick={() => enterImpersonation(row.user_id, row.full_name ?? row.email)}
              title="Entrar no painel deste profissional como ele (editar landing, usar o chat do Axel como ele)"
            >
              {impersonationBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
              Entrar no painel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading || !detail ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Checklist de configuração */}
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Configuração da conta
              </h4>
              <div className="grid gap-2 sm:grid-cols-2">
                <ChecklistItem ok={detail.has_profile} label="Perfil completo (nome, foto, bio)" icon={UserCircle} />
                <ChecklistItem ok={detail.has_slug} label="Endereço (slug) definido" icon={Link2} />
                <ChecklistItem ok={detail.landing_published} label="Landing publicada" icon={Globe} />
                <ChecklistItem ok={detail.whatsapp_connected} label="WhatsApp conectado (Evolution)" icon={Smartphone} />
                <ChecklistItem ok={detail.has_availability} label="Agenda configurada" icon={CalendarClock} />
                <ChecklistItem ok={detail.has_services} label="Serviços / preço definidos" icon={Briefcase} />
              </div>
            </div>

            {/* Contadores de uso */}
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Uso
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                <CounterStat value={detail.posts_count} label="Posts" icon={ImageIcon} />
                <CounterStat value={detail.leads_count} label="Leads" icon={UserPlus} />
                <CounterStat value={detail.appointments_count} label="Agendamentos" icon={CalendarDays} />
                <CounterStat value={detail.messages_count} label="Mensagens" icon={MessageSquare} />
                <CounterStat value={detail.credit_balance} label="Créditos" icon={Wallet} />
              </div>
            </div>

            {/* Cobrança */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={row.billing_exempt}
                  disabled={setExempt.isPending}
                  onCheckedChange={handleToggleExempt}
                  title="Cortesia: isenta este profissional da cobrança"
                />
                <span className="text-sm">
                  {row.billing_exempt ? "Em cortesia (isento)" : "Cobrança ativa"}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {row.current_period_end
                  ? `Vence em ${new Date(row.current_period_end).toLocaleDateString("pt-BR")}`
                  : "Sem período de assinatura"}
              </span>
            </div>

            {/* Ações de manutenção */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setGrantOpen(true)}>
                <Gift className="h-4 w-4 text-emerald-600" /> Liberar dias
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setCreditOpen(true)}>
                <Coins className="h-4 w-4 text-amber-600" /> Adicionar créditos
              </Button>
              {!row.cancelled_at && row.current_period_end && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCancel}>
                  <XCircle className="h-4 w-4 text-destructive" /> Cancelar assinatura
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> Apagar conta
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <GrantSubscriptionDialog user={grantOpen ? row : null} open={grantOpen} onClose={() => setGrantOpen(false)} />
      <GrantCreditsDialog user={creditOpen ? row : null} open={creditOpen} onClose={() => setCreditOpen(false)} />
      <DeleteProfessionalDialog user={deleteOpen ? row : null} open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </Card>
  );
}

export default function WorkspacesTab() {
  const { data, isLoading } = useOwnerListAllUsers();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? "").toLowerCase().includes(q) ||
        (u.slug ?? "").toLowerCase().includes(q),
    );
  }, [data, search]);

  // Seleciona a primeira conta automaticamente assim que a lista carrega.
  useEffect(() => {
    if (!selectedId && filtered.length > 0) setSelectedId(filtered[0].professional_id);
  }, [filtered, selectedId]);

  const selected = useMemo(
    () => (data ?? []).find((u) => u.professional_id === selectedId) ?? null,
    [data, selectedId],
  );

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <div>
        <h2 className="font-heading text-2xl text-foreground">Workspaces</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Manutenção conta-a-conta: veja o estado de configuração de cada profissional e ajude a
          completar/consertar a conta. Visível apenas para a conta de desenvolvedor.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Lista de contas */}
        <Card className="lg:col-span-1 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" /> Contas
              {data && <span className="text-xs font-normal text-muted-foreground">({data.length})</span>}
            </CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, email ou slug…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {search ? "Nenhuma conta encontrada." : "Nenhum profissional cadastrado."}
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/40">
                {filtered.map((u) => {
                  const active = u.professional_id === selectedId;
                  return (
                    <button
                      key={u.professional_id}
                      onClick={() => setSelectedId(u.professional_id)}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors ${
                        active ? "bg-primary/10" : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{u.full_name ?? "Sem nome"}</p>
                        <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      {statusBadge(u)}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detalhe do workspace */}
        <div className="lg:col-span-2">
          {selected ? (
            <WorkspaceDetailPanel key={selected.professional_id} row={selected} />
          ) : (
            <Card className="border-border/50 border-dashed">
              <CardContent className="flex h-48 items-center justify-center">
                <p className="text-sm text-muted-foreground">Selecione uma conta à esquerda.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
