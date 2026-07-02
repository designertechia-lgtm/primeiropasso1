import { Leaf, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink, buildLandingCtaMessage, landingCtaLabel } from "@/lib/utils";

interface LandingFooterProps {
  professionalName?: string;
  whatsapp?: string;
  /** Mensagem pré-preenchida do botão (editável na tab Contatos). */
  ctaMessage?: string;
  /** Rótulo visível do botão (editável na tab Contatos). Vazio = padrão. */
  ctaLabel?: string;
  /** Código de campanha (utm/gclid) anexado à mensagem p/ atribuição. */
  campaignRef?: string;
  /** Registra a visita com atribuição ao clicar no CTA. */
  onWhatsAppClick?: () => void;
}

export default function LandingFooter({ professionalName, whatsapp, ctaMessage, ctaLabel, campaignRef, onWhatsAppClick }: LandingFooterProps) {
  const whatsappLink = whatsapp
    ? buildWhatsAppLink(whatsapp, buildLandingCtaMessage(ctaMessage, campaignRef))
    : "#";

  return (
    <footer className="bg-card text-card-foreground border-t py-16 md:py-20">
      <div className="container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center space-y-6">
          <Leaf className="h-10 w-10 mx-auto opacity-80" />
          <h2 className="font-heading text-2xl md:text-3xl font-bold">
            O momento de cuidar de si é agora.
          </h2>
          <p className="text-muted-foreground text-lg">
            Agende uma conversa e dê o primeiro passo em direção a um reencontro consigo.
          </p>
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" onClick={onWhatsAppClick}>
            <Button size="lg" variant="secondary" className="text-base mt-2">
              {landingCtaLabel(ctaLabel)}
            </Button>
          </a>
        </div>
        <div className="border-t border-border mt-12 pt-8 text-center text-sm text-muted-foreground">
          <p className="flex items-center justify-center gap-1">
            Feito com <Heart className="h-3 w-3 text-destructive" /> por {professionalName || "Primeiro Passo"}
          </p>
          <p className="mt-1">© {new Date().getFullYear()} — Todos os direitos reservados</p>
          <p className="mt-2">
            <a href="/politica-privacidade" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
              Política de Privacidade
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
