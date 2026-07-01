import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Star, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface TestimonialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  professionalId: string;
  professionalName?: string;
}

// Formulário público para o LEAD deixar um depoimento. Envia para a edge `submit-testimonial`
// (não escreve direto na tabela) — cai como 'pending' até o profissional aprovar.
export default function TestimonialDialog({ open, onOpenChange, professionalId, professionalName }: TestimonialDialogProps) {
  const [authorName, setAuthorName] = useState("");
  const [authorContext, setAuthorContext] = useState("");
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(""); // honeypot anti-spam (escondido)
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setAuthorName(""); setAuthorContext(""); setText(""); setRating(0); setConsent(false); setWebsite("");
  };

  const submit = async () => {
    if (authorName.trim().length < 2) { toast.error("Informe seu nome."); return; }
    if (text.trim().length < 10) { toast.error("Escreva um depoimento com pelo menos 10 caracteres."); return; }
    if (!consent) { toast.error("É preciso autorizar a publicação do depoimento."); return; }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-testimonial", {
        body: {
          professional_id: professionalId,
          author_name: authorName.trim(),
          author_context: authorContext.trim() || undefined,
          text: text.trim(),
          rating: rating || undefined,
          consent: true,
          website, // honeypot
        },
      });
      // Extrai a mensagem real de erro vinda do corpo (padrão do projeto).
      if (error) {
        const detail = (error as any)?.context
          ? await (error as any).context.json().then((j: any) => j?.error).catch(() => null)
          : null;
        throw new Error(detail ?? error.message ?? "Erro ao enviar.");
      }
      if (data?.error) throw new Error(data.error);

      toast.success("Depoimento enviado!", {
        description: "Obrigado! Ele será publicado após a aprovação do profissional.",
        duration: 6000,
      });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Não foi possível enviar", { description: e.message ?? String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deixar um depoimento</DialogTitle>
          <DialogDescription>
            Compartilhe sua experiência{professionalName ? ` com ${professionalName}` : ""}. Seu depoimento passa por aprovação antes de aparecer na página.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="t-name">Seu nome</Label>
            <Input id="t-name" value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="Como quer ser identificado(a)" maxLength={80} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-ctx">Contexto <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input id="t-ctx" value={authorContext} onChange={(e) => setAuthorContext(e.target.value)} placeholder="Ex.: atendimento online" maxLength={80} />
          </div>

          <div className="space-y-1.5">
            <Label>Sua avaliação <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating((r) => (r === n ? 0 : n))}
                  aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
                  className="p-0.5"
                >
                  <Star className={`h-6 w-6 transition-colors ${n <= rating ? "text-primary fill-primary" : "text-muted-foreground/40"}`} />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="t-text">Depoimento</Label>
            <Textarea id="t-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Conte como foi a sua experiência..." maxLength={1500} />
          </div>

          {/* honeypot: escondido de humanos; bots costumam preencher */}
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />

          <label className="flex items-start gap-2.5 cursor-pointer">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span className="text-xs text-muted-foreground leading-relaxed">
              Autorizo a publicação deste depoimento (com o nome informado) na página do profissional.
            </span>
          </label>
        </div>

        <Button onClick={submit} disabled={submitting} className="w-full gap-2">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</> : "Enviar depoimento"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
