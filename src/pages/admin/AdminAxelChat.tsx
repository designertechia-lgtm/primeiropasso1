import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAxelMemory } from "@/hooks/useAxelMemory";
import { useProfessional } from "@/hooks/useProfessional";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useSendWhatsApp, useEvolutionStatus } from "@/hooks/useSendWhatsApp";
import { useSearchParams } from "react-router-dom";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Lead } from "@/hooks/useLeadsKanban";
import { useToggleAgentEnabled } from "@/hooks/useUpdateLeadStage";
import AxelChat from "@/components/admin/AxelChat";

type TabType = "axel" | "leads" | "feedback";

const TABS: { id: TabType; label: string; icon: React.ElementType; color: string }[] = [
  { id: "axel", label: "Axel", icon: Sparkles, color: "from-purple-500 to-blue-500" },
  { id: "leads", label: "Conversas", icon: MessageSquare, color: "from-emerald-500 to-teal-500" },
  { id: "feedback", label: "Feedback", icon: Star, color: "from-amber-500 to-orange-500" },
];

export default function AdminAxelChat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { memory } = useAxelMemory();

  const activeTab: TabType = (searchParams.get("tab") as TabType) || "axel";

  const setTab = (tab: TabType) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex gap-1.5 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border transition-all text-sm font-medium ${
              activeTab === tab.id
                ? `bg-gradient-to-br ${tab.color} text-white border-transparent shadow-md`
                : "bg-background text-muted-foreground hover:text-foreground border-border hover:bg-accent/50"
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
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

function AxelTab() {
  const { memory } = useAxelMemory();
  return (
    <div className="flex flex-col h-full bg-background border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b bg-gradient-to-r from-purple-50/50 to-blue-50/50 dark:from-purple-950/20 dark:to-blue-950/20">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-xs">AX</AvatarFallback>
        </Avatar>
        <div>
          <h2 className="text-lg font-semibold">Axel</h2>
          <p className="text-xs text-muted-foreground">
            {memory.name ? `Assistente de ${memory.name.split(" ")[0]}` : "Seu assistente pessoal"}
          </p>
        </div>
        <Badge variant="secondary" className="ml-auto gap-1 text-xs">
          <Sparkles className="h-3 w-3 text-purple-500" />IA Assistente
        </Badge>
      </div>
      <div className="flex-1 flex flex-col overflow-hidden"><AxelChat /></div>
    </div>
  );
}

function LeadsTab() {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  return (
    <div className="flex gap-6 h-full">
      <div className="w-72 shrink-0 flex flex-col"><LeadList onSelect={setSelectedLeadId} selectedId={selectedLeadId} /></div>
      <div className="flex-1 min-w-0">
        {selectedLeadId ? <LeadChat leadId={selectedLeadId} /> : (
          <div className="h-full flex items-center justify-center bg-background border rounded-xl">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">Selecione um lead para conversar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LeadList({ onSelect, selectedId }: { onSelect: (id: string) => void; selectedId: string | null }) {
  const { data: professional } = useProfessional();
  const { data: leads = [] } = useQuery({
    queryKey: ["axel-chat-leads", professional?.id],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("*").eq("professional_id", professional!.id).not("last_message_at", "is", null).order("last_message_at", { ascending: false }).limit(50);
      return (data ?? []) as Lead[];
    },
    enabled: !!professional?.id,
    refetchInterval: 30_000,
  });
  const getInitials = (name: string) => name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" />Conversas ({leads.length})</CardTitle></CardHeader>
      <CardContent className="flex-1 p-0 overflow-hidden">
        <ScrollArea className="h-full">
          {leads.length === 0 ? <div className="text-center py-8 text-sm text-muted-foreground px-4">Nenhuma conversa ativa</div> : (
            <div className="divide-y">
              {leads.map((lead) => (
                <button key={lead.id} onClick={() => onSelect(lead.id)} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left ${selectedId === lead.id ? "bg-accent/30" : ""}`}>
                  <Avatar className="h-8 w-8 shrink-0"><AvatarFallback className="text-xs bg-primary/20 text-primary">{getInitials(lead.name)}</AvatarFallback></Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{lead.name}</p>
                      {lead.last_message_at && <span className="text-[10px] text-muted-foreground shrink-0">{format(new Date(lead.last_message_at), "dd/MM", { locale: ptBR })}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {lead.whatsapp && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{lead.whatsapp}</span>}
                      {lead.pipeline_stage && <span className="capitalize">• {lead.pipeline_stage.replace(/_/g, " ")}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function LeadChat({ leadId }: { leadId: string }) {
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
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

  // Scroll to bottom on new messages (intelligente: só se estiver no final)
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!viewport) return;
    const dist = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    if (dist < 300 || messages.length <= 4) {
      viewport.scrollTop = viewport.scrollHeight;
    }
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

      // Enviar WhatsApp ANTES de desligar o agente
      if (lead?.whatsapp && !evoStatusError && evoStatus?.status === "open") {
        try { await sendWhatsApp.mutateAsync({ to: lead.whatsapp, message: sentContent }); }
        catch (waError) { console.error("[WhatsApp send]", waError); const msg = waError instanceof Error ? waError.message : "Erro desconhecido"; toast.error(`Mensagem salva, mas WhatsApp falhou: ${msg}`); }
      } else if (lead?.whatsapp && !evoStatusError) { toast.error("WhatsApp não conectado. Conecte em CRM Leads → WhatsApp"); }
      await supabase.from("leads").update({ agent_enabled: false }).eq("id", leadId);
    } catch (error) { console.error(error); toast.error("Erro ao enviar mensagem"); }
    finally { setSending(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } };
  if (!lead) return null;

  return (
    <div className="h-full flex flex-col bg-background border rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-6 py-4 border-b">
        <Avatar className="h-9 w-9"><AvatarFallback className="text-xs bg-primary/20 text-primary">{lead.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}</AvatarFallback></Avatar>
        <div className="flex-1 min-w-0"><h2 className="text-base font-semibold truncate">{lead.name}</h2><p className="text-xs text-muted-foreground truncate">{lead.whatsapp || lead.email || "Sem contato"}</p></div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1.5">
            <Bot className={`h-3.5 w-3.5 ${lead.agent_enabled ? "text-primary" : "text-muted-foreground/50"}`} />
            <Switch checked={lead.agent_enabled} onCheckedChange={(checked) => toggleAgent.mutate({ leadId: lead.id, enabled: checked })} className="scale-75" />
          </div>
          <Badge variant="outline" className="text-xs capitalize">{lead.pipeline_stage?.replace(/_/g, " ")}</Badge>
        </div>
      </div>
      {lead.collected_info && typeof lead.collected_info === 'object' && Object.keys(lead.collected_info).length > 0 && (
        <div className="px-6 py-3 border-b bg-muted/20">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {Object.entries(lead.collected_info).map(([key, value]) => (<span key={key} className="text-muted-foreground"><span className="font-medium capitalize text-foreground">{key.replace(/_/g, " ")}:</span> {String(value)}</span>))}
          </div>
        </div>
      )}
      <ScrollArea className="flex-1 p-6" ref={scrollRef}>
        {isLoading ? (<div className="flex items-center justify-center h-full"><p className="text-sm text-muted-foreground animate-pulse">Carregando mensagens...</p></div>) :
         messages.length === 0 ? (<div className="flex flex-col items-center justify-center h-full text-center"><Bot className="h-10 w-10 text-muted-foreground/30 mb-3" /><p className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</p></div>) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              const isAssistant = msg.role === "assistant";
              return (
                <div key={msg.id} className={`flex gap-3 ${isUser ? "justify-start" : "justify-end"}`}>
                  {isUser && (<Avatar className="h-8 w-8 shrink-0"><AvatarFallback className="text-xs bg-primary/20 text-primary"><User className="h-4 w-4" /></AvatarFallback></Avatar>)}
                  <div className={`rounded-2xl px-4 py-3 text-sm max-w-[70%] ${isUser ? "bg-muted rounded-tl-sm" : "bg-primary text-primary-foreground rounded-tr-sm"}`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <p className={`text-[10px] mt-2 ${isUser ? "text-muted-foreground/50" : "text-primary-foreground/50"}`}>{format(new Date(msg.created_at), "HH:mm", { locale: ptBR })}</p>
                  </div>
                  {!isUser && (<Avatar className="h-8 w-8 shrink-0"><AvatarFallback className={`text-xs ${isAssistant ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}`}>{isAssistant ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}</AvatarFallback></Avatar>)}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
      <div className="border-t p-3">
        <div className="flex gap-2">
          <Input placeholder="Digite sua mensagem..." value={messageText} onChange={(e) => setMessageText(e.target.value)} onKeyDown={handleKeyDown} className="flex-1 h-9 text-sm" disabled={sending} />
          <Button size="icon" className="h-9 w-9 shrink-0" onClick={handleSendMessage} disabled={!messageText.trim() || sending}>
            {sending ? (<span className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />) : (<Send className="h-4 w-4" />)}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FeedbackTab() {
  const { user } = useAuth();
  const [type, setType] = useState("sugestao");
  const [message, setMessage] = useState("");
  const [nps, setNps] = useState<number | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!message) { toast.error("Por favor, escreva sua mensagem."); return; }
    if (!user?.id) { toast.error("Você precisa estar logado para enviar feedback."); return; }
    setSending(true);
    try {
      const { data: prof, error: profErr } = await supabase.from("professionals").select("id").eq("user_id", user.id).maybeSingle();
      if (profErr) throw profErr;
      if (!prof?.id) { toast.error("Não encontramos seu cadastro de profissional."); return; }
      const { error } = await supabase.from("feedbacks" as any).insert({ author_id: prof.id, type, message, nps_score: nps, status: "novo", severity: "baixa" } as any);
      if (error) throw error;
      toast.success("Feedback enviado com sucesso!");
      setMessage(""); setNps(null);
    } catch (error) { console.error(error); toast.error("Erro ao enviar feedback."); }
    finally { setSending(false); }
  };

  return (
    <div className="max-w-lg mx-auto mt-8">
      <Card>
        <CardHeader><CardTitle className="font-serif text-xl flex items-center gap-2"><Star className="h-5 w-5 text-amber-500" />Como podemos melhorar?</CardTitle><p className="text-sm text-muted-foreground">Sua opinião é fundamental para evoluirmos a plataforma.</p></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><label className="text-sm font-medium">Tipo de Feedback</label>
            <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger><SelectContent><SelectItem value="sugestao">Sugestão</SelectItem><SelectItem value="bug">Bug / Erro</SelectItem><SelectItem value="duvida">Dúvida</SelectItem><SelectItem value="elogio">Elogio</SelectItem><SelectItem value="outro">Outro</SelectItem></SelectContent></Select>
          </div>
          <div className="space-y-2"><label className="text-sm font-medium">Sua mensagem</label><Textarea placeholder="Conte-nos em detalhes..." value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-[150px]" /></div>
          <div className="space-y-2"><label className="text-sm font-medium">O quanto você recomendaria o PrimeiroPasso? (0-10)</label>
            <div className="flex justify-between gap-1">{[...Array(11)].map((_, i) => (<button key={i} onClick={() => setNps(i)} className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all ${nps === i ? "bg-primary text-primary-foreground shadow-md" : "bg-muted hover:bg-muted/80 text-muted-foreground"}`}>{i}</button>))}</div>
          </div>
          <Button onClick={handleSubmit} disabled={!message || sending} className="w-full">{sending ? "Enviando..." : "Enviar Feedback"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}