import { ExternalLink } from "lucide-react";

// Bloco reutilizável "não tem um arquivo? baixe grátis nestas galerias".
// Nasceu no Hero (fundo) e foi extraído para reaproveitar em TODOS os uploads de
// imagem/vídeo do editor (Vilão, Sobre, Sessões de terapia, Produtos…) — pedido da
// Daia de "botão para encontrar arquivo nos sites online". Só links externos, sem
// integração de API: o profissional baixa lá e faz o upload no campo acima.
export default function StockGalleryHint({
  kind = "image",
  className = "",
}: {
  kind?: "image" | "video";
  className?: string;
}) {
  const galleries =
    kind === "video"
      ? [
          { label: "Vídeos no Pexels", href: "https://www.pexels.com/pt-br/videos/" },
          { label: "Vídeos no Pixabay", href: "https://pixabay.com/pt/videos/" },
        ]
      : [
          { label: "Fotos no Pexels", href: "https://www.pexels.com/pt-br/" },
          { label: "Fotos no Pixabay", href: "https://pixabay.com/pt/images/" },
        ];

  return (
    <div className={`rounded-xl border border-dashed border-border bg-muted/30 p-3 space-y-2 ${className}`}>
      <p className="text-xs text-muted-foreground">
        Não tem {kind === "video" ? "um vídeo" : "uma imagem"}? Baixe de graça nestas galerias e depois faça o upload no campo acima.
      </p>
      <div className="flex flex-wrap gap-2">
        {galleries.map((g) => (
          <a
            key={g.href}
            href={g.href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {g.label}
          </a>
        ))}
      </div>
    </div>
  );
}
