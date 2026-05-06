import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { MessageSquare, Send, Clock, CheckCircle2, AlertCircle } from "lucide-react";

export default function AdminFeedback() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [type, setType] = useState<string>("sugestao");
  const [message, setMessage] = useState("");
  const [nps, setNps] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);

  const { data: myFeedbacks, isLoading } = useQuery({
    queryKey: ["my-feedbacks", profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feedbacks")
        .select("*")
        .eq("author_id", profile?.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!profile?.id,
  });

  const handleSubmit = async () => {
    if (!message) {
      toast.error("Por favor, descreva seu feedback.");
      return;
    }

    setIsSending(true);
    try {
      const { error } = await supabase.from("feedbacks").insert({
        author_id: profile?.id,
        type: type as any,
        message,
        nps_score: nps,
        status: 'novo',
        severity: 'baixa'
      });

      if (error) throw error;

      toast.success("Obrigado pelo seu feedback!");
      setMessage("");
      setNps(null);
      queryClient.invalidateQueries({ queryKey: ["my-feedbacks"] });
    } catch (error) {
      console.error(error);
      toast.error("Erro ao enviar feedback. Tente novamente.");
    } finally {
      setIsSending(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "novo": return <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">Novo</Badge>;
      case "em_analise": return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">Em Análise</Badge>;
      case "resolvido": return <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">Resolvido</Badge>;
      case "arquivado": return <Badge variant="outline">Arquivado</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-serif text-foreground">Feedback</h1>
        <p className="text-muted-foreground">Sua opinião nos ajuda a construir uma ferramenta melhor para você.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Form Column */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              Enviar novo feedback
            </CardTitle>
            <CardDescription>Conte-nos o que você está achando ou relate um problema.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo de Feedback</label>
              <Select value={type} onValueChange={setType}>
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
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[150px] resize-none"
              />
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">O quanto você recomendaria a Daia? (0-10)</label>
              <div className="flex justify-between gap-1 flex-wrap">
                {[...Array(11)].map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setNps(i)}
                    className={`h-8 w-8 text-xs rounded-full transition-all border ${nps === i ? 'bg-primary text-primary-foreground border-primary scale-110 shadow-md font-bold' : 'bg-muted hover:bg-muted/80 border-transparent'}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>

            <Button 
              className="w-full gap-2 mt-4" 
              onClick={handleSubmit}
              disabled={isSending}
            >
              {isSending ? "Enviando..." : (
                <>
                  <Send className="h-4 w-4" />
                  Enviar Feedback
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* History Column */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Meus feedbacks recentes
          </h2>
          
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando histórico...</div>
          ) : !myFeedbacks || myFeedbacks.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed rounded-xl bg-muted/20 text-muted-foreground">
              <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-20" />
              <p>Você ainda não enviou nenhum feedback.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
              {myFeedbacks.map((f) => (
                <Card key={f.id} className="bg-card/50 hover:bg-card transition-colors">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex flex-wrap gap-2">
                        {getStatusBadge(f.status)}
                        <Badge variant="outline" className="capitalize">{f.type.replace('_', ' ')}</Badge>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {new Date(f.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-foreground/80 line-clamp-3 italic">"{f.message}"</p>
                    {f.nps_score !== null && (
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span>Nota:</span>
                        <span className="font-bold text-primary">{f.nps_score}/10</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
