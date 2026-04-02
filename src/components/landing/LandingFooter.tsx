import { Leaf, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LandingFooterProps {
  professionalName?: string;
  whatsapp?: string;
}

export default function LandingFooter({ professionalName, whatsapp }: LandingFooterProps) {
  const whatsappLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=Olá! Gostaria de agendar uma consulta.`
    : "#";

  return (
    <footer id="contact" className="bg-foreground text-background py-16">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <Leaf className="h-10 w-10 mx-auto opacity-80" />
          <h2 className="font-serif text-2xl md:text-3xl font-bold">
            O momento de cuidar de si é agora.
          </h2>
          <p className="text-background/70 text-lg">
            Agende uma conversa e dê o primeiro passo em direção a um reencontro consigo.
          </p>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
            <Button size="lg" variant="secondary" className="text-base mt-2">
              Agendar Consulta via WhatsApp
            </Button>
          </a>
        </div>
        <div className="border-t border-background/10 mt-12 pt-8 text-center text-sm text-background/50">
          <p className="flex items-center justify-center gap-1">
            Feito com <Heart className="h-3 w-3 text-destructive" /> por {professionalName || "Primeiro Passo"}
          </p>
          <p className="mt-1">© {new Date().getFullYear()} — Todos os direitos reservados</p>
        </div>
      </div>
    </footer>
  );
}
