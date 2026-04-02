import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Gift } from "lucide-react";

interface LeadCaptureSectionProps {
  professionalId: string;
}

export default function LeadCaptureSection({ professionalId }: LeadCaptureSectionProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("leads").insert({
      professional_id: professionalId,
      name,
      email: email || null,
      whatsapp: whatsapp || null,
      interest: "guia-gratuito",
    });
    setLoading(false);
    if (error) {
      toast.error("Erro ao enviar", { description: "Tente novamente." });
    } else {
      toast.success("Recebemos seus dados!", { description: "Em breve você receberá o material gratuito." });
      setName("");
      setEmail("");
      setWhatsapp("");
    }
  };

  return (
    <section className="py-16 md:py-24 bg-primary/5">
      <div className="container mx-auto px-4">
        <div className="max-w-xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
            <Gift className="h-8 w-8 text-primary" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
            Material Gratuito
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Receba um guia com técnicas práticas para lidar com a ansiedade no dia a dia. Preencha seus dados abaixo:
          </p>
          <form onSubmit={handleSubmit} className="space-y-4 text-left">
            <div className="space-y-2">
              <Label htmlFor="lead-name">Nome</Label>
              <Input id="lead-name" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="lead-email">E-mail</Label>
                <Input id="lead-email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-whatsapp">WhatsApp</Label>
                <Input id="lead-whatsapp" placeholder="(11) 99999-9999" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Ao preencher, você concorda em receber comunicações. Seus dados são tratados com sigilo conforme a LGPD.
            </p>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Enviando..." : "Quero Receber o Guia Gratuito"}
            </Button>
          </form>
        </div>
      </div>
    </section>
  );
}
