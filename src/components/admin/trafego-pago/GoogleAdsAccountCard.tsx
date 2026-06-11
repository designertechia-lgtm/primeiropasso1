import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import {
  ShieldCheck,
  Loader2,
  Mail,
  CreditCard,
  ExternalLink,
  CheckCircle2,
  PlusCircle,
} from "lucide-react";
import type { AdsAccount } from "./types";

// Hook compartilhado: status da sub-conta Google Ads (usado pelo card e pelo editor)
export function useAdsAccountStatus() {
  return useQuery({
    queryKey: ["ads-account-status"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("google-ads-proxy", {
        body: { action: "status" },
      });
      if (error) throw error;
      return data as { credenciais_ok: boolean; conta: AdsAccount | null };
    },
    staleTime: 60_000,
  });
}

function formatCustomerId(id: string | null): string {
  if (!id || id.length !== 10) return id ?? "—";
  return `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6)}`;
}

async function callProxy(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("google-ads-proxy", {
    body: { action, ...extra },
  });
  if (error) {
    // supabase-js embute a resposta de erro em error.context
    let detail: any = null;
    try { detail = await (error as any).context?.json?.(); } catch { /* ignore */ }
    throw new Error(detail?.mensagem ?? detail?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.mensagem ?? data.error);
  return data;
}

export default function GoogleAdsAccountCard() {
  const qc = useQueryClient();
  const { data, isLoading } = useAdsAccountStatus();
  const [busy, setBusy] = useState<string | null>(null);

  const conta = data?.conta ?? null;

  async function run(label: string, action: string, extra: Record<string, unknown> = {}, successMsg?: string) {
    setBusy(label);
    try {
      const res = await callProxy(action, extra);
      if (successMsg) toast.success(successMsg);
      qc.invalidateQueries({ queryKey: ["ads-account-status"] });
      return res;
    } catch (e: any) {
      toast.error("Google Ads", { description: e.message });
    } finally {
      setBusy(null);
    }
  }

  if (isLoading) return null;

  // ── Conectada: faixa compacta ──────────────────────────────
  if (conta?.status === "active") {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>
          Conta Google Ads conectada · ID <span className="font-mono font-medium">{formatCustomerId(conta.external_customer_id)}</span> · cartão configurado
        </span>
      </div>
    );
  }

  // ── Criada, aguardando convite/cartão: checklist ───────────
  if (conta?.external_customer_id) {
    return (
      <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10">
        <CardContent className="pt-4 pb-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CreditCard className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            Sua conta Google Ads foi criada (ID {formatCustomerId(conta.external_customer_id)}) — faltam 2 passos
          </div>
          <ol className="space-y-2 text-xs text-muted-foreground">
            <li className="flex items-start gap-2">
              <Mail className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">1. Aceite o convite</span> que enviamos
                {conta.invited_email ? <> para <span className="font-medium">{conta.invited_email}</span></> : null}
                {" "}(procure por "Google Ads" no e-mail).{" "}
                <button
                  type="button"
                  className="underline"
                  disabled={busy !== null}
                  onClick={() => run("convite", "convidar_usuario", {}, "Convite enviado! Confira o e-mail.")}
                >
                  {busy === "convite" ? "Enviando…" : conta.invited_email ? "Reenviar convite" : "Enviar convite"}
                </button>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CreditCard className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <span className="font-medium text-foreground">2. Cadastre seu cartão</span> em{" "}
                <a href="https://ads.google.com" target="_blank" rel="noreferrer" className="underline inline-flex items-center gap-0.5">
                  ads.google.com <ExternalLink className="h-3 w-3" />
                </a>{" "}
                → Faturamento. O pagamento da mídia vai direto pro Google, no seu cartão — a plataforma nunca acessa esse valor.
              </span>
            </li>
          </ol>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() => run("billing", "confirmar_billing", {}, "Conta ativa! Agora você pode publicar campanhas pela plataforma.")}
          >
            {busy === "billing" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Já cadastrei o cartão
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Sem conta ainda: oferta de criação ─────────────────────
  return (
    <Card>
      <CardContent className="pt-4 pb-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-2 flex-1">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">Conecte sua conta Google Ads</p>
            <p className="mt-0.5">
              Criamos uma conta Google Ads sua, dentro da nossa estrutura de agência. O cartão e o
              orçamento ficam 100% com você, direto no Google — e a plataforma publica e acompanha as
              campanhas por aqui.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5 shrink-0"
          disabled={busy !== null}
          onClick={() => run("criar", "criar_subconta", {}, "Conta criada! Siga os passos pra ativá-la.")}
        >
          {busy === "criar" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
          Criar minha conta Google Ads
        </Button>
      </CardContent>
    </Card>
  );
}
