import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Send,
  Sparkles,
  User,
  ChevronRight,
  Lightbulb,
  HelpCircle,
  Star,
  Loader2,
  Settings,
  Trash2,
  Shield,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { useAxelMemory, type AxelMessage } from "@/hooks/useAxelMemory";
import { useAuth } from "@/hooks/useAuth";

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import ChatTexto from "@/components/admin/ChatTexto";
import { resolveIntent } from "@/lib/axel/intentEngine";
import {
  ALL_INTENTS,
  GREETING_INTENT,
  CONTENT_MENU,
  FALLBACK_RESPONSES,
  FALLBACK_ACTIONS,
  FAQ_MENU_TEXT,
  FAQ_MENU_FOLLOWUPS,
  type KbAction,
} from "@/lib/axel/knowledgeBase";

type FeedbackDialogState = {
  open: boolean;
  type: string;
  message: string;
  nps: number | null;
  sending: boolean;
};

const INITIAL_FEEDBACK: FeedbackDialogState = {
  open: false,
  type: "sugestao",
  message: "",
  nps: null,
  sending: false,
};

/** Resposta gerada pelo Axel. */
interface AxelResponse {
  content: string;
  actions?: KbAction[];
  followUps?: string[];
  openFeedback?: boolean;
}

// Rascunho do chat: chave única no localStorage (compartilhada entre o chat
// flutuante e a página dedicada, pra continuidade ao alternar).
const CHAT_DRAFT_KEY = "axel:chatDraft";

