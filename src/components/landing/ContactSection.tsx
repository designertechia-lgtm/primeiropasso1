import { MessageCircle, Phone, Mail, Instagram } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContactSectionProps {
  title?: string;
  subtitle?: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  instagram?: string;
}

export default function ContactSection({
  title,
  subtitle,
  whatsapp,
  phone,
  email,
  instagram,
}: ContactSectionProps) {
  const whatsappLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Olá! Gostaria de agendar uma consulta.")}`
    : null;

  const hasAnyContact = whatsapp || phone || email || instagram;

  return (
    <section className="py-16 md:py-24 bg-primary/5">
      <div className="container mx-auto px-4">
        <div className="max-w-xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
            {title || "Agende Sua Primeira Consulta"}
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            {subtitle || "Dê o primeiro passo para o seu bem-estar. Escolha a forma mais conveniente para entrar em contato."}
          </p>

          <div className="flex flex-col items-center gap-3">
            {whatsappLink && (
              <Button asChild size="lg" className="gap-2 w-full max-w-xs">
                <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="h-5 w-5" />
                  Agendar pelo WhatsApp
                </a>
              </Button>
            )}

            {(phone || email || instagram) && (
              <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted-foreground">
                {phone && (
                  <a
                    href={`tel:${phone.replace(/\D/g, "")}`}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <Phone className="h-4 w-4" />
                    {phone}
                  </a>
                )}
                {email && (
                  <a
                    href={`mailto:${email}`}
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    {email}
                  </a>
                )}
                {instagram && (
                  <a
                    href={`https://instagram.com/${instagram.replace("@", "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <Instagram className="h-4 w-4" />
                    {instagram.startsWith("@") ? instagram : `@${instagram}`}
                  </a>
                )}
              </div>
            )}

            {!hasAnyContact && (
              <p className="text-sm text-muted-foreground italic">
                Informações de contato ainda não configuradas.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
