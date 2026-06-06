/**
 * Hook useAxelMemory
 *
 * Gerencia a leitura/escrita da memória persistente do Axel.
 * Como os arquivos .md estão no servidor, usamos localStorage para
 * persistir as informações do usuário e sessionStorage para o estado da conversa.
 *
 * Futuramente, pode ser substituído por uma API endpoint que lê/escreve
 * os arquivos diretamente no servidor.
 */

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface UserMemory {
  // Identificação
  name: string;
  specialty: string;
  crp: string;
  email: string;

  // Preferências
  preferredTone: "natural" | "formal" | "entusiasta";
  suggestionFrequency: "baixa" | "media" | "alta";
  interestAreas: string[];

  // Onboarding status
  profileComplete: boolean;
  agendaConfigured: boolean;
  landingPublished: boolean;
  whatsappConnected: boolean;
  firstContentCreated: boolean;
  subscriptionActive: boolean;

  // Histórico
  firstContactDone: boolean;
  interactionCount: number;
  lastInteractionAt: string | null;
}

export interface AxelMessage {
  id: string;
  role: "axel" | "user";
  content: string;
  actions?: AxelAction[];
  created_at: string;
}

export interface AxelAction {
  label: string;
  href?: string;
  action?: string;
}

const MEMORY_KEY = "axel_memoria_usuario";
const SESSION_KEY = "axel_conversa_atual";

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
  const { profile, user } = useAuth();

  // Memória do usuário (persistente em localStorage)
  const [memory, setMemoryState] = useState<UserMemory>(() => {
    try {
      const stored = localStorage.getItem(MEMORY_KEY);
      return stored ? { ...DEFAULT_MEMORY, ...JSON.parse(stored) } : DEFAULT_MEMORY;
    } catch {
      return DEFAULT_MEMORY;
    }
  });

  // Mensagens da sessão atual
  const [messages, setMessages] = useState<AxelMessage[]>(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Buscar dados do profissional para preencher memória
  const { data: professional } = useQuery({
    queryKey: ["axel-professional", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("professionals")
        .select("full_name, email, crp, slug")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  // Atualizar memória com dados do profissional
  useEffect(() => {
    if (professional) {
      updateMemory({
        name: professional.full_name || memory.name,
        email: professional.email || memory.email,
        crp: professional.crp || memory.crp,
      });
    }
  }, [professional?.full_name, professional?.email, professional?.crp]);

  // Persistir memória
  const saveMemory = useCallback((mem: UserMemory) => {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
  }, []);

  // Persistir mensagens
  const saveMessages = useCallback((msgs: AxelMessage[]) => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs));
  }, []);

  // Atualizar memória
  const updateMemory = useCallback(
    (partial: Partial<UserMemory>) => {
      setMemoryState((prev) => {
        const next = { ...prev, ...partial };
        saveMemory(next);
        return next;
      });
    },
    [saveMemory]
  );

  // Adicionar mensagem
  const addMessage = useCallback(
    (msg: Omit<AxelMessage, "id" | "created_at">) => {
      const newMsg: AxelMessage = {
        ...msg,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => {
        const next = [...prev, newMsg];
        saveMessages(next);
        return next;
      });
      return newMsg;
    },
    [saveMessages]
  );

  // Limpar conversa
  const clearConversation = useCallback(() => {
    setMessages([]);
    sessionStorage.removeItem(SESSION_KEY);
  }, []);

  // Resetar memória
  const resetMemory = useCallback(() => {
    setMemoryState(DEFAULT_MEMORY);
    localStorage.removeItem(MEMORY_KEY);
  }, []);

  // Marcar primeiro contato
  const markFirstContact = useCallback(() => {
    updateMemory({ firstContactDone: true });
  }, [updateMemory]);

  // Incrementar contagem de interações
  const incrementInteraction = useCallback(() => {
    updateMemory({
      interactionCount: memory.interactionCount + 1,
      lastInteractionAt: new Date().toISOString(),
    });
  }, [memory.interactionCount, updateMemory]);

  return {
    memory,
    messages,
    updateMemory,
    addMessage,
    clearConversation,
    resetMemory,
    markFirstContact,
    incrementInteraction,
    DEFAULT_MEMORY,
  };
}