import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Send,
  Sparkles,
  Bot,
  User,
  ThumbsUp,
  MessageSquare,
  ChevronRight,
  CheckCircle2,
  Lightbulb,
  HelpCircle,
  Star,
  Loader2,
} from "lucide-react";
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

// Conhecimento embutido do Axel (baseado nos arquivos .md)
const FAQ = [
  {
    keywords: ["agenda", "horario", "disponibilidade", "consultas", "agendar"],
    answer:
      "📅 A **Agenda** é onde você gerencia seus horários e consultas. Vou te mostrar o caminho:\n\n**Passo 1:** Vá em `/admin/agenda`\n**Passo 2:** Na aba \"Disponibilidade\", configure seus horários semanais\n**Passo 3:** Os pacientes podem agendar online nos horários disponíveis\n\nQuer que eu te leve até lá agora? 👇",
    action: { label: "Ir para Agenda", href: "/admin/agenda" },
  },
  {
    keywords: ["cliente", "paciente", "lead", "crm", "pipeline", "kanban"],
    answer:
      "👥 O **CRM de Clientes** organiza seus pacientes em etapas:\n\n**Pipeline:** `Novo → Em Conversa → Proposta Feita → Agendado → Cliente Ativo → Inativo`\n\nVocê pode:\n- Arrastar cards entre as colunas\n- Clicar em um card para ver detalhes e conversas\n- Ativar/desativar o Agente IA para cada lead\n\nQuer acessar? 👇",
    action: { label: "Ir para Clientes", href: "/admin/clientes" },
  },
  {
    keywords: ["video", "videos", "conteudo", "conteúdo", "criar", "publicar"],
    answer:
      "🎬 Na seção de **Redes Sociais** você pode criar e gerenciar conteúdo:\n\n- **Artigos:** Posts com carrossel de imagens\n- **Vídeos:** Conteúdo em vídeo terapêutico\n- **Estúdio Viral:** Criação rápida de conteúdo\n- **Personagens/Avatares:** Avatares IA para vídeos\n\nQuer explorar as opções? 👇",
    action: { label: "Ir para Redes Sociais", href: "/admin/redes-sociais" },
  },
  {
    keywords: ["perfil", "foto", "crp", "bio", "informacoes", "informações"],
    answer:
      "👤 O **Perfil** é onde você cadastra suas informações profissionais:\n\n- Nome, CRP, e-mail, telefone\n- Foto profissional\n- Biografia e abordagens terapêuticas\n- Links para redes sociais (Instagram, Facebook, LinkedIn)\n- Personalização de cores e fontes\n\nVamos completar seu perfil? 👇",
    action: { label: "Ir para Perfil", href: "/admin/perfil" },
  },
  {
    keywords: ["landing", "pagina", "página", "site", "publico", "público"],
    answer:
      "🎨 Sua **Landing Page** é a página pública que seus pacientes veem! Ela inclui:\n\n- Hero com sua foto e chamada\n- Seção explicando como você ajuda\n- Biografia e abordagens\n- Preços e serviços\n- Botão de agendamento online\n\nQue tal dar uma olhada e personalizar? 👇",
    action: { label: "Ir para Landing Page", href: "/admin/landing" },
  },
  {
    keywords: ["assinatura", "plano", "pagar", "pagamento", "pix", "credito", "crédito"],
    answer:
      "💳 Na página de **Assinatura** você gerencia:\n\n- Seu plano atual\n- Pagamento via PIX\n- Saldo de créditos para usar IA avançada\n- Histórico de pagamentos\n\nPara manter tudo funcionando, é importante manter a assinatura ativa! 👇",
    action: { label: "Ir para Assinatura", href: "/admin/assinatura" },
  },
  {
    keywords: ["feedback", "sugestao", "sugestão", "bug", "problema", "melhoria", "opiniao", "opinião"],
    answer:
      "💡 Sua opinião é muito importante! Que tipo de feedback você gostaria de dar?\n\nClique no botão abaixo para abrir o formulário 👇",
    action: { label: "✍️ Enviar Feedback", action: "open-feedback" },
  },
  {
    keywords: ["whatsapp", "zap", "conectar", "evolution", "integracao", "integração"],
    answer:
      "📱 O **WhatsApp** é integrado via Evolution API. Para conectar:\n\n1. Vá em `/admin/clientes`\n2. Clique no botão **\"WhatsApp\"** no topo\n3. Escaneie o QR Code com seu WhatsApp\n4. Pronto! Leads podem conversar com você pelo Zap\n\nQuer configurar agora? 👇",
    action: { label: "Configurar WhatsApp", href: "/admin/clientes" },
  },
  {
    keywords: ["teleconsulta", "videochamada", "online", "remoto", "consulta online"],
    answer:
      "📹 A **Teleconsulta** é feita diretamente pela plataforma!\n\n- Videochamada integrada sem precisar de Zoom/Google Meet\n- Link automático gerado para cada consulta\n- Disponível tanto para você quanto para o paciente\n\nFunciona direto da **Agenda**! 👇",
    action: { label: "Ver Agenda", href: "/admin/agenda" },
  },
];

