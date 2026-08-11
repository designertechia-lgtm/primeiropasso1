import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAxelMemory } from "@/hooks/useAxelMemory";
import { useProfessional } from "@/hooks/useProfessional";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  User,
  Phone,
  MessageSquare,
  Sparkles,
  Star,
  Send,
  MessageCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  ThumbsUp,
  Lightbulb,
  Bug,
  Heart,
  HelpCircle,
  FileText,
  MessageSquareText,
  Loader2,
  ChevronDown,
  Filter,
  ArrowUp,
  MoreVertical,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useSendWhatsApp, useEvolutionStatus } from "@/hooks/useSendWhatsApp";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Lead } from "@/hooks/useLeadsKanban";
import { useToggleAgentEnabled } from "@/hooks/useUpdateLeadStage";
import { useWhatsAppAvatar } from "@/hooks/useWhatsAppAvatar";
import AxelChat from "@/components/admin/AxelChat";
import ChatTexto from "@/components/admin/ChatTexto";

type TabType = "axel" | "leads" | "feedback";

const TABS: { id: TabType; label: string; icon: React.ElementType; gradient: string; glow: string }[] = [
  { id: "axel", label: "Axel Web", icon: Sparkles, gradient: "from-violet-500 via-purple-500 to-indigo-500", glow: "shadow-purple-500/25" },
  { id: "leads", label: "Axel Whats", icon: MessageSquare, gradient: "from-emerald-400 via-green-500 to-teal-500", glow: "shadow-emerald-500/25" },
  { id: "feedback", label: "Feedback", icon: Star, gradient: "from-amber-400 via-orange-500 to-rose-500", glow: "shadow-orange-500/25" },
];

