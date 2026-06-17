import { MessageCircle, Phone, Mail, Instagram, Linkedin, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TikTokIcon } from "@/components/icons/TikTokIcon";
import { buildWhatsAppLink, buildLandingCtaMessage } from "@/lib/utils";

interface ContactSectionProps {
  title?: string;
  subtitle?: string;
  whatsapp?: string;
  /** Mensagem pré-preenchida do botão de agendamento (editável na tab Contatos). */
  ctaMessage?: string;
  /** Código de campanha (utm/gclid) anexado à mensagem p/ atribuição no fluxo. */
  campaignRef?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  linkedin?: string;
  tiktok?: string;
  facebook?: string;
  onWhatsAppClick?: () => void;
}

function buildSocialUrl(value: string, base: string): string {
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return base + trimmed.replace(/^@/, "");
}

export default function ContactSection({
  title,
  subtitle,
  whatsapp,
  ctaMessage,
  campaignRef,
  phone,
  email,
  instagram,
  linkedin,
  tiktok,
  facebook,
  onWhatsAppClick,
}: ContactSectionProps) {
  const whatsappLink = whatsapp
    ? buildWhatsAppLink(whatsapp, buildLandingCtaMessage(ctaMessage, campaignRef))
    : null;

  const hasSecondary = phone || email || instagram || linkedin || tiktok || facebook;
  const hasAnyContact = whatsapp || hasSecondary;

  return (
    <>
      <div className="container mx-auto px-4 md:px-8">
        <div className="max-w-xl mx-auto text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
            <MessageCircle className="h-8 w-8 text-primary" />
          </div>
          <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
            {title || "Agende Sua Primeira Consulta"}
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            {subtitle || "Dê o primeiro passo para o seu bem-estar. Escolha a forma mais conveniente para entrar em contato."}
          </p>

          <div className="flex flex-col items-center gap-3">
            {whatsappLink && (
              <Button size="lg" className="gap-2 w-full max-w-xs" asChild>
                <a
                  href={whatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onWhatsAppClick}
                >
                  <MessageCircle className="h-5 w-5" />
                  Agendar pelo WhatsApp
                </a>
              </Button>
            )}

            {hasSecondary && (
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
                    href={buildSocialUrl(instagram, "https://instagram.com/")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <Instagram className="h-4 w-4" />
                    {instagram.startsWith("@") || /^https?:/i.test(instagram) ? instagram : `@${instagram}`}
                  </a>
                )}
                {tiktok && (
                  <a
                    href={buildSocialUrl(tiktok, "https://tiktok.com/@")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <TikTokIcon className="h-4 w-4" />
                    {tiktok.startsWith("@") || /^https?:/i.test(tiktok) ? tiktok : `@${tiktok}`}
                  </a>
                )}
                {linkedin && (
                  <a
                    href={buildSocialUrl(linkedin, "https://linkedin.com/in/")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </a>
                )}
                {facebook && (
                  <a
                    href={buildSocialUrl(facebook, "https://facebook.com/")}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:text-primary transition-colors"
                  >
                    <Facebook className="h-4 w-4" />
                    Facebook
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
    </>
  );
}
