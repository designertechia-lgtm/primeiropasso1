/**
 * Hook useAxelMemory
 *
 * Gerencia a leitura/escrita da memória persistente do Axel.
 *
 * Fase 2 — Migração de localStorage → Supabase:
 * - Histórico (messages): lido de axel_conversations (persistido pela edge function)
 * - Memória de fatos (memory): lido/escrito em axel_user_memory
 * - Onboarding status: queries diretas ao Supabase (já existentes)
 *
 * Nota: tabelas axel_* não estão nos tipos gerados do Supabase — usamos (supabase as any)
 * (padrão do projeto, já usado para subscriptions).
 */

import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserMemory {
  name: string;
  specialty: string;
  crp: string;
  email: string;
  preferredTone: "natural" | "formal" | "entusiasta";
  suggestionFrequency: "baixa" | "media" | "alta";
  interestAreas: string[];
  profileComplete: boolean;
  agendaConfigured: boolean;
  landingPublished: boolean;
  whatsappConnected: boolean;
  firstContentCreated: boolean;
  subscriptionActive: boolean;
  firstContactDone: boolean;
  interactionCount: number;
  lastInteractionAt: string | null;
}

export interface AxelMessage {
  id: string;
  role: "axel" | "user";
  content: string;
  actions?: AxelAction[];
  followUps?: string[];
  created_at: string;
}

export interface AxelAction {
  label: string;
  href?: string;
  action?: string;
}

export interface OnboardingStatus {
  // Jornada de ambientação (5 etapas — mesma ordem e critérios do agente/edge):
  // perfil → DNA da marca → landing no ar → campanha → vídeo.
  profileComplete: boolean;
  dnaCreated: boolean;
  landingPublished: boolean;
  campaignCreated: boolean;
  videoCreated: boolean;
  // Extras (fora da jornada, mas úteis pro copiloto):
  agendaConfigured: boolean;
  whatsappConnected: boolean;
  firstContentCreated: boolean;
  subscriptionActive: boolean;
  doneCount: number;
  totalCount: number;
  progress: number;
  loaded: boolean;
}

export type GreetingType = "first" | "returning" | "inactive";

export interface MemoryFact {
  key: string;
  value: string;
  updated_at?: string;
}

const INACTIVITY_HOURS = 24;

const DEFAULT_MEMORY: UserMemory = {
  name: "",
  specialty: "",
  crp: "",
  email: "",
  preferredTone: "natural",
  suggestionFrequency: "media",
  interestAreas: [],
  profileComplete: false,
  agendaConfigured: false,
  landingPublished: false,
  whatsappConnected: false,
  firstContentCreated: false,
  subscriptionActive: false,
  firstContactDone: false,
  interactionCount: 0,
  lastInteractionAt: null,
};

