import { Calendar, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface LeadCaptureSectionProps {
  slug: string;
  whatsapp?: string;
}

export default function LeadCaptureSection({ slug, whatsapp }: LeadCaptureSectionProps) {
  const whatsappLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Gostaria de agendar uma consulta.")}`
    : null;

  return (
    <section className="py-16 md:py-24 bg-primary/5">
      <div className="container mx-auto px-4">
        <div className="max-w-xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
            <Calendar className="h-8 w-8 text-primary" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
            Agende Sua Primeira Consulta
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Dê o primeiro passo para o seu bem-estar. Escolha a forma mais conveniente para agendar.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="gap-2">
              <Link to={`/${slug}/agendar`}>
                <Calendar className="h-5 w-5" />
                Agendar pelo Site
              </Link>
            </Button>
            {whatsappLink && (
              <Button asChild variant="outline" size="lg" className="gap-2 border-green-500 text-green-600 hover:bg-green-50 hover:text-green-700">
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  Agendar pelo WhatsApp
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