// Respostas de saudação/fallback
const GREETINGS = [
  {
    keywords: ["oi", "olá", "ola", "hey", "bom dia", "boa tarde", "boa noite", "hello", "start"],
    answer:
      "Olá! 👋 Eu sou o **Axel**, seu assistente pessoal do PrimeiroPasso!\n\nEstou aqui para te ajudar com:\n\n🚀 **Ambientação** — Te guiar pela plataforma\n📝 **Conteúdo** — Criar vídeos e materiais de marketing\n❓ **Dúvidas** — Explicar funcionalidades\n💡 **Feedback** — Ouvir suas sugestões\n\nPor onde você gostaria de começar?",
    actions: [
      { label: "🚀 Quero me ambientar", action: "onboarding" },
      { label: "📝 Criar conteúdo", action: "content-creation" },
      { label: "❓ Tirar dúvidas", action: "faq" },
      { label: "💡 Dar feedback", action: "open-feedback" },
    ],
  },
];

const FALLBACK_RESPONSES = [
  "Hmm, não tenho certeza sobre isso ainda. 🤔\n\nPosso te ajudar com:\n- 🚀 **Ambientação** na plataforma\n- 📝 **Criação de conteúdo**\n- ❓ **FAQ** sobre funcionalidades\n- 💡 **Feedback**\n\nOu se preferir, pode falar com o suporte diretamente!",
  "Desculpa, não encontrei uma resposta para isso. 😅\n\nQue tal explorarmos uma dessas opções?\n- 🚀 Tour guiado pela plataforma\n- 📝 Ajuda para criar conteúdo\n- ❓ Dúvidas comuns\n- 💡 Enviar feedback",
];

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

