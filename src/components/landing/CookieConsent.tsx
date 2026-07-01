import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

// Banner de consentimento LGPD. O pai só o renderiza quando ainda não há decisão salva.
// "Aceitar" libera o carregamento dos pixels/tags; "Recusar" mantém tudo desligado.
interface CookieConsentProps {
  policyHref?: string;
  onAccept: () => void;
  onReject: () => void;
}

export default function CookieConsent({ policyHref = "/politica-privacidade", onAccept, onReject }: CookieConsentProps) {
  return (
    <div className="fixed bottom-0 inset-x-0 z-[60] p-3 sm:p-4 animate-in slide-in-from-bottom-4 duration-500">
      <div className="mx-auto max-w-3xl rounded-2xl border bg-background/95 backdrop-blur-xl shadow-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <Cookie className="h-6 w-6 text-primary flex-shrink-0 hidden sm:block" />
        <p className="text-xs text-muted-foreground flex-1 leading-relaxed">
          Usamos cookies e tecnologias de medição para melhorar sua experiência e entender o
          desempenho desta página. Você pode aceitar ou recusar os não essenciais. Saiba mais na{" "}
          <a href={policyHref} target="_blank" rel="noopener noreferrer" className="underline text-primary hover:no-underline">
            Política de Privacidade
          </a>.
        </p>
        <div className="flex gap-2 shrink-0 w-full sm:w-auto">
          <Button variant="outline" size="sm" className="flex-1 sm:flex-none" onClick={onReject}>
            Recusar
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={onAccept}>
            Aceitar
          </Button>
        </div>
      </div>
    </div>
  );
}