export function useAxelMemory() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ===== Memória de fatos (axel_user_memory → Supabase) =====
  const { data: memoryFacts = [] } = useQuery({
    queryKey: ["axel-memory-facts", user?.id],
    queryFn: async (): Promise<MemoryFact[]> => {
      const { data } = await (supabase as any)
        .from("axel_user_memory")
        .select("key, value, updated_at")
        .order("updated_at", { ascending: false })
        .limit(50);
      return (data || []) as MemoryFact[];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  // ===== Histórico de conversas (axel_conversations → Supabase) =====
  const { data: dbMessages = [], isPending: pendingMessages } = useQuery({
    queryKey: ["axel-conversations", user?.id],
    queryFn: async (): Promise<AxelMessage[]> => {
      // Pega as 100 mensagens MAIS RECENTES (desc) e reordena cronologicamente pra render.
      // Antes era ascending+limit(100) = as 100 mais ANTIGAS → quando a conversa passa de
      // 100 msgs, as respostas novas ficam ALÉM do corte e somem da tela (parecia "o Axel
      // não responde", mas estavam no banco; a conta da Daiane tinha 112 e travava no
      // histórico de dias atrás).
      const { data } = await (supabase as any)
        .from("axel_conversations")
        .select("id, role, content, actions, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      return ((data || []) as AxelMessage[]).slice().reverse();
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60,
  });

  // ===== Mutations =====
  const resetMemoryMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("axel_user_memory")
        .delete()
        .neq("key", "");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["axel-memory-facts", user?.id] });
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("axel_conversations")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["axel-conversations", user?.id] });
    },
  });

  // ===== Dados do profissional =====
  // brand_bible é um jsonb grande — só o markdown interessa (existe DNA?); o alias
  // com operador JSON não está nos tipos gerados, daí o (supabase as any).
  const { data: professional, isLoading: loadingProfessional } = useQuery({
    queryKey: ["axel-professional", user?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("professionals")
        .select("id, full_name, email, crp, slug, bio, photo_url, hero_title, pain_title, landing_published, category, dna_markdown:brand_bible->>markdown")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  const professionalId = (professional as any)?.id ?? null;

  // Agenda configurada?
  const { data: hasAvailability } = useQuery({
    queryKey: ["axel-availability", professionalId],
    enabled: !!professionalId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { count } = await supabase
        .from("availability")
        .select("id", { count: "exact", head: true })
        .eq("professional_id", professionalId!);
      return (count ?? 0) > 0;
    },
  });

  // Conteúdo criado? (vídeo conta como etapa própria da jornada; artigo é extra)
  const { data: contentCounts } = useQuery({
    queryKey: ["axel-content", professionalId],
    enabled: !!professionalId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const [{ count: articles }, { count: videos }] = await Promise.all([
        supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("professional_id", professionalId!),
        supabase
          .from("videos")
          .select("id", { count: "exact", head: true })
          .eq("professional_id", professionalId!),
      ]);
      return { articles: articles ?? 0, videos: videos ?? 0 };
    },
  });

  // Primeira campanha criada? (tabela fora dos tipos gerados — padrão do projeto)
  const { data: hasCampaign } = useQuery({
    queryKey: ["axel-campaigns", professionalId],
    enabled: !!professionalId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { count } = await (supabase as any)
        .from("ads_campaigns")
        .select("id", { count: "exact", head: true })
        .eq("professional_id", professionalId!)
        .neq("status", "archived");
      return (count ?? 0) > 0;
    },
  });

  // Assinatura ativa?
  const { data: subscriptionActive } = useQuery({
    queryKey: ["axel-subscription", professionalId],
    enabled: !!professionalId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("subscriptions")
        .select("status")
        .eq("professional_id", professionalId!)
        .maybeSingle();
      return (data as { status?: string } | null)?.status === "active";
    },
  });

  // ===== Memória composta =====
  const memoryFactsMap = new Map(memoryFacts.map((f) => [f.key, f.value]));

  const memory: UserMemory = {
    name: (professional as any)?.full_name || memoryFactsMap.get("name") || "",
    specialty: memoryFactsMap.get("especialidade") || (professional as any)?.category || "",
    crp: (professional as any)?.crp || memoryFactsMap.get("crp") || "",
    email: (professional as any)?.email || memoryFactsMap.get("email") || "",
    preferredTone: (memoryFactsMap.get("preferencia_tom") as UserMemory["preferredTone"]) || "natural",
    suggestionFrequency: (memoryFactsMap.get("suggestion_frequency") as UserMemory["suggestionFrequency"]) || "media",
    interestAreas: memoryFactsMap.get("interest_areas")?.split(",").filter(Boolean) || [],
    profileComplete: false,
    agendaConfigured: false,
    landingPublished: false,
    whatsappConnected: memoryFactsMap.get("whatsapp_connected") === "true",
    firstContentCreated: false,
    subscriptionActive: subscriptionActive ?? false,
    firstContactDone: memoryFactsMap.has("primeiro_contato"),
    interactionCount: parseInt(memoryFactsMap.get("interaction_count") || "0", 10),
    lastInteractionAt: memoryFactsMap.get("last_interaction_at") || null,
  };

  // ===== Messages =====
  const messages: AxelMessage[] = dbMessages;

  // ===== addMessage (invalida cache; edge function já persiste) =====
  const addMessage = useCallback(
    (_msg: Omit<AxelMessage, "id" | "created_at">) => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["axel-conversations", user?.id] });
      }, 500);
    },
    [queryClient, user?.id],
  );

  // Limpar conversa
  const clearConversation = useCallback(() => {
    deleteConversationMutation.mutate();
  }, [deleteConversationMutation]);

  // Resetar memória (LGPD)
  const resetMemory = useCallback(() => {
    resetMemoryMutation.mutate();
  }, [resetMemoryMutation]);

  // Marcar primeiro contato
  const markFirstContact = useCallback(async () => {
    // professional_id é NOT NULL e faz parte do onConflict; sem ele o upsert falhava
    // silenciosamente (a saudação contextual nunca persistia).
    if (!user?.id || !professionalId) return;
    await (supabase as any).from("axel_user_memory").upsert(
      {
        professional_id: professionalId,
        key: "primeiro_contato",
        value: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "professional_id,key" },
    );
    queryClient.invalidateQueries({ queryKey: ["axel-memory-facts", user?.id] });
  }, [user?.id, professionalId, queryClient]);

  // Incrementar contagem de interações
  const incrementInteraction = useCallback(async () => {
    // idem markFirstContact: sem professional_id o upsert violava NOT NULL e a
    // contagem/recência (usadas no greetingType) nunca gravavam.
    if (!user?.id || !professionalId) return;
    const count = memory.interactionCount + 1;
    const now = new Date().toISOString();
    await (supabase as any).from("axel_user_memory").upsert(
      { professional_id: professionalId, key: "interaction_count", value: String(count), updated_at: now },
      { onConflict: "professional_id,key" },
    );
    await (supabase as any).from("axel_user_memory").upsert(
      { professional_id: professionalId, key: "last_interaction_at", value: now, updated_at: now },
      { onConflict: "professional_id,key" },
    );
    queryClient.invalidateQueries({ queryKey: ["axel-memory-facts", user?.id] });
  }, [memory.interactionCount, user?.id, professionalId, queryClient]);

  // ===== Onboarding status =====
  // Jornada de ambientação: MESMOS critérios da edge axel-agent (computeJornada) —
  // perfil = nome + bio + foto (CRP é opcional: plataforma multi-área);
  // DNA = brand_bible gerado; landing = coluna GENERATED landing_published;
  // campanha = 1+ não-arquivada; vídeo = 1+ gerado.
  const onboarding: OnboardingStatus = (() => {
    const p = professional as any;
    const profileComplete = !!(p?.full_name && p?.bio && p?.photo_url);
    const dnaCreated = !!(p?.dna_markdown && String(p.dna_markdown).trim());
    // landing_published é coluna GENERATED no banco (ignora hero_title, que tem DEFAULT).
    // Ver migration 20260609_axel_landing_published.sql.
    const landingPublished = !!p?.landing_published;
    const campaignCreated = !!hasCampaign;
    const videoCreated = (contentCounts?.videos ?? 0) > 0;

    const jornada = [profileComplete, dnaCreated, landingPublished, campaignCreated, videoCreated];
    const doneCount = jornada.filter(Boolean).length;

    return {
      profileComplete,
      dnaCreated,
      landingPublished,
      campaignCreated,
      videoCreated,
      agendaConfigured: !!hasAvailability,
      whatsappConnected: memory.whatsappConnected,
      firstContentCreated: (contentCounts?.articles ?? 0) + (contentCounts?.videos ?? 0) > 0,
      subscriptionActive: !!subscriptionActive,
      doneCount,
      totalCount: jornada.length,
      progress: Math.round((doneCount / jornada.length) * 100),
      loaded: !loadingProfessional && !!professionalId,
    };
  })();

  // ===== Saudação contextual =====
  const greetingType: GreetingType = (() => {
    if (!memory.firstContactDone) return "first";
    if (memory.lastInteractionAt) {
      const diffHours =
        (Date.now() - new Date(memory.lastInteractionAt).getTime()) / 3_600_000;
      if (diffHours > INACTIVITY_HOURS) return "inactive";
    }
    return "returning";
  })();

  // ===== Saudações personalizadas com memória (Fase 2) =====
  const getMemoryGreeting = useCallback((): string => {
    const firstName = memory.name ? memory.name.split(" ")[0] : "";

    if (greetingType === "first") {
      const oi = firstName ? `Olá, ${firstName}!` : "Olá!";
      // Propõe a PRIMEIRA etapa realmente pendente (quem já preencheu o perfil no
      // cadastro não pode ouvir "quer começar pelo perfil?").
      const proxima = !onboarding.loaded
        ? "pelo seu perfil"
        : !onboarding.profileComplete
          ? "pelo seu perfil"
          : !onboarding.dnaCreated
            ? "pelo DNA da sua marca"
            : !onboarding.landingPublished
              ? "pela sua página"
              : !onboarding.campaignCreated
                ? "pela sua primeira campanha"
                : !onboarding.videoCreated
                  ? "pelo seu primeiro vídeo"
                  : "";
      const convite = proxima ? ` Quer começar ${proxima}? É rapidinho.` : " Por onde quer começar?";
      return `${oi} 👋 Eu sou o Axel, seu copiloto aqui na PrimeiroPasso. Vou te guiar nos primeiros passos: completar seu perfil, criar o DNA da sua marca, colocar sua página no ar e lançar suas primeiras campanhas e vídeos.${convite}`;
    }

    if (greetingType === "inactive") {
      const base = `Oi${firstName ? `, ${firstName}` : ""}! 👋 Faz um tempinho que não nos falamos.`;
      const objetivo = memoryFactsMap.get("objetivo");
      const dor = memoryFactsMap.get("dor");
      if (objetivo) {
        return `${base}\n\nSeu objetivo era: *${objetivo}*. Quer retomar daí ou explorar algo novo?`;
      }
      if (dor) {
        return `${base}\n\nVocê tinha mencionado: *${dor}*. Isso ainda está te incomodando? Posso ajudar.`;
      }
      return `${base} Quer retomar de onde paramos ou explorar algo novo?`;
    }

    // returning
    const base = `Bem-vindo de volta${firstName ? `, ${firstName}` : ""}! 👋`;
    const ultimoTopico = memoryFactsMap.get("ultimo_topico");
    if (ultimoTopico) {
      return `${base}\n\nDa última vez estávamos falando sobre: *${ultimoTopico}*. Quer continuar ou prefere outro assunto?`;
    }
    return `${base} Como posso te ajudar hoje?`;
  }, [greetingType, memory.name, memoryFactsMap, onboarding]);

  return {
    memory,
    memoryFacts,
    messages,
    // O histórico já foi carregado? (distingue "conversa vazia de verdade" de
    // "ainda buscando" — a saudação local só entra no primeiro caso).
    // isPending sozinho não basta: query DISABLED (user ainda não resolvido pelo
    // auth) tem isFetching=false — sem o gate !!user?.id a saudação de "primeira
    // vez" piscaria pra usuário antigo a cada abertura do chat.
    messagesLoaded: !!user?.id && !pendingMessages,
    onboarding,
    greetingType,
    addMessage,
    clearConversation,
    resetMemory,
    markFirstContact,
    incrementInteraction,
    getMemoryGreeting,
    DEFAULT_MEMORY,
    isResettingMemory: resetMemoryMutation.isPending,
  };
}