export default function AxelChat() {
  const {
    memory,
    messages,
    addMessage,
    clearConversation,
    markFirstContact,
    incrementInteraction,
    updateMemory,
  } = useAxelMemory();
  const { profile } = useAuth();

  const [input, setInput] = useState("");
  const [feedback, setFeedback] = useState<FeedbackDialogState>(INITIAL_FEEDBACK);
  const [isProcessing, setIsProcessing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [messages]);

  // Mensagem de boas-vindas na primeira interação
  useEffect(() => {
    if (messages.length === 0) {
      const greeting = GREETINGS[0];
      const personalizedGreeting = memory.name
        ? greeting.answer.replace("Olá!", `Olá **${memory.name.split(" ")[0]}!`)
        : greeting.answer;

      addMessage({
        role: "axel",
        content: personalizedGreeting,
        actions: greeting.actions,
      });
    }
  }, []);

  // Encontrar resposta baseada em keywords
  const findResponse = (text: string) => {
    const lower = text.toLowerCase();

    // Verificar saudações primeiro
    for (const g of GREETINGS) {
      if (g.keywords.some((kw) => lower.includes(kw))) {
        return g;
      }
    }

    // Verificar FAQ
    for (const item of FAQ) {
      if (item.keywords.some((kw) => lower.includes(kw))) {
        return item;
      }
    }

    return null;
  };

  const processUserMessage = (text: string) => {
    const lower = text.toLowerCase();

    // Comandos especiais
    if (lower.includes("feedback") || lower.includes("sugestão") || lower.includes("sugestao")) {
      setFeedback((prev) => ({ ...prev, open: true }));
      return {
        content: "Clique no botão abaixo para enviar seu feedback! 💬",
        actions: [{ label: "✍️ Enviar Feedback", action: "open-feedback" }],
      };
    }

    if (
      lower.includes("onboarding") ||
      lower.includes("começar") ||
      lower.includes("comecar") ||
      lower.includes("primeiros passos") ||
      lower.includes("iniciar")
    ) {
      return getOnboardingResponse();
    }

    if (
      lower.includes("conteudo") ||
      lower.includes("conteúdo") ||
      lower.includes("video") ||
      lower.includes("videos") ||
      lower.includes("marketing")
    ) {
      return getContentCreationResponse();
    }

    if (lower.includes("obrigado") || lower.includes("valeu") || lower.includes("brigado")) {
      return { content: "Por nada! 😊 Estou sempre aqui para ajudar. Pode me chamar quando precisar!" };
    }

    if (
      lower.includes("sim") ||
      lower.includes("quero") ||
      lower.includes("vamos") ||
      lower.includes("bora")
    ) {
      return {
        content:
          "Perfeito! 🚀 O que você gostaria de fazer?\n\n- 🎯 **Onboarding** — Se ainda não completou\n- 📝 **Criar conteúdo** — Vídeos, artigos, posts\n- ❓ **FAQ** — Dúvidas sobre a plataforma\n- 💡 **Feedback** — Sugestões ou reportar problemas",
      };
    }

    // Buscar resposta no FAQ
    const match = findResponse(text);
    if (match) {
      if ("actions" in match && Array.isArray(match.actions)) {
        return { content: match.answer, actions: match.actions as any };
      }
      return {
        content: match.answer,
        actions: (match as any).action ? [(match as any).action] : undefined,
      };
    }

    // Fallback
    const fb = FALLBACK_RESPONSES[Math.floor(Math.random() * FALLBACK_RESPONSES.length)];
    return { content: fb };
  };

  const getOnboardingResponse = () => {
    const checklist = [
      { label: "Perfil completo", done: memory.profileComplete, href: "/admin/perfil" },
      { label: "Agenda configurada", done: memory.agendaConfigured, href: "/admin/agenda" },
      { label: "Landing Page publicada", done: memory.landingPublished, href: "/admin/landing" },
      { label: "WhatsApp conectado", done: memory.whatsappConnected, href: "/admin/clientes" },
      { label: "Primeiro conteúdo criado", done: memory.firstContentCreated, href: "/admin/redes-sociais" },
      { label: "Assinatura ativa", done: memory.subscriptionActive, href: "/admin/assinatura" },
    ];

    const doneCount = checklist.filter((c) => c.done).length;
    const totalCount = checklist.length;
    const progress = Math.round((doneCount / totalCount) * 100);

    let items = "";
    checklist.forEach((item) => {
      items += `\n${item.done ? "✅" : "⬜"} **${item.label}**`;
      if (!item.done) {
        items += ` — [Ir →](${item.href})`;
      }
    });

    const content =
      progress === 100
        ? `🎉 **Parabéns!** Você completou todos os passos de ambientação!\n\nDeseja explorar outras funcionalidades ou tem alguma dúvida?`
        : `🎯 **Seu Progresso: ${progress}%**\n\nAqui está o checklist de ambientação:${items}\n\n${
            doneCount === 0
              ? "Que tal começarmos pelo **Perfil**? É rapidinho!"
              : `Faltam ${totalCount - doneCount} passo(s). Vamos continuar?`
          }\n\nMarque os itens como concluídos que eu acompanho seu progresso! 🚀`;

    const undoneItem = checklist.find((c) => !c.done);
    const actions = undoneItem
      ? [{ label: `➡️ ${undoneItem.label}`, href: undoneItem.href }]
      : [{ label: "📝 Criar conteúdo agora", action: "content-creation" }];

    if (actions.length > 0) {
      return { content, actions };
    }
    return { content };
  };

  const getContentCreationResponse = () => {
    return {
      content:
        "📝 **Produção de Conteúdo — Como posso ajudar?**\n\nTenho algumas ideias para você:\n\n🎬 **Vídeos** — Roteiros para vídeos terapêuticos\n📄 **Artigos** — Posts para seu blog/site\n📱 **Redes Sociais** — Estratégias de conteúdo\n🎨 **Estúdio Viral** — Conteúdo de impacto rápido\n\nO que te interessa mais? 👇",
      actions: [
        { label: "🎬 Criar vídeo", href: "/admin/redes-sociais?tab=criar-video" },
        { label: "📄 Escrever artigo", href: "/admin/redes-sociais?tab=artigos" },
        { label: "📱 Redes Sociais", href: "/admin/redes-sociais" },
      ],
    };
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const text = input.trim();
    setInput("");
    setIsProcessing(true);

    // Adicionar mensagem do usuário
    addMessage({ role: "user", content: text });
    incrementInteraction();

    // Registrar primeiro contato
    if (!memory.firstContactDone) {
      markFirstContact();
    }

    // Processar resposta
    setTimeout(() => {
      const response = processUserMessage(text);
      addMessage({
        role: "axel",
        content: response.content,
        actions: response.actions,
      });
      setIsProcessing(false);
      // Focus back on input
      inputRef.current?.focus();
    }, 500 + Math.random() * 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAction = (action: { label: string; href?: string; action?: string }) => {
    if (action.href) {
      window.location.href = action.href;
    }
    if (action.action === "open-feedback") {
      setFeedback((prev) => ({ ...prev, open: true }));
    }
    if (action.action === "onboarding") {
      const response = getOnboardingResponse();
      addMessage({ role: "axel", content: response.content, actions: response.actions });
    }
    if (action.action === "content-creation") {
      const response = getContentCreationResponse();
      addMessage({ role: "axel", content: response.content, actions: response.actions });
    }
    if (action.action === "faq") {
      addMessage({
        role: "axel",
        content:
          "❓ **FAQ — Dúvidas Frequentes**\n\nPergunte sobre qualquer funcionalidade:\n\n📅 **Agenda** — Horários, consultas, bloqueios\n👥 **Clientes** — CRM, leads, pipeline\n📝 **Conteúdo** — Artigos, vídeos, posts\n👤 **Perfil** — Informações, foto, redes sociais\n🎨 **Landing Page** — Página profissional\n💳 **Assinatura** — Planos, pagamentos, créditos\n📱 **WhatsApp** — Conexão e integração\n📹 **Teleconsulta** — Videochamadas\n\nÉ só perguntar! 😊",
      });
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

      toast.success("Feedback enviado com sucesso! Obrigado! 💜");
      addMessage({
        role: "axel",
        content:
          "Recebi seu feedback! Muito obrigado por compartilhar sua opinião. 💜\n\nIsso me ajuda a melhorar cada vez mais para oferecer uma experiência incrível para você.\n\nTem mais alguma coisa em que posso ajudar? 😊",
      });
      setFeedback(INITIAL_FEEDBACK);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao enviar feedback. Tente novamente.");
    } finally {
      setFeedback((prev) => ({ ...prev, sending: false }));
    }
  };

  // Formatar timestamp relativo simples
  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "agora";
    if (mins < 60) return `${mins}min`;
    const hours = Math.floor(mins / 60);
    return `${hours}h`;
  };

  return (
    <>
      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 sm:p-4 space-y-0.5">
          {messages.map((msg, idx) => {
            const isAxel = msg.role === "axel";
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
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

                <div className={`max-w-[85%] sm:max-w-[75%] ${!showAvatar && isAxel ? "ml-9 sm:ml-10" : ""} ${!showAvatar && !isAxel ? "mr-9 sm:mr-10" : ""}`}>
                  {/* Time stamp above first in group */}
                  {showAvatar && (
                    <span className={`text-[10px] text-muted-foreground/50 mb-1 block ${isAxel ? "ml-1" : "text-right mr-1"}`}>
                      {isAxel ? "Axel" : "Você"} • {getRelativeTime(new Date(msg.created_at || Date.now()))}
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
                    <p className="whitespace-pre-wrap break-words text-[13px] sm:text-sm">{msg.content}</p>
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

          {/* Quick Actions Grid (shown only when just greeting is present) */}
          {messages.length === 1 && (
            <div className="mt-6">
              <p className="text-[10px] text-muted-foreground/50 text-center mb-3">
                Ou escolha uma opção rápida:
              </p>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <button
                  onClick={() => {
                    setInput("quero me ambientar");
                    handleSend();
                  }}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.05] hover:border-purple-500/20 transition-all duration-200 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Sparkles className="h-5 w-5 text-purple-400" />
                  </div>
                  <span className="text-xs font-medium">🎯 Me ambientar</span>
                </button>
                <button
                  onClick={() => {
                    setInput("quero criar conteudo");
                    handleSend();
                  }}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.05] hover:border-yellow-500/20 transition-all duration-200 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Lightbulb className="h-5 w-5 text-yellow-400" />
                  </div>
                  <span className="text-xs font-medium">📝 Criar conteúdo</span>
                </button>
                <button
                  onClick={() => {
                    setInput("tenho uma duvida");
                    handleSend();
                  }}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.05] hover:border-blue-500/20 transition-all duration-200 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <HelpCircle className="h-5 w-5 text-blue-400" />
                  </div>
                  <span className="text-xs font-medium">❓ FAQ</span>
                </button>
                <button
                  onClick={() => handleAction({ label: "Feedback", action: "open-feedback" })}
                  className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md hover:bg-white/[0.05] hover:border-amber-500/20 transition-all duration-200 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                    <Star className="h-5 w-5 text-amber-400" />
                  </div>
                  <span className="text-xs font-medium">💡 Feedback</span>
                </button>
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
          <button
            onClick={clearConversation}
            className="text-[9px] sm:text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors flex items-center gap-1"
          >
            <span className="inline-block w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-muted-foreground/20" />
            Limpar conversa
          </button>
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