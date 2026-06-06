import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Send,
  X,
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
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
      return { content: "Clique no botão abaixo para enviar seu feedback! 💬", actions: [{ label: "✍️ Enviar Feedback", action: "open-feedback" }] };
    }

    if (lower.includes("onboarding") || lower.includes("começar") || lower.includes("comecar") || lower.includes("primeiros passos") || lower.includes("iniciar")) {
      return getOnboardingResponse();
    }

    if (lower.includes("conteudo") || lower.includes("conteúdo") || lower.includes("video") || lower.includes("videos") || lower.includes("marketing")) {
      return getContentCreationResponse();
    }

    if (lower.includes("obrigado") || lower.includes("valeu") || lower.includes("brigado")) {
      return { content: "Por nada! 😊 Estou sempre aqui para ajudar. Pode me chamar quando precisar!" };
    }

    if (lower.includes("sim") || lower.includes("quero") || lower.includes("vamos") || lower.includes("bora")) {
      return { content: "Perfeito! 🚀 O que você gostaria de fazer?\n\n- 🎯 **Onboarding** — Se ainda não completou\n- 📝 **Criar conteúdo** — Vídeos, artigos, posts\n- ❓ **FAQ** — Dúvidas sobre a plataforma\n- 💡 **Feedback** — Sugestões ou reportar problemas" };
    }

    // Buscar resposta no FAQ
    const match = findResponse(text);
    if (match) {
      if ("actions" in match && Array.isArray(match.actions)) {
        return { content: match.answer, actions: match.actions as any };
      }
      return { content: match.answer, actions: (match as any).action ? [(match as any).action] : undefined };
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
    if (!input.trim()) return;

    const text = input.trim();
    setInput("");

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
    }, 300); // pequeno delay para parecer natural
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

  return (
    <>
      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 mb-3 ${
              msg.role === "axel" ? "justify-start" : "justify-end"
            }`}
          >
            {msg.role === "axel" && (
              <Avatar className="h-7 w-7 shrink-0 mt-1">
                <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-[10px]">
                  AX
                </AvatarFallback>
              </Avatar>
            )}
            <div className="max-w-[85%]">
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  msg.role === "axel"
                    ? "bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200/50 dark:border-purple-800/30"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap break-words leading-relaxed">
                  {msg.content}
                </p>
              </div>

              {/* Actions */}
              {msg.actions && msg.actions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {msg.actions.map((action, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 gap-1 bg-background/80 hover:bg-background"
                      onClick={() => handleAction(action)}
                    >
                      {action.label.includes("✅") || action.label.includes("⬜") ? null : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
            {msg.role === "user" && (
              <Avatar className="h-7 w-7 shrink-0 mt-1">
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                  <User className="h-3.5 w-3.5" />
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        ))}

        {messages.length === 1 && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1 text-xs bg-background/50 hover:bg-background"
              onClick={() => {
                setInput("quero me ambientar");
                handleSend();
              }}
            >
              <Sparkles className="h-4 w-4 text-purple-500" />
              <span>🎯 Me ambientar</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1 text-xs bg-background/50 hover:bg-background"
              onClick={() => {
                setInput("quero criar conteudo");
                handleSend();
              }}
            >
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              <span>📝 Criar conteúdo</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1 text-xs bg-background/50 hover:bg-background"
              onClick={() => {
                setInput("tenho uma duvida");
                handleSend();
              }}
            >
              <HelpCircle className="h-4 w-4 text-blue-500" />
              <span>❓ FAQ</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-3 flex-col gap-1 text-xs bg-background/50 hover:bg-background"
              onClick={() => handleAction({ label: "Feedback", action: "open-feedback" })}
            >
              <Star className="h-4 w-4 text-amber-500" />
              <span>💡 Feedback</span>
            </Button>
          </div>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-3">
        <div className="flex gap-2">
          <Input
            placeholder="Digite sua mensagem..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 h-9 text-sm"
          />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSend} disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <button
            onClick={clearConversation}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Limpar conversa
          </button>
          <span className="text-[10px] text-muted-foreground/30">🤖 Axel v1.0</span>
        </div>
      </div>

      {/* Feedback Dialog */}
      <Dialog
        open={feedback.open}
        onOpenChange={(open) => setFeedback((prev) => ({ ...prev, open }))}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">💡 Como podemos melhorar?</DialogTitle>
            <DialogDescription>
              Sua opinião é fundamental para evoluirmos a plataforma.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Feedback</label>
              <Select
                value={feedback.type}
                onValueChange={(v) => setFeedback((prev) => ({ ...prev, type: v }))}
              >
                <SelectTrigger>
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
                className="min-h-[100px]"
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
                    className={`flex-1 h-8 text-[10px] rounded transition-colors ${
                      feedback.nps === i
                        ? "bg-primary text-primary-foreground font-bold"
                        : "bg-muted hover:bg-muted/80"
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
              className="w-full gap-2"
              onClick={handleSubmitFeedback}
              disabled={feedback.sending}
            >
              {feedback.sending ? (
                "Enviando..."
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