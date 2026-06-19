import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Send, X, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<string>("sugestao");
  const [message, setMessage] = useState("");
  const [nps, setNps] = useState<number | null>(null);
  const [isSending, setIsSending] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async () => {
    if (!message) {
      toast.error("Por favor, descreva seu feedback.");
      return;
    }
    if (!user?.id) {
      toast.error("Você precisa estar logado para enviar feedback.");
      return;
    }

    setIsSending(true);
    try {
      const { data: prof, error: profErr } = await supabase
        .from("professionals")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profErr) throw profErr;
      if (!prof?.id) {
        toast.error("Não encontramos seu cadastro de profissional. Recarregue a página e tente novamente.");
        return;
      }

      const { error } = await supabase.from("feedbacks").insert({
        author_id: prof.id,
        type: type as any,
        message,
        nps_score: nps,
        status: 'novo',
        severity: 'baixa'
      });

      if (error) throw error;

      toast.success("Obrigado pelo seu feedback!");
      setIsOpen(false);
      setMessage("");
      setNps(null);
    } catch (error) {
      console.error(error);
      toast.error("Erro ao enviar feedback. Tente novamente.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg hover:scale-110 transition-transform bg-primary text-primary-foreground z-50 p-0"
        >
          <MessageSquare className="h-6 w-6" />
          <span className="sr-only">Enviar Feedback</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-heading text-xl">💬 Como podemos melhorar?</DialogTitle>
          <DialogDescription>
            Sua opinião é fundamental para evoluirmos a plataforma.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
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
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">O quanto você recomendaria a Daia? (0-10)</label>
            <div className="flex justify-between gap-1">
              {[...Array(11)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setNps(i)}
                  className={`flex-1 h-8 text-[10px] rounded transition-colors ${nps === i ? 'bg-primary text-primary-foreground font-bold' : 'bg-muted hover:bg-muted/80'}`}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