export default function AxelChat({ isDedicatedPage = false }: { isDedicatedPage?: boolean }) {
  const {
    memory,
    messages,
    messagesLoaded,
    onboarding,
    greetingType,
    addMessage,
    clearConversation,
    resetMemory,
    markFirstContact,
    incrementInteraction,
    getMemoryGreeting,
    isResettingMemory,
  } = useAxelMemory();
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Rascunho persistente: o que está sendo digitado sobrevive a fechar/reabrir o chat.
  const [input, setInput] = useState(() => {
    try { return localStorage.getItem(CHAT_DRAFT_KEY) || ""; } catch { return ""; }
  });

  const [feedback, setFeedback] = useState<FeedbackDialogState>(INITIAL_FEEDBACK);
  const [isProcessing, setIsProcessing] = useState(false);
  // Mensagem do usuário renderizada NA HORA (otimista), antes dos "..." e do round-trip.
  // O histórico real vem da edge (axel_conversations); ao chegar, limpamos a otimista.
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  // Mensagens LOCAIS (fallback por regras, menus do grid, agradecimento de feedback):
  // a edge não as persiste, e o histórico renderizado vem 100% do banco — sem este
  // estado elas nunca apareceriam na tela (addMessage só invalida o cache).
  const [localMessages, setLocalMessages] = useState<AxelMessage[]>([]);
  const pushLocal = (msg: Omit<AxelMessage, "id" | "created_at">) => {
    // Timestamp clampado: nunca antes da última msg do banco conhecida no momento
    // do push (relógio do cliente atrasado reordenaria a local pro meio do histórico).
    const lastBank = messages.length
      ? new Date(messages[messages.length - 1].created_at).getTime()
      : 0;
    const ts = Math.max(Date.now(), lastBank + 1);
    setLocalMessages((prev) => [
      ...prev,
      { ...msg, id: `local-${ts}-${prev.length}`, created_at: new Date(ts).toISOString() },
    ]);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const firstName = memory.name ? memory.name.split(" ")[0] : "";

  // Persiste o rascunho a cada tecla; some quando enviado (input vira "").
  useEffect(() => {
    try {
      if (input) localStorage.setItem(CHAT_DRAFT_KEY, input);
      else localStorage.removeItem(CHAT_DRAFT_KEY);
    } catch { /* localStorage indisponível (modo privado restrito) — ignora */ }
  }, [input]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement | null;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    }
  }, [messages, localMessages, isProcessing, pendingUser]);

  // Quando a mensagem otimista aparece de verdade no histórico (refetch da edge),
  // limpa a versão otimista pra não duplicar.
  useEffect(() => {
    if (pendingUser && messages.some((m) => m.role === "user" && m.content === pendingUser)) {
      setPendingUser(null);
    }
  }, [messages, pendingUser]);

  /** Sugere o próximo passo pendente de onboarding (para saudação de retorno). */
  function onboardingNudge(): string {
    if (!onboarding.loaded || onboarding.progress === 100) return "";
    const next = nextOnboardingStep();
    if (!next) return "";
    return `\n\nSua jornada está em ${onboarding.progress}% (${onboarding.doneCount}/${onboarding.totalCount}). Que tal o próximo passo: ${next.label}?`;
  }

  // Junta banco + locais em ordem cronológica. Uma user msg local é descartada
  // quando a MESMA fala chegou pelo banco há pouco (a edge persiste a msg do
  // usuário ANTES do LLM — mesmo padrão de dedup do pendingUser). A janela de
  // 5 min evita engolir a mensagem quando a frase ("ok", "sim") já existia em
  // conversa antiga.
  const DEDUP_WINDOW_MS = 5 * 60_000;
  const mergedMessages = [
    ...messages,
    ...localMessages.filter(
      (lm) =>
        !(
          lm.role === "user" &&
          messages.some(
            (m) =>
              m.role === "user" &&
              m.content === lm.content &&
              Math.abs(new Date(m.created_at).getTime() - new Date(lm.created_at).getTime()) < DEDUP_WINDOW_MS,
          )
        ),
    ),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Saudação de boas-vindas LOCAL (não persistida): o histórico renderizado vem
  // 100% do banco (axel_conversations, preenchida pela edge) e addMessage não
  // grava nada — antes disso, o chat de um usuário novo abria VAZIO. A saudação
  // entra como mensagem sintética só quando o histórico carregou e está vazio,
  // e fica CONGELADA num ref: markFirstContact/incrementInteraction mudam o
  // greetingType em segundos e o balão visível não pode mutar na frente do usuário.
  const showGreeting = messagesLoaded && mergedMessages.length === 0;
  const greetingRef = useRef<AxelMessage | null>(null);
  if (showGreeting && !greetingRef.current) {
    greetingRef.current = {
      id: "greeting-local",
      role: "axel",
      content: getMemoryGreeting() + (greetingType === "first" ? "" : onboardingNudge()),
      actions: GREETING_INTENT.actions,
      created_at: new Date().toISOString(),
    };
  }
  const displayMessages = showGreeting && greetingRef.current ? [greetingRef.current] : mergedMessages;

  // ==================== ONBOARDING ====================
  // As 5 etapas da JORNADA DE AMBIENTAÇÃO — mesma ordem e critérios do agente
  // (edge axel-agent, computeJornada). É o fallback por regras quando a IA cai.
  function onboardingChecklist() {
    return [
      { label: "Perfil preenchido (nome, bio e foto)", done: onboarding.profileComplete, href: "/admin/perfil" },
      { label: "DNA da Marca criado", done: onboarding.dnaCreated, href: "/admin/landing?tab=dna" },
      { label: "Landing page no ar", done: onboarding.landingPublished, href: "/admin/landing" },
      { label: "Primeira campanha de anúncio", done: onboarding.campaignCreated, href: "/admin/trafego-pago" },
      { label: "Primeiro vídeo criado", done: onboarding.videoCreated, href: "/admin/redes-sociais?tab=videos" },
    ];
  }

  function nextOnboardingStep() {
    return onboardingChecklist().find((c) => !c.done) ?? null;
  }

  function getOnboardingResponse(): AxelResponse {
    if (!onboarding.loaded) {
      return {
        content:
          "Deixa eu verificar seu progresso de ambientação, um instante.\n\nEnquanto isso, me diz: você quer configurar a plataforma ou já partir para criar conteúdo?",
        actions: [
          { label: "Configurar plataforma", href: "/admin/perfil" },
          { label: "Criar conteúdo", action: "content-creation" },
        ],
      };

    }

    const checklist = onboardingChecklist();
    const { doneCount, totalCount, progress } = onboarding;

    let items = "";
    checklist.forEach((item) => {
      items += `\n${item.done ? "✅" : "⬜"} ${item.label}`;
    });

    if (progress === 100) {
      return {
        content: `🎉 Parabéns${firstName ? `, ${firstName}` : ""}! Você concluiu toda a ambientação.${items}\n\nAgora bora dar atenção ao seu marketing? Posso te ajudar a criar conteúdo.`,
        actions: [{ label: "Criar conteúdo agora", action: "content-creation" }],
        followUps: ["Ideias de tema para vídeo", "Como personalizar minha Landing?"],
      };
    }

    const next = nextOnboardingStep()!;
    const content =
      `Sua ambientação: ${progress}% (${doneCount}/${totalCount})\n${items}\n\n` +
      (doneCount === 0
        ? "Vamos começar pelo Perfil? É rapidinho e dá a base pra todo o resto."
        : `Faltam ${totalCount - doneCount} passo(s). Sugiro seguir por: ${next.label}.`);

    return {
      content,
      actions: [{ label: `Ir para: ${next.label}`, href: next.href }],
      followUps: ["O que falta para 100%?", "Pular para criar conteúdo"],
    };
  }


  // ==================== GERAÇÃO DE RESPOSTA ====================
  function generateResponse(text: string): AxelResponse {
    const match = resolveIntent(text, ALL_INTENTS);

    if (!match) {
      const fb = FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
      return { content: fb, actions: FALLBACK_ACTIONS };
    }

    const intent = match.intent;

    switch (intent.category) {
      case "onboarding":
        return getOnboardingResponse();

      case "content":
        return {
          content: CONTENT_MENU.content,
          actions: CONTENT_MENU.actions,
          followUps: CONTENT_MENU.followUps,
        };

      case "feedback":
        return {
          content: intent.answer,
          actions: intent.actions,
          openFeedback: true,
        };

      case "greeting": {
        const content = firstName
          ? intent.answer.replace("Olá!", `Olá, ${firstName}!`)
          : intent.answer;

        return { content, actions: intent.actions };
      }

      default:
        return {
          content: intent.answer,
          actions: intent.actions,
          followUps: intent.followUps,
        };
    }
  }

  // ==================== ENVIO ====================
  /**
   * Fallback por regras (motor de intenção local). Usado quando o agente de IA
   * (edge function axel-agent) falha, não está configurado, ou retorna fallback.
   */
  const runRulesFallback = (text: string) => {
    const res = generateResponse(text);
    if (res.openFeedback) {
      setFeedback((prev) => ({ ...prev, open: true }));
    }
    // A pergunta pode não ter chegado ao banco (edge fora do ar) — vira local
    // também, pra resposta não aparecer órfã. O merge deduplica se a edge gravou.
    pushLocal({ role: "user", content: text });
    setPendingUser(null);
    pushLocal({
      role: "axel",
      content: res.content,
      actions: res.actions,
      followUps: res.followUps,
    });
  };

  const sendMessage = async (raw: string) => {
    const text = raw.trim();
    if (!text || isProcessing) return;

    setInput("");
    setIsProcessing(true);
    setPendingUser(text);

    addMessage({ role: "user", content: text });
    incrementInteraction();
    if (!memory.firstContactDone) markFirstContact();

    try {
      // Tenta o agente de IA (Claude + memória + RAG do produto) primeiro.
      const { data, error } = await supabase.functions.invoke("axel-agent", {
        body: { message: text },
      });

      const reply = (data as { reply?: string; fallback?: boolean } | null)?.reply;
      const wantsFallback = (data as { fallback?: boolean } | null)?.fallback;
      const navTo = (data as { navigate?: string | null } | null)?.navigate;

      if (!error && reply && !wantsFallback) {
        addMessage({ role: "axel", content: reply });
        // Axel pediu pra LEVAR o profissional a uma página (rota já validada na edge).
        // No chat flutuante a navegação mantém o chat aberto por cima; na página
        // dedicada não tiramos o usuário do chat (o botão de atalho persistido cobre).
        if (navTo && !isDedicatedPage) navigate(navTo);
      } else {
        // IA indisponível/erro → motor por regras (não quebra a experiência).
        runRulesFallback(text);
      }
    } catch (err) {
      console.error("[AxelChat] axel-agent indisponível, usando fallback:", err);
      runRulesFallback(text);
    } finally {
      setIsProcessing(false);
      inputRef.current?.focus();
    }
  };


  const handleSend = () => sendMessage(input);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAction = (action: KbAction) => {
    if (action.href) {
      // Navegação interna do SPA (sem recarregar a página)
      if (action.href.startsWith("/")) {
        navigate(action.href);
      } else {
        window.open(action.href, "_blank", "noopener,noreferrer");
      }
      return;
    }

    switch (action.action) {
      case "open-feedback":
        setFeedback((prev) => ({ ...prev, open: true }));
        break;
      case "onboarding": {
        const res = getOnboardingResponse();
        pushLocal({ role: "axel", content: res.content, actions: res.actions, followUps: res.followUps });
        break;
      }
      case "content-creation":
        pushLocal({
          role: "axel",
          content: CONTENT_MENU.content,
          actions: CONTENT_MENU.actions,
          followUps: CONTENT_MENU.followUps,
        });
        break;
      case "faq":
        pushLocal({ role: "axel", content: FAQ_MENU_TEXT, followUps: FAQ_MENU_FOLLOWUPS });
        break;
    }
  };

  const handleSubmitFeedback = async () => {
    if (!feedback.message) {
      toast.error("Por favor, escreva sua mensagem.");
      return;
    }

    setFeedback((prev) => ({ ...prev, sending: true }));
    try {
      const { error } = await supabase.from("feedbacks" as any).insert({
        author_id: profile?.id,
        type: feedback.type,
        message: feedback.message,
        nps_score: feedback.nps,
        status: "novo",
        severity: "baixa",
      } as any);

      if (error) throw error;

      toast.success("Feedback enviado com sucesso. Obrigado! 💜");
      pushLocal({
        role: "axel",
        content:
          "Recebi seu feedback, muito obrigado por compartilhar. Isso me ajuda a melhorar cada vez mais.\n\nTem mais alguma coisa em que posso ajudar?",
        followUps: ["Ver meu progresso de ambientação", "Criar um conteúdo"],
      });

      setFeedback(INITIAL_FEEDBACK);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao enviar feedback. Tente novamente.");
    } finally {
      setFeedback((prev) => ({ ...prev, sending: false }));
    }
  };

  // Timestamp relativo simples
  const getRelativeTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    return `${hours}h`;
  };

  return (
    <>
      {/* Messages */}
      {/* [&_[data-radix-scroll-area-viewport]>div]:!block — o Radix embrulha o conteúdo
          num display:table que estoura a largura no widget estreito (380px) e corta os
          balões da direita. Forçar block faz respeitar 100% da largura. */}
      <ScrollArea className="flex-1 min-w-0 [&_[data-radix-scroll-area-viewport]>div]:!block" ref={scrollRef}>
        <div className="p-3 sm:p-4 space-y-0.5 min-w-0">
          {displayMessages.map((msg, idx) => {
            const isAxel = msg.role === "axel";
            const prevMsg = idx > 0 ? displayMessages[idx - 1] : null;
            const showAvatar = !prevMsg || prevMsg.role !== msg.role;

            return (
              <div
                key={msg.id}
                className={`flex gap-2 sm:gap-2.5 ${isAxel ? "justify-start" : "justify-end"} ${
                  showAvatar ? "mt-3 sm:mt-4" : "mt-0.5"
                }`}
              >
                {/* Avatar (Axel side) */}
                {isAxel && (
                  <div className={`shrink-0 ${showAvatar ? "opacity-100" : "opacity-0"}`}>
                    <Avatar className="h-7 w-7 sm:h-8 sm:w-8 ring-2 ring-purple-500/20 ring-offset-1 ring-offset-background">
                      <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600 text-white text-[9px] sm:text-[10px] font-bold">
                        AX
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}

                <div
                  className={`max-w-[85%] sm:max-w-[75%] min-w-0 ${!showAvatar && isAxel ? "ml-9 sm:ml-10" : ""} ${
                    !showAvatar && !isAxel ? "mr-9 sm:mr-10" : ""
                  }`}
                >
                  {/* Time stamp above first in group */}
                  {showAvatar && (
                    <span
                      className={`text-[10px] text-muted-foreground/50 mb-1 block ${
                        isAxel ? "ml-1" : "text-right mr-1"
                      }`}
                    >
                      {isAxel ? "Axel" : "Você"} •{" "}
                      {getRelativeTime(new Date(msg.created_at || Date.now()))}
                    </span>
                  )}

                  {/* Message Bubble */}
                  <div
                    className={`rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-sm leading-relaxed ${
                      isAxel
                        ? "bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-tl-md"
                        : "bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-tr-md shadow-lg shadow-purple-500/10"
                    }`}
                  >
                    <ChatTexto texto={msg.content} className="font-chat text-[13.5px] sm:text-[14px]" />
                  </div>

                  {/* Action Buttons */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.actions.map((action, i) => (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="text-[11px] sm:text-xs h-7 sm:h-8 gap-1 sm:gap-1.5 rounded-xl bg-white/[0.02] backdrop-blur-md border-white/10 hover:bg-white/10 hover:border-purple-500/30 transition-all duration-200"
                          onClick={() => handleAction(action)}
                        >
                          <ChevronRight className="h-3 w-3 text-purple-400" />
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  )}

                  {/* Follow-up suggestion chips */}
                  {isAxel && msg.followUps && msg.followUps.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {msg.followUps.map((q, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(q)}
                          disabled={isProcessing}
                          className="text-[10px] sm:text-[11px] px-2.5 py-1 rounded-full border border-purple-500/20 bg-purple-500/5 text-purple-200/90 hover:bg-purple-500/15 hover:border-purple-500/40 transition-all duration-200 disabled:opacity-40"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Avatar (User side) */}
                {!isAxel && (
                  <div className={`shrink-0 ${showAvatar ? "opacity-100" : "opacity-0"}`}>
                    <Avatar className="h-7 w-7 sm:h-8 sm:w-8 ring-2 ring-purple-500/20 ring-offset-1 ring-offset-background">
                      <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600 text-white text-[9px] sm:text-[10px]">
                        <User className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
              </div>
            );
          })}

          {/* Quick Actions Grid (shown only when just greeting is present).
              Some assim que a primeira mensagem é enviada (pendingUser/processing) —
              sem isso ele ficava clicável no meio do primeiro round-trip. */}
          {showGreeting && !pendingUser && !isProcessing && (
            <div className="mt-6">
              <p className="text-[10px] text-muted-foreground/50 text-center mb-3">
                Ou escolha uma opção rápida:
              </p>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <button
                  onClick={() => handleAction({ label: "Onboarding", action: "onboarding" })}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.05] hover:border-purple-500/20 transition-all duration-200 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Sparkles className="h-5 w-5 text-purple-400" />
                  </div>
                  <span className="text-xs font-medium">Me ambientar</span>

                </button>
                <button
                  onClick={() => handleAction({ label: "Conteúdo", action: "content-creation" })}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.05] hover:border-yellow-500/20 transition-all duration-200 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Lightbulb className="h-5 w-5 text-yellow-400" />
                  </div>
                  <span className="text-xs font-medium">Criar conteúdo</span>

                </button>
                <button
                  onClick={() => handleAction({ label: "FAQ", action: "faq" })}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.05] hover:border-blue-500/20 transition-all duration-200 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <HelpCircle className="h-5 w-5 text-blue-400" />
                  </div>
                  <span className="text-xs font-medium">FAQ</span>

                </button>
                <button
                  onClick={() => handleAction({ label: "Feedback", action: "open-feedback" })}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.05] hover:border-amber-500/20 transition-all duration-200 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Star className="h-5 w-5 text-amber-400" />
                  </div>
                  <span className="text-xs font-medium">Feedback</span>

                </button>
              </div>
            </div>
          )}

          {/* Mensagem otimista do usuário — aparece NA HORA, antes dos "..." */}
          {pendingUser && !displayMessages.some((m) => m.role === "user" && m.content === pendingUser) && (
            <div className="flex gap-2 sm:gap-2.5 mt-3 sm:mt-4 justify-end">
              <div className="max-w-[85%] sm:max-w-[75%]">
                <div className="rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-sm leading-relaxed bg-gradient-to-r from-purple-500 to-blue-600 text-white rounded-tr-md shadow-lg shadow-purple-500/10">
                  <p className="whitespace-pre-wrap break-words font-chat text-[13.5px] sm:text-[14px]">{pendingUser}</p>
                </div>
              </div>
              <div className="shrink-0">
                <Avatar className="h-7 w-7 sm:h-8 sm:w-8 ring-2 ring-purple-500/20 ring-offset-1 ring-offset-background">
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600 text-white text-[9px] sm:text-[10px]">
                    <User className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex gap-2 sm:gap-2.5 mt-3 sm:mt-4 justify-start">
              <Avatar className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 ring-2 ring-purple-500/20 ring-offset-1 ring-offset-background">
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600 text-white text-[9px] sm:text-[10px] font-bold">
                  AX
                </AvatarFallback>
              </Avatar>
              <div className="bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-2xl rounded-tl-md px-3 py-2.5 sm:px-4 sm:py-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-white/5 p-2.5 sm:p-3 bg-white/[0.01] backdrop-blur-xl safe-bottom">
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-10 text-sm bg-white/5 border-white/10 rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20 transition-all pr-4 placeholder:text-xs sm:placeholder:text-sm"
              disabled={isProcessing}
            />
          </div>
          <Button
            size="icon"
            className="h-10 w-10 shrink-0 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-400 hover:to-blue-500 shadow-lg shadow-purple-500/20 transition-all duration-200 active:scale-95"
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
          >
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="flex items-center justify-between mt-1.5 sm:mt-2 px-1">
          {isDedicatedPage ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors">
                  <Settings className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => navigate("/admin/configuracoes")} className="text-xs gap-2 cursor-pointer">
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  Preferências do agente
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setLocalMessages([]);
                    greetingRef.current = null; // saudação recomputa pro novo estado
                    clearConversation();
                  }}
                  className="text-xs gap-2 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Limpar conversa
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    if (isResettingMemory) return;
                    resetMemory();
                    toast.success("Memória limpa (LGPD). O Axel vai te reconhecer como novo.");
                  }}
                  disabled={isResettingMemory}
                  className="text-xs gap-2 cursor-pointer"
                >
                  <Shield className="h-3.5 w-3.5 text-destructive/60" />
                  {isResettingMemory ? "Limpando..." : "Limpar memória (LGPD)"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span />
          )}
          <span className="text-[9px] sm:text-[10px] text-muted-foreground/30 flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5" />
            Axel IA
          </span>
        </div>
      </div>

      {/* Feedback Dialog */}
      <Dialog
        open={feedback.open}
        onOpenChange={(open) => setFeedback((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-[450px] backdrop-blur-2xl bg-white/[0.03] border-white/10 shadow-2xl">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-400 via-pink-500 to-amber-400" />
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                <Star className="h-4 w-4 text-white" />
              </div>
              Como podemos melhorar?
            </DialogTitle>
            <DialogDescription>
              Sua opinião é fundamental para evoluirmos a plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Feedback</label>
              <Select
                value={feedback.type}
                onValueChange={(v) => setFeedback((prev) => ({ ...prev, type: v }))}
              >
                <SelectTrigger className="bg-white/5 border-white/10 rounded-xl">
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sugestao">💡 Sugestão</SelectItem>
                  <SelectItem value="bug">🐞 Bug / Erro</SelectItem>
                  <SelectItem value="duvida">❓ Dúvida</SelectItem>
                  <SelectItem value="elogio">❤️ Elogio</SelectItem>
                  <SelectItem value="outro">💬 Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Sua mensagem</label>
              <Textarea
                placeholder="Conte-nos em detalhes..."
                value={feedback.message}
                onChange={(e) =>
                  setFeedback((prev) => ({ ...prev, message: e.target.value }))
                }
                className="min-h-[100px] bg-white/5 border-white/10 rounded-xl resize-none focus:border-purple-500/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">
                O quanto você recomendaria o PrimeiroPasso? (0-10)
              </label>
              <div className="flex justify-between gap-1">
                {[...Array(11)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setFeedback((prev) => ({ ...prev, nps: i }))}
                    className={`flex-1 h-9 text-xs rounded-xl transition-all duration-200 ${
                      feedback.nps === i
                        ? "bg-gradient-to-r from-purple-500 to-blue-600 text-white font-bold shadow-lg shadow-purple-500/20 scale-105"
                        : "bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-400 hover:to-blue-500 shadow-lg shadow-purple-500/20"
              onClick={handleSubmitFeedback}
              disabled={feedback.sending}
            >
              {feedback.sending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar Feedback
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
