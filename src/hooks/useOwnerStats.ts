import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type SubscriptionBucket = "on_time" | "late" | "overdue" | "cancelled" | "trial" | "no_period";

export interface MrrPoint {
  month_start: string;
  mrr_brl: number;
  active_count: number;
}

export interface StatusBucket {
  status: SubscriptionBucket | string;
  count: number;
  total_brl: number;
}

export interface OverdueSubscriber {
  professional_id: string;
  full_name: string | null;
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  monthly_price_brl: number;
  current_period_end: string;
  days_overdue: number;
  status: string;
}

export type PixSettings = Database["public"]["Tables"]["pix_settings"]["Row"];
export type CreditPack = Database["public"]["Tables"]["credit_packs"]["Row"];
export type CreditPackInsert = Database["public"]["Tables"]["credit_packs"]["Insert"];
export type ServicePricing = Database["public"]["Tables"]["service_pricing"]["Row"];
export type ServicePricingInsert = Database["public"]["Tables"]["service_pricing"]["Insert"];

export function useOwnerMrr(monthsBack = 12) {
  return useQuery({
    queryKey: ["owner-mrr", monthsBack],
    queryFn: async (): Promise<MrrPoint[]> => {
      const { data, error } = await supabase.rpc("owner_mrr_monthly", { months_back: monthsBack });
      if (error) throw error;
      return (data ?? []) as MrrPoint[];
    },
  });
}

export function useOwnerSubscriptionStatus(graceDays = 5) {
  return useQuery({
    queryKey: ["owner-sub-status", graceDays],
    queryFn: async (): Promise<StatusBucket[]> => {
      const { data, error } = await supabase.rpc("owner_subscription_status", { grace_days: graceDays });
      if (error) throw error;
      return (data ?? []) as StatusBucket[];
    },
  });
}

export function useOwnerOverdueSubscribers(graceDays = 0) {
  return useQuery({
    queryKey: ["owner-overdue", graceDays],
    queryFn: async (): Promise<OverdueSubscriber[]> => {
      const { data, error } = await supabase.rpc("owner_overdue_subscribers", { grace_days: graceDays });
      if (error) throw error;
      return (data ?? []) as OverdueSubscriber[];
    },
  });
}

export function useOwnerPixSettings() {
  return useQuery({
    queryKey: ["owner-pix-settings"],
    queryFn: async (): Promise<PixSettings | null> => {
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

export function useUpdatePixSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: { pix_key: string; pix_key_type: string; beneficiary_name: string; bank_name?: string | null; instructions?: string | null }) => {
      const payload = { id: "main", ...patch, updated_at: new Date().toISOString() };
      const { error } = await supabase.from("pix_settings").upsert(payload);
      if (error) throw error;
      return payload;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-pix-settings"] }),
  });
}

export function useOwnerCreditPacks() {
  return useQuery({
    queryKey: ["owner-credit-packs"],
    queryFn: async (): Promise<CreditPack[]> => {
      const { data, error } = await supabase.from("credit_packs").select("*").order("price_brl");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertCreditPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pack: CreditPackInsert) => {
      const { error } = await supabase.from("credit_packs").upsert(pack);
      if (error) throw error;
      return pack;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-credit-packs"] }),
  });
}

export function useDeleteCreditPack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("credit_packs").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-credit-packs"] }),
  });
}

