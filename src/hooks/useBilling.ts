import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";

export function useSubscription() {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["subscription", professional?.id],
    enabled: !!professional?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("professional_id", professional!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSetMyAutoRenew() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("set_my_auto_renew", {
        p_enabled: enabled,
      });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] });
      qc.invalidateQueries({ queryKey: ["owner-list-all-users"] });
    },
  });
}

// Sem argumento: saldo do profissional logado (uso comum).
// Com professionalId: saldo de outro profissional (super-admin lendo saldo alheio).
export function useCreditBalance(professionalIdOverride?: string | null) {
  const { data: professional } = useProfessional();
  const professionalId = professionalIdOverride ?? professional?.id ?? null;
  return useQuery({
    queryKey: ["credit-balance", professionalId],
    enabled: !!professionalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_balance")
        .select("balance, total_uses, last_purchase_at")
        .eq("professional_id", professionalId!)
        .maybeSingle();
      if (error) throw error;
      return data ?? { balance: 0, total_uses: 0, last_purchase_at: null };
    },
  });
}

export function useCreditLedger(limit = 50) {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["credit-ledger", professional?.id, limit],
    enabled: !!professional?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_ledger")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useServicePricing() {
  return useQuery({
    queryKey: ["service-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_pricing")
        .select("*")
        .eq("active", true)
        .order("base_cost_brl");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreditPacks() {
  return useQuery({
    queryKey: ["credit-packs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("credit_packs")
        .select("*")
        .eq("active", true)
        .order("price_brl");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePixSettings() {
  return useQuery({
    queryKey: ["pix-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pix_settings")
        .select("*")
        .eq("id", "main")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useMyPayments() {
  const { data: professional } = useProfessional();
  return useQuery({
    queryKey: ["my-payments", professional?.id],
    enabled: !!professional?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pix_payments")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreatePixPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { kind: "subscription_renewal" | "credit_pack"; reference_id?: string }) => {
      const { data, error } = await supabase.functions.invoke("create-pix-payment", {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as {
        payment_id: string;
        amount_brl: number;
        kind: string;
        expires_at: string;
        pix: {
          pix_key: string;
          pix_key_type: string;
          beneficiary_name: string;
          bank_name: string;
          instructions: string | null;
        } | null;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-payments"] });
    },
  });
}

export function useSubmitPaymentProof() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId, file }: { paymentId: string; file: File }) => {
      const form = new FormData();
      form.append("payment_id", paymentId);
      form.append("file", file);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Não autenticado");

      const supabaseUrl = (supabase as unknown as { supabaseUrl: string }).supabaseUrl
        ?? import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/submit-payment-proof`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao enviar comprovante");
      return json;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-payments"] });
    },
  });
}
