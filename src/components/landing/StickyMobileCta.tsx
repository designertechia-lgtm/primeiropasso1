import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { buildWhatsAppLink, buildLandingCtaMessage } from "@/lib/utils";

// CTA fixo no rodapé, SÓ no mobile, que aparece depois de rolar um pouco.
// Mantém o botão de agendamento sempre ao alcance (requisito de conversão).
interface StickyMobileCtaProps {
  whatsapp?: string;
  ctaMessage?: string;
  campaignRef?: string;
  onWhatsAppClick?: () => void;
}

export default function StickyMobileCta({ whatsapp, ctaMessage, campaignRef, onWhatsAppClick }: StickyMobileCtaProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!whatsapp) return null;
  const href = buildWhatsAppLink(whatsapp, buildLandingCtaMessage(ctaMessage, campaignRef));

  return (
    <div
      className={`lg:hidden fixed bottom-0 inset-x-0 z-40 p-3 transition-transform duration-300 ${
        visible ? "translate-y-0" : "translate-y-[120%]"
      }`}
    >
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onWhatsAppClick}
        className="flex items-center justify-center gap-2 w-full rounded-full bg-primary text-primary-foreground font-semibold py-3.5 shadow-2xl shadow-primary/30"
      >
        <MessageCircle className="h-5 w-5" />
        Agendar pelo WhatsApp
      </a>
    </div>
  );
}