export function useOwnerServicePricing() {
  return useQuery({
    queryKey: ["owner-service-pricing"],
    queryFn: async (): Promise<ServicePricing[]> => {
      const { data, error } = await supabase.from("service_pricing").select("*").order("display_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertServicePricing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: ServicePricingInsert) => {
      const { error } = await supabase.from("service_pricing").upsert({
        ...row,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      return row;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-service-pricing"] }),
  });
}

// ── Fatia 3: Usuários + Engajamento ──────────────────────────────────────────

export interface UserGrowthPoint {
  week_start: string;
  new_total: number;
  cumulative_total: number;
}

export interface FunnelStep {
  step: string;
  step_order: number;
  user_count: number;
}

export interface UserSegment {
  segment: string;
  user_count: number;
}

export interface PostsWeekPoint {
  week_start: string;
  total_count: number;
  reels_count: number;
  feed_count: number;
  carousel_count: number;
}

export interface PostTypeBreakdown {
  post_type: string;
  post_count: number;
}

export interface TopActiveUser {
  professional_id: string;
  full_name: string | null;
  email: string | null;
  post_count: number;
  lead_count: number;
  last_active_at: string | null;
}

export interface CreditsByService {
  service_key: string;
  total_consumed: number;
  use_count: number;
}

export function useOwnerUserGrowth(weeksBack = 12) {
  return useQuery({
    queryKey: ["owner-user-growth", weeksBack],
    queryFn: async (): Promise<UserGrowthPoint[]> => {
      const { data, error } = await supabase.rpc("owner_user_growth", { weeks_back: weeksBack });
      if (error) throw error;
      return (data ?? []) as UserGrowthPoint[];
    },
  });
}

export function useOwnerActivationFunnel() {
  return useQuery({
    queryKey: ["owner-activation-funnel"],
    queryFn: async (): Promise<FunnelStep[]> => {
      const { data, error } = await supabase.rpc("owner_activation_funnel");
      if (error) throw error;
      return (data ?? []) as FunnelStep[];
    },
  });
}

export function useOwnerUserSegments() {
  return useQuery({
    queryKey: ["owner-user-segments"],
    queryFn: async (): Promise<UserSegment[]> => {
      const { data, error } = await supabase.rpc("owner_user_segments");
      if (error) throw error;
      return (data ?? []) as UserSegment[];
    },
  });
}

export function useOwnerPostsPerWeek(weeksBack = 8) {
  return useQuery({
    queryKey: ["owner-posts-per-week", weeksBack],
    queryFn: async (): Promise<PostsWeekPoint[]> => {
      const { data, error } = await supabase.rpc("owner_posts_per_week", { weeks_back: weeksBack });
      if (error) throw error;
      return (data ?? []) as PostsWeekPoint[];
    },
  });
}

export function useOwnerPostTypeBreakdown() {
  return useQuery({
    queryKey: ["owner-post-type-breakdown"],
    queryFn: async (): Promise<PostTypeBreakdown[]> => {
      const { data, error } = await supabase.rpc("owner_post_type_breakdown");
      if (error) throw error;
      return (data ?? []) as PostTypeBreakdown[];
    },
  });
}

export function useOwnerTopActiveUsers(topN = 10) {
  return useQuery({
    queryKey: ["owner-top-active-users", topN],
    queryFn: async (): Promise<TopActiveUser[]> => {
      const { data, error } = await supabase.rpc("owner_top_active_users", { top_n: topN });
      if (error) throw error;
      return (data ?? []) as TopActiveUser[];
    },
  });
}

export function useOwnerCreditsByService() {
  return useQuery({
    queryKey: ["owner-credits-by-service"],
    queryFn: async (): Promise<CreditsByService[]> => {
      const { data, error } = await supabase.rpc("owner_credits_by_service");
      if (error) throw error;
      return (data ?? []) as CreditsByService[];
    },
  });
}
// ── Fatia 4: Feedback + Acesso + Polish ─────────────────────────────────────

export interface Feedback {
  id: string;
  author_id: string | null;
  type: 'bug' | 'sugestao' | 'duvida' | 'elogio' | 'outro';
  status: 'novo' | 'em_analise' | 'resolvido' | 'arquivado';
  severity: 'baixa' | 'media' | 'alta' | 'critica';
  message: string;
  screenshot_url: string | null;
  nps_score: number | null;
  created_at: string;
  author?: {
    full_name: string | null;
    email: string | null;
    whatsapp: string | null;
  };
}

export interface SuperAdminAccess {
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  scopes: string[];
  revoked_at: string | null;
  notes: string | null;
  user_email: string | null;
  user_name?: string;
}

export function useOwnerFeedbacks() {
  return useQuery({
    queryKey: ["owner-feedbacks"],
    queryFn: async (): Promise<Feedback[]> => {
      const { data, error } = await supabase
        .from("feedbacks")
        .select(`
          *,
          author:professionals(full_name, email, whatsapp)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as Feedback[];
    },
  });
}

export function useUpdateFeedbackStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Feedback["status"] }) => {
      const { error } = await supabase
        .from("feedbacks")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-feedbacks"] }),
  });
}

export function useOwnerAccessList() {
  return useQuery({
    queryKey: ["owner-access-list"],
    queryFn: async (): Promise<SuperAdminAccess[]> => {
      const { data, error } = await supabase
        .from("super_admin_access")
        .select("*")
        .order("granted_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(item => ({
        ...item,
        user_name: item.user_email ?? undefined,
      })) as SuperAdminAccess[];
    },
  });
}

export function useGrantAccessByEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, scopes, notes }: { email: string; scopes: string[]; notes?: string }) => {
      const { data, error } = await supabase.rpc("grant_super_admin_by_email", {
        target_email: email,
        target_scopes: scopes,
        target_notes: notes
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-access-list"] }),
  });
}

export function useRevokeAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase
        .from("super_admin_access")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", user_id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner-access-list"] }),
  });
}

export function useAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_announcements")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: ["feature-flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_flags")
        .select("*");
      if (error) throw error;
      return data;
    },
  });
}

// ── Fatia 5: Gestão manual de usuários ──────────────────────────────────────

export interface OwnerUserRow {
  user_id: string;
  professional_id: string;
  email: string;
  full_name: string | null;
  slug: string | null;
  whatsapp: string | null;
  user_created_at: string | null;
  subscription_status: string | null;
  monthly_price_brl: number | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  days_until_expiry: number | null;
}

export function useOwnerListAllUsers() {
  return useQuery({
    queryKey: ["owner-list-all-users"],
    queryFn: async (): Promise<OwnerUserRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("owner_list_all_users");
      if (error) throw error;
      return (data ?? []) as OwnerUserRow[];
    },
  });
}

export function useOwnerGrantManualSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      professional_id: string;
      days: number;
      monthly_price?: number | null;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("owner_grant_manual_subscription", {
        p_professional_id: args.professional_id,
        p_days: args.days,
        p_monthly_price: args.monthly_price ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-list-all-users"] });
      qc.invalidateQueries({ queryKey: ["owner-mrr"] });
      qc.invalidateQueries({ queryKey: ["owner-sub-status"] });
    },
  });
}

export function useOwnerCancelSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (professional_id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("owner_cancel_subscription", {
        p_professional_id: professional_id,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner-list-all-users"] });
      qc.invalidateQueries({ queryKey: ["owner-mrr"] });
      qc.invalidateQueries({ queryKey: ["owner-sub-status"] });
    },
  });
}