// ==================== MAIN PAGE ====================
export default function AdminAxelChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: TabType = (searchParams.get("tab") as TabType) || "axel";

  const setTab = (tab: TabType) => setSearchParams({ tab }, { replace: true });

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] sm:h-[calc(100vh-5rem)]">
      {/* Tab Navigation - compacta */}
      <div className="flex gap-1 mb-2 sm:mb-3 p-0.5 sm:p-1 rounded-xl bg-muted border border-border/60 shadow-sm overflow-x-auto shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`relative flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg transition-all duration-300 text-[11px] sm:text-sm font-semibold whitespace-nowrap ${
              activeTab === tab.id
                ? `bg-gradient-to-r ${tab.gradient} text-white shadow-md ${tab.glow}`
                : "text-muted-foreground hover:text-foreground hover:bg-background/70"
            }`}
          >
            <tab.icon className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {activeTab === "axel" && <AxelTab />}
        {activeTab === "leads" && <LeadsTab />}
        {activeTab === "feedback" && <FeedbackTab />}
      </div>
    </div>
  );
}

// ==================== AXEL TAB ====================
function AxelTab() {
  const { memory } = useAxelMemory();
  return (
    <div className="flex flex-col h-full rounded-lg sm:rounded-xl overflow-hidden border border-border/60 bg-card shadow-lg">
      {/* Header - compacto */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/60 shrink-0">
        <Avatar className="h-7 w-7 sm:h-8 sm:w-8 ring-1 ring-purple-500/20">
          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-600 text-white text-[9px] sm:text-[10px] font-bold">AX</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm sm:text-base font-semibold truncate">Axel</h2>
          <p className="text-[10px] text-muted-foreground/70 truncate">
            {memory.name ? `Assistente de ${memory.name.split(" ")[0]}` : "IA • PrimeiroPasso"}
          </p>
        </div>
        <Badge className="gap-1 bg-muted border border-border/60 text-muted-foreground px-1.5 py-0 text-[9px] sm:text-[10px] shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-purple-500" />
          </span>
          Online
        </Badge>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden">
        <AxelChat isDedicatedPage />
      </div>
    </div>
  );
}

// ==================== LEADS TAB ====================
function LeadsTab() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  return (
    <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 h-full">
      {/* Mobile: botão voltar quando chat está aberto */}
      {selectedLeadId && (
        <button
          onClick={() => setSelectedLeadId(null)}
          className="sm:hidden flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-1 py-1 shrink-0"
        >
          <ChevronDown className="h-4 w-4 rotate-90" />
          Voltar para conversas
        </button>
      )}

      {/* Sidebar - escondida no mobile quando chat está aberto */}
      <div className={`${selectedLeadId ? "hidden sm:flex" : "flex"} sm:w-64 lg:w-72 shrink-0 flex-col`}>
        <LeadList onSelect={setSelectedLeadId} selectedId={selectedLeadId} />
      </div>

      {/* Chat area */}
      <div className={`flex-1 min-w-0 ${!selectedLeadId ? "hidden sm:block" : ""}`}>
        {selectedLeadId ? (
          <LeadChat leadId={selectedLeadId} onDeleted={() => setSelectedLeadId(null)} />
        ) : (
          <div className="h-full hidden sm:flex items-center justify-center rounded-lg sm:rounded-xl border border-border/60 bg-card shadow-lg">
            <div className="text-center p-6">
              <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-3 rounded-full bg-muted border border-border/60 flex items-center justify-center">
                <MessageCircle className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground font-medium">Selecione um lead</p>
              <p className="text-[11px] text-muted-foreground/50 mt-1">As conversas aparecerão aqui</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== LEAD LIST ====================
function LeadItem({ lead, onSelect, isSelected }: { lead: Lead; onSelect: (id: string) => void; isSelected: boolean }) {
  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  // Buscar foto de perfil do WhatsApp (cacheada ou nova)
  const { data: avatar } = useWhatsAppAvatar(
    lead.id,
    lead.whatsapp,
    lead.avatar_url
  );

  const avatarSrc = avatar?.pictureUrl || lead.avatar_url || null;

  return (
    <button
      onClick={() => onSelect(lead.id)}
      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg transition-all duration-150 text-left ${
        isSelected
          ? "bg-emerald-500/10 border border-emerald-500/20"
          : "hover:bg-muted border border-transparent"
      }`}
    >
      <Avatar className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 ring-1 ring-emerald-500/20">
        {avatarSrc ? (
          <AvatarImage src={avatarSrc} alt={lead.name} className="object-cover" />
        ) : null}
        <AvatarFallback className="text-[10px] sm:text-xs bg-gradient-to-br from-emerald-400 to-teal-500 text-white font-semibold">
          {getInitials(lead.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-1.5">
          <p className="text-xs sm:text-sm font-medium truncate">{lead.name}</p>
          {lead.last_message_at && (
            <span className="text-[9px] sm:text-[10px] text-muted-foreground shrink-0">
              {format(new Date(lead.last_message_at), "dd/MM", { locale: ptBR })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
          {lead.whatsapp && (
            <span className="flex items-center gap-0.5">
              <Phone className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              {lead.whatsapp}
            </span>
          )}
          {lead.pipeline_stage && (
            <span className="capitalize bg-muted px-1 py-0 rounded text-[9px]">{lead.pipeline_stage.replace(/_/g, " ")}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function LeadList({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId: string | null }) {
  const { data: professional } = useProfessional();
  const { data: leads = [] } = useQuery({
    queryKey: ["axel-chat-leads", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("professional_id", professional!.id)
        .not("last_message_at", "is", null)
        .order("last_message_at", { ascending: false })
        .limit(50);
      return (data ?? []) as Lead[];
    },
    enabled: !!professional?.id,
    refetchInterval: 30_000,
  });

  return (
    <div className="h-full rounded-lg sm:rounded-xl overflow-hidden border border-border/60 bg-card shadow-lg flex flex-col">
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/60 flex items-center justify-between shrink-0">
        <h3 className="font-semibold text-xs sm:text-sm flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-emerald-400" />
          Conversas
        </h3>
        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] sm:text-[10px] px-1.5 py-0">{leads.length}</Badge>
      </div>
      <ScrollArea className="flex-1">
        {leads.length === 0 ? (
          <div className="text-center py-10 text-xs sm:text-sm text-muted-foreground px-4">
            <MessageCircle className="h-6 w-6 sm:h-8 sm:w-8 mx-auto mb-2 opacity-20" />
            Nenhuma conversa ativa
          </div>
        ) : (
          <div className="p-1.5 space-y-0.5">
            {leads.map((lead) => (
              <LeadItem key={lead.id} lead={lead} onSelect={onSelect} isSelected={selectedId === lead.id} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ==================== LEAD CHAT ====================
function LeadChat({ leadId, onDeleted }: { leadId: string; onDeleted?: () => void }) {
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "messages" | "lead">(null);
  const [deleting, setDeleting] = useState(false);
  const toggleAgent = useToggleAgentEnabled();
  const sendWhatsApp = useSendWhatsApp();
  const { data: professional } = useProfessional();
  const { data: evoStatus, isError: evoStatusError } = useEvolutionStatus(professional?.id);

  const { data: lead } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: async () => { const { data } = await supabase.from("leads").select("*").eq("id", leadId).single(); return data as Lead | null; },
    enabled: !!leadId,
  });

  const { data: messages = [], isLoading } = useChatMessages(leadId, "page");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const viewport = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
    if (!viewport) return;
    const dist = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (dist < 300 || messages.length <= 4) viewport.scrollTop = viewport.scrollHeight;
  }, [messages]);

  const handleSendMessage = async () => {
    if (!messageText.trim() || sending) return;
    setSending(true);
    try {
      await supabase.from("chat_messages" as any).insert({ lead_id: leadId, role: "professional", content: messageText.trim() } as any);
      await supabase.from("leads").update({ last_message_at: new Date().toISOString() }).eq("id", leadId);
      const sentContent = messageText.trim();
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["chat-messages", leadId] });
      if (lead?.whatsapp && !evoStatusError && evoStatus?.status === "open") {
        try { await sendWhatsApp.mutateAsync({ to: lead.whatsapp, message: sentContent }); }
        catch (waError) { console.error("[WhatsApp send]", waError); const msg = waError instanceof Error ? waError.message : "Erro desconhecido"; toast.error(`Mensagem salva, mas WhatsApp falhou: ${msg}`); }
      } else if (lead?.whatsapp && !evoStatusError) { toast.error("WhatsApp não conectado. Conecte em Clientes → WhatsApp"); }
      await supabase.from("leads").update({ agent_enabled: false }).eq("id", leadId);
    } catch (error) { console.error(error); toast.error("Erro ao enviar mensagem"); }
    finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } };
  // Buscar foto de perfil do WhatsApp para o header
  const { data: avatarData } = useWhatsAppAvatar(leadId, lead?.whatsapp, lead?.avatar_url);
  const headerAvatarSrc = avatarData?.pictureUrl || lead?.avatar_url || null;

  const handleClearMessages = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("owner_clear_lead_messages" as any, { p_lead_id: leadId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["chat-messages", leadId] });
      toast.success("Mensagens apagadas.");
    } catch (e: any) {
      toast.error("Erro ao apagar mensagens", { description: e.message });
    } finally {
      setDeleting(false);
      setConfirmAction(null);
    }
  };

  const handleDeleteLead = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.rpc("owner_delete_lead" as any, { p_lead_id: leadId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["axel-chat-leads"] });
      toast.success("Lead apagado.");
      onDeleted?.();
    } catch (e: any) {
      toast.error("Erro ao apagar lead", { description: e.message });
    } finally {
      setDeleting(false);
      setConfirmAction(null);
    }
  };

  if (!lead) return null;

  return (
    <div className="h-full flex flex-col rounded-lg sm:rounded-xl overflow-hidden border border-border/60 bg-card shadow-lg">
      {/* Header - compacto */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-2.5 border-b border-border/60 shrink-0">
        <Avatar className="h-7 w-7 sm:h-8 sm:w-8 ring-1 ring-emerald-500/20">
          {headerAvatarSrc ? (
            <AvatarImage src={headerAvatarSrc} alt={lead.name} className="object-cover" />
          ) : null}
          <AvatarFallback className="text-[10px] sm:text-xs bg-gradient-to-br from-emerald-400 to-teal-500 text-white font-semibold">
            {lead.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm sm:text-base font-semibold truncate">{lead.name}</h2>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{lead.whatsapp || lead.email || "Sem contato"}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 bg-muted rounded-full px-2 py-1 border border-border/60">
            <Bot className={`h-3 w-3 ${lead.agent_enabled ? "text-emerald-400" : "text-muted-foreground"}`} />
            <Switch checked={lead.agent_enabled} onCheckedChange={(checked) => toggleAgent.mutate({ leadId: lead.id, enabled: checked })} className="scale-75 data-[state=checked]:bg-emerald-500" />
          </div>
          <Badge className="bg-muted border-border/60 text-[10px] sm:text-xs capitalize px-1.5 py-0">{lead.pipeline_stage?.replace(/_/g, " ")}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted" aria-label="Ações do lead">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setConfirmAction("messages")} className="text-xs gap-2 cursor-pointer">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                Apagar mensagens
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setConfirmAction("lead")} className="text-xs gap-2 cursor-pointer text-destructive focus:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
                Apagar lead
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Collected Info - compacto */}
      {lead.collected_info && typeof lead.collected_info === "object" && Object.keys(lead.collected_info).length > 0 && (
        <div className="px-3 sm:px-4 py-1.5 border-b border-border/60 bg-muted shrink-0">
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] sm:text-xs">
            {Object.entries(lead.collected_info).map(([key, value]) => (
              <span key={key} className="text-muted-foreground"><span className="font-medium capitalize text-foreground/80">{key.replace(/_/g, " ")}:</span> {String(value)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 p-3 sm:p-4" ref={scrollRef}>
        {isLoading ? (
          <div className="flex items-center justify-center h-full"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 sm:w-14 sm:h-14 mx-auto mb-2 rounded-full bg-muted backdrop-blur-md border border-border/60 flex items-center justify-center"><Bot className="h-6 w-6 sm:h-7 sm:w-7 text-muted-foreground/30" /></div>
            <p className="text-xs sm:text-sm text-muted-foreground font-medium">Nenhuma mensagem ainda</p>
            <p className="text-[10px] sm:text-xs text-muted-foreground/50 mt-0.5">Envie a primeira mensagem para este lead</p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 rounded-xl bg-muted/20 p-3 bg-[radial-gradient(120%_75%_at_0%_0%,hsl(var(--primary)/0.10),transparent_62%),radial-gradient(105%_70%_at_100%_100%,hsl(var(--accent)/0.09),transparent_66%)]">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const isAssistant = msg.role === "assistant";
              return (
                <div key={msg.id} className={`flex gap-2 ${isUser ? "justify-start" : "justify-end"}`}>
                  {isUser && (
                    <Avatar className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 ring-1 ring-border">
                      {headerAvatarSrc ? <AvatarImage src={headerAvatarSrc} alt={lead.name} className="object-cover" /> : null}
                      <AvatarFallback className="text-[10px] sm:text-xs bg-gradient-to-br from-emerald-400 to-teal-500 text-white"><User className="h-3 w-3 sm:h-3.5 sm:w-3.5" /></AvatarFallback>
                    </Avatar>
                  )}
                  <div className={`rounded-2xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm max-w-[80%] sm:max-w-[70%] backdrop-blur-sm ${
                    isUser ? "bg-card border border-border/60 rounded-tl-md shadow-sm" : "bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-tr-md shadow-md shadow-emerald-500/20"
                  }`}>
                    <ChatTexto texto={msg.content} className="font-chat leading-relaxed" />
                    <p className={`text-[9px] sm:text-[10px] mt-1.5 ${isUser ? "text-muted-foreground" : "text-white/50"}`}>
                      {format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                  {!isUser && (
                    <Avatar className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 ring-1 ring-border">
                      <AvatarFallback className={`text-[10px] sm:text-xs ${isAssistant ? "bg-muted text-muted-foreground" : "bg-gradient-to-br from-emerald-400 to-teal-500 text-white"}`}>
                        {isAssistant ? <Bot className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> : <User className="h-3 w-3 sm:h-3.5 sm:w-3.5" />}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Input - compacto */}
      <div className="border-t border-border/60 p-2 sm:p-2.5 bg-muted shrink-0">
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Digite sua mensagem..."
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-9 sm:h-10 text-xs sm:text-sm bg-muted border-border/60 rounded-xl focus:border-emerald-500/50 transition-all"
            disabled={sending}
          />
          <Button
            size="icon"
            className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/20 transition-all duration-200 active:scale-95"
            onClick={handleSendMessage}
            disabled={!messageText.trim() || sending}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmAction !== null} onOpenChange={(o) => { if (!o) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "lead" ? "Apagar este lead?" : "Apagar as mensagens?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "lead"
                ? `Isso remove ${lead.name} de vez: a conversa, o agendamento vinculado e os lembretes. Não dá pra desfazer.`
                : `Isso apaga todo o histórico de conversa com ${lead.name}. Não dá pra desfazer.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => { e.preventDefault(); if (confirmAction === "lead") { handleDeleteLead(); } else { handleClearMessages(); } }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Apagando..." : confirmAction === "lead" ? "Apagar lead" : "Apagar mensagens"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ==================== FEEDBACK TAB ====================
interface FeedbackItem {
  id: string;
  author_id: string;
  type: string;
  message: string;
  nps_score: number | null;
  status: string;
  severity: string;
  created_at: string;
  response?: string | null;
  response_at?: string | null;
  responded_by?: string | null;
}

const FEEDBACK_TYPE_ICONS: Record<string, React.ElementType> = { sugestao: Lightbulb, bug: Bug, duvida: HelpCircle, elogio: Heart, outro: FileText };
const FEEDBACK_TYPE_COLORS: Record<string, string> = { sugestao: "from-amber-400 to-orange-500", bug: "from-red-400 to-rose-500", duvida: "from-blue-400 to-indigo-500", elogio: "from-pink-400 to-rose-400", outro: "from-slate-400 to-gray-500" };
const FEEDBACK_TYPE_LABELS: Record<string, string> = { sugestao: "Sugestão", bug: "Bug / Erro", duvida: "Dúvida", elogio: "Elogio", outro: "Outro" };

function getStatusBadge(status: string) {
  const config: Record<string, { icon: React.ElementType; label: string; className: string }> = {
    novo: { icon: Clock, label: "Novo", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    em_analise: { icon: AlertCircle, label: "Em Análise", className: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
    resolvido: { icon: CheckCircle2, label: "Resolvido", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    arquivado: { icon: FileText, label: "Arquivado", className: "bg-muted text-muted-foreground border-border/60" },
  };
  const c = config[status] || config.novo;
  const Icon = c.icon;
  return (<span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.className}`}><Icon className="h-3 w-3" />{c.label}</span>);
}

function FeedbackTab() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("sugestao");
  const [message, setMessage] = useState("");
  const [nps, setNps] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const formRef = useRef<HTMLDivElement>(null);

  const { data: feedbacks = [], isLoading } = useQuery({
    queryKey: ["my-feedbacks-list", user?.id],
    queryFn: async () => {
      const { data: prof, error: profErr } = await supabase.from("professionals").select("id").eq("user_id", user!.id).maybeSingle();
      if (profErr || !prof?.id) return [];
      const { data, error } = await supabase.from("feedbacks").select("*").eq("author_id", prof.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FeedbackItem[];
    },
    enabled: !!user?.id,
    refetchInterval: 30_000,
  });

  const handleSubmit = async () => {
    if (!message) { toast.error("Por favor, escreva sua mensagem."); return; }
    if (!user?.id) { toast.error("Você precisa estar logado."); return; }
    setSending(true);
    try {
      const { data: prof, error: profErr } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
      if (profErr) throw profErr;
      if (!prof?.id) { toast.error("Não encontramos seu cadastro de profissional."); return; }
      const { error } = await supabase.from("feedbacks" as any).insert({ author_id: prof.id, type, message, nps_score: nps, status: "novo", severity: "baixa" } as any);
      if (error) throw error;
      toast.success("Feedback enviado com sucesso! 💜");
      setMessage(""); setNps(null); setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["my-feedbacks-list"] });
    } catch (error) { console.error(error); toast.error("Erro ao enviar feedback."); }
    finally { setSending(false); }
  };

  useEffect(() => { if (showForm && formRef.current) formRef.current.scrollIntoView({ behavior: "smooth", block: "center" }); }, [showForm]);

  const filteredFeedbacks = statusFilter === "all" ? feedbacks : feedbacks.filter((f) => f.status === statusFilter);
  const stats = { total: feedbacks.length, resolvido: feedbacks.filter((f) => f.status === "resolvido").length, emAnalise: feedbacks.filter((f) => f.status === "em_analise").length, novo: feedbacks.filter((f) => f.status === "novo").length };

  return (
    <div className="h-full rounded-xl sm:rounded-2xl overflow-hidden border border-border/60 bg-gradient-to-br from-background via-background to-amber-950/5 backdrop-blur-sm shadow-lg flex flex-col">
      {/* Header - compacto */}
      <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-b border-border/60 flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-sm sm:text-base font-semibold flex items-center gap-2">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"><Star className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" /></div>
            Meus Feedbacks
          </h2>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Suas sugestões e respostas do time</p>
        </div>
        <Button onClick={() => { setShowForm(!showForm); setExpandedId(null); }}
          className={`gap-1.5 rounded-lg text-xs sm:text-sm transition-all duration-300 ${
            showForm ? "bg-muted hover:bg-muted border border-border/60 h-8 sm:h-9" : "bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-500/20 h-8 sm:h-9"
          }`}
        >
          {showForm ? "Cancelar" : <><MessageSquareText className="h-3.5 w-3.5" />Novo</>}
        </Button>
      </div>

      {/* Stats Bar - compacto */}
      <div className="px-4 sm:px-5 py-1.5 sm:py-2 border-b border-border/60 bg-muted shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {[
            { key: "all", label: "Todos", count: stats.total, color: "" },
            { key: "novo", label: "Novos", count: stats.novo, color: "bg-blue-400" },
            { key: "em_analise", label: "Em Análise", count: stats.emAnalise, color: "bg-yellow-400" },
            { key: "resolvido", label: "Resolvidos", count: stats.resolvido, color: "bg-emerald-400" },
          ].map(({ key, label, count, color }) => (
            <button key={key} onClick={() => setStatusFilter(key)}
              className={`text-[10px] sm:text-xs font-medium px-2 sm:px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                statusFilter === key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-background/70"
              }`}
            >
              {color && <span className={`w-1.5 h-1.5 rounded-full ${color}`} />}
              {label} ({count})
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-3 sm:p-4">
          {/* New Feedback Form */}
          {showForm && (
            <div ref={formRef} className="mb-4">
              <Card className="backdrop-blur-xl bg-muted border-border/60 shadow-xl overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500" />
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg font-semibold flex items-center gap-2">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"><MessageSquareText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-white" /></div>
                    Novo Feedback
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-medium flex items-center gap-1.5"><Filter className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />Tipo</label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger className="bg-muted border-border/60 rounded-lg text-xs sm:text-sm h-9"><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sugestao">💡 Sugestão</SelectItem>
                        <SelectItem value="bug">🐞 Bug / Erro</SelectItem>
                        <SelectItem value="duvida">❓ Dúvida</SelectItem>
                        <SelectItem value="elogio">❤️ Elogio</SelectItem>
                        <SelectItem value="outro">💬 Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-sm font-medium flex items-center gap-1.5"><MessageSquareText className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />Sua mensagem</label>
                    <Textarea placeholder="Conte-nos em detalhes..." value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[100px] bg-muted border-border/60 rounded-lg resize-none focus:border-amber-500/50 text-xs sm:text-sm" />
                  </div>
                  <div className="space-y-2.5">
                    <label className="text-xs sm:text-sm font-medium flex items-center gap-1.5"><ThumbsUp className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-muted-foreground" />O quanto recomendaria? (0-10)</label>
                    <div className="flex justify-between gap-0.5 sm:gap-1">
                      {[...Array(11)].map((_, i) => (
                        <button key={i} onClick={() => setNps(i)} className={`flex-1 h-8 sm:h-10 rounded-lg text-[10px] sm:text-sm font-semibold transition-all duration-200 ${
                          nps === i ? "bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-500/20 scale-105" : "bg-muted hover:bg-muted text-muted-foreground hover:text-foreground"
                        }`}>{i}</button>
                      ))}
                    </div>
                    {nps !== null && (
                      <div className="flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground">
                        <div className="flex-1 h-1 sm:h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-500" style={{ width: `${(nps / 10) * 100}%` }} /></div>
                        <span className="font-semibold text-foreground">{nps}/10</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button onClick={() => setShowForm(false)} variant="outline" className="flex-1 rounded-lg border-border/60 hover:bg-muted text-xs sm:text-sm h-9">Cancelar</Button>
                    <Button onClick={handleSubmit} disabled={!message || sending} className="flex-1 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-500/20 gap-1.5 text-xs sm:text-sm h-9">
                      {sending ? <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" /> : <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                      {sending ? "Enviando..." : "Enviar"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Empty */}
          {!isLoading && filteredFeedbacks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-muted backdrop-blur-md border border-border/60 flex items-center justify-center mb-3">
                {statusFilter === "all" ? <Star className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground/20" /> : <Filter className="h-7 w-7 sm:h-8 sm:w-8 text-muted-foreground/20" />}
              </div>
              <p className="text-sm text-muted-foreground font-medium">{statusFilter === "all" ? "Nenhum feedback enviado ainda" : `Nenhum feedback "${statusFilter}"`}</p>
              {!showForm && statusFilter === "all" && (
                <Button onClick={() => setShowForm(true)} className="mt-3 rounded-lg bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-lg shadow-orange-500/20 gap-1.5 text-xs sm:text-sm h-8 sm:h-9">
                  <MessageSquareText className="h-3.5 w-3.5" />Enviar Primeiro Feedback
                </Button>
              )}
            </div>
          )}

          {/* Loading */}
          {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}

          {/* Feedback List */}
          {!isLoading && filteredFeedbacks.length > 0 && (
            <div className="space-y-2">
              {filteredFeedbacks.map((f) => {
                const TypeIcon = FEEDBACK_TYPE_ICONS[f.type] || FileText;
                const isExpanded = expandedId === f.id;
                const hasResponse = !!f.response;
                return (
                  <div key={f.id} className="rounded-xl overflow-hidden border border-border/60 bg-muted backdrop-blur-md hover:bg-muted transition-all duration-200">
                    <button onClick={() => setExpandedId(isExpanded ? null : f.id)} className="w-full text-left">
                      <div className="p-3 sm:p-4">
                        <div className="flex items-start gap-3">
                          <div className={`w-8 h-8 sm:w-9 sm:h-9 shrink-0 rounded-lg bg-gradient-to-br ${FEEDBACK_TYPE_COLORS[f.type]} flex items-center justify-center shadow-md`}>
                            <TypeIcon className="h-4 w-4 sm:h-4.5 sm:w-4.5 text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              <span className="text-xs sm:text-sm font-semibold">{FEEDBACK_TYPE_LABELS[f.type] || f.type}</span>
                              {getStatusBadge(f.status)}
                              {f.nps_score !== null && (
                                <span className="inline-flex items-center gap-0.5 text-[10px] sm:text-xs bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-full px-1.5 py-0.5">
                                  <Star className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-amber-400 fill-amber-400" /><span className="font-bold text-amber-400">{f.nps_score}/10</span>
                                </span>
                              )}
                            </div>
                            <p className={`text-xs sm:text-sm leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>{f.message}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] sm:text-[11px] text-muted-foreground flex items-center gap-1"><Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3" />{format(new Date(f.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                              {hasResponse && <span className="text-[10px] sm:text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5 sm:h-3 sm:w-3" />Respondido</span>}
                            </div>
                          </div>
                          <div className={`transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}><ChevronDown className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" /></div>
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-border/60 pt-3 space-y-3">
                        <div className="bg-muted rounded-lg p-3 border border-border/60">
                          <p className="text-[10px] sm:text-xs text-muted-foreground mb-1">Mensagem completa:</p>
                          <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{f.message}</p>
                        </div>
                        {hasResponse ? (
                          <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 rounded-lg p-3 border border-emerald-500/20">
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-md bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center"><CheckCircle2 className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white" /></div>
                              <span className="text-xs sm:text-sm font-semibold text-emerald-400">Resposta do Desenvolvedor</span>
                              {f.response_at && <span className="text-[9px] sm:text-[10px] text-muted-foreground ml-auto">{format(new Date(f.response_at), "dd/MM/yyyy", { locale: ptBR })}</span>}
                            </div>
                            <p className="text-xs sm:text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap">{f.response}</p>
                          </div>
                        ) : f.status === "resolvido" ? (
                          <div className="bg-gradient-to-r from-emerald-500/5 to-teal-500/5 rounded-lg p-3 border border-emerald-500/20 text-center">
                            <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400 mx-auto mb-1" />
                            <p className="text-xs sm:text-sm text-emerald-400 font-medium">Marcado como resolvido</p>
                          </div>
                        ) : (
                          <div className="bg-gradient-to-r from-blue-500/5 to-indigo-500/5 rounded-lg p-3 border border-blue-500/20 text-center">
                            <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400 mx-auto mb-1" />
                            <p className="text-xs sm:text-sm text-blue-400 font-medium">Aguardando resposta</p>
                            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{f.status === "em_analise" ? "Nossa equipe está analisando seu feedback" : "Seu feedback está na fila para análise"}</p>
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-[10px] sm:text-xs text-muted-foreground">
                          <span>ID: #{f.id.slice(0, 8).toUpperCase()}</span>
                          {f.severity && <span className="capitalize"><ArrowUp className="h-2.5 w-2.5 sm:h-3 sm:w-3 inline mr-0.5" />{f.severity}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}