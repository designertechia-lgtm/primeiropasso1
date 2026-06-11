import {
  TrendingUp,
  CheckCircle2,
  Clock,
  PauseCircle,
  Archive,
  Globe,
} from "lucide-react";

// ── Limites do Google Ads ──────────────────────────────────
export const HEADLINE_MAX = 30;
export const DESC_MAX = 90;
export const PATH_MAX = 15;

// ── Custo de geração (placeholder — service_pricing 'campanha_ads') ──
export const CAMPAIGN_COST = 10;

// ── Tipos ──────────────────────────────────────────────────
export type CampaignStatus = "draft" | "approved" | "published" | "active" | "paused" | "archived";

export interface Campaign {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  daily_budget_brl: number;
  max_daily_budget_brl: number;
  landing_url: string | null;
  brief: Record<string, any>;
  start_date: string | null;
  end_date: string | null;
  external_id: string | null;
  created_at: string;
  updated_at: string;
}

// Sub-conta Google Ads do profissional (ads_accounts via google-ads-proxy)
export interface AdsAccount {
  external_customer_id: string | null;
  status: "pending_billing" | "active" | "suspended" | "closed";
  billing_configured: boolean;
  invited_email: string | null;
}

export interface Asset {
  id: string;
  asset_type: string;
  parent_id: string | null;
  payload: Record<string, any>;
  position: number;
}

// ── Status: label/ícone/variant (cards) + cor hex (calendário) ──
export const STATUS_CONFIG: Record<CampaignStatus, {
  label: string;
  icon: React.FC<any>;
  variant: "default" | "secondary" | "outline" | "destructive";
  color: string;
}> = {
  draft:     { label: "Rascunho",  icon: Clock,        variant: "secondary",   color: "#94A3B8" },
  approved:  { label: "Aprovada",  icon: CheckCircle2, variant: "default",     color: "#3B82F6" },
  published: { label: "Publicada", icon: Globe,        variant: "default",     color: "#8B5CF6" },
  active:    { label: "Ativa",     icon: TrendingUp,   variant: "default",     color: "#10B981" },
  paused:    { label: "Pausada",   icon: PauseCircle,  variant: "outline",     color: "#F59E0B" },
  archived:  { label: "Arquivada", icon: Archive,      variant: "destructive", color: "#6B7280" },
};

export const OBJECTIVE_LABEL: Record<string, string> = {
  leads:           "Captação de leads",
  agendamentos:    "Agendamentos",
  whatsapp:        "Mensagens WhatsApp",
  trafego_landing: "Tráfego para landing",
};
