import { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Package, Briefcase, ShoppingBag, ArrowRight, ChevronDown, Clock } from "lucide-react";
import { ItemCTA } from "@/components/landing/CheckoutDialog";

// Item de produto cadastrado pelo profissional (tabela professional_products).
export interface LandingProduct {
  id: string;
  kind: "ebook" | "physical" | "service" | "other";
  title: string;
  description: string | null;
  description_full: string | null;
  price_brl: number | null;
  cover_image_url: string | null;
  external_url: string | null;
}

// Serviço agendável já existente (tabela professional_services). Entra na mesma vitrine.
export interface LandingService {
  id: string;
  name: string;
  description: string | null;
  price_brl: number | null;
  duration_minutes: number | null;
  cover_image_url: string | null;
  // Como o cliente contrata: 'schedule' (Agendar), 'pay' (Pagar online), 'both' (os dois).
  checkout_mode?: "schedule" | "pay" | "both" | null;
}

interface ProductsSectionProps {
  products: LandingProduct[];
  services: LandingService[];
  slug?: string;
  whatsapp?: string | null;
  professionalName?: string;
  // Textos editáveis da seção (professionals.products_title/subtitle); vazio usa o padrão.
  title?: string;
  subtitle?: string;
  // Quantos itens aparecem na seção da landing (a vitrine completa fica em /:slug/produtos).
  limit?: number;
}

// Defaults bem formatados (usados quando o profissional não personaliza os textos).
const DEFAULT_TITLE = "Produtos e Serviços";
const DEFAULT_SUBTITLE = "Sessões de terapia, e-books e materiais para apoiar a sua jornada.";

export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "Sob consulta";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const KIND_META: Record<LandingProduct["kind"], { label: string; icon: React.ElementType }> = {
  ebook: { label: "E-book / PDF", icon: BookOpen },
  physical: { label: "Produto", icon: Package },
  service: { label: "Serviço", icon: Briefcase },
  other: { label: "Produto", icon: ShoppingBag },
};

// Unifica numa lista só. Sessões de terapia (serviços) PRIMEIRO — são o principal da plataforma —,
// depois os produtos.
type Unified =
  | { type: "product"; id: string; data: LandingProduct }
  | { type: "service"; id: string; data: LandingService };

function unify(products: LandingProduct[], services: LandingService[]): Unified[] {
  return [
    ...services.map((s) => ({ type: "service" as const, id: `s_${s.id}`, data: s })),
    ...products.map((p) => ({ type: "product" as const, id: `p_${p.id}`, data: p })),
  ];
}

function ItemCard({ item, whatsapp, professionalName }: { item: Unified; whatsapp?: string | null; professionalName?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isProduct = item.type === "product";
  const title = isProduct ? item.data.title : item.data.name;
  const description = item.data.description;
  const descriptionFull = isProduct ? item.data.description_full : null;
  const price = item.data.price_brl;
  const cover = item.data.cover_image_url;
  const kind: LandingProduct["kind"] = isProduct ? item.data.kind : "service";
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const externalUrl = isProduct ? item.data.external_url : null;
  const durationMin = !isProduct ? item.data.duration_minutes : null;

  return (
    <Card className="overflow-hidden transition-shadow flex flex-col hover:shadow-md">
      <div className="aspect-[4/3] relative bg-muted overflow-hidden">
        {cover ? (
          <img src={cover} alt={title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/15 to-accent/15">
            <Icon className="h-10 w-10 text-primary/30" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex items-center gap-1 bg-background/85 text-foreground text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
          <Icon className="h-3 w-3 text-primary" /> {meta.label}
        </div>
      </div>
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-base leading-snug">{title}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
        {descriptionFull && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline w-fit"
            >
              {expanded ? "Ver menos" : "Ver mais"}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && (
              <p className="text-sm text-muted-foreground whitespace-pre-line border-l-2 border-primary/30 pl-3">
                {descriptionFull}
              </p>
            )}
          </>
        )}
      </CardHeader>
      <CardContent className="pt-0 mt-auto space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-heading text-lg font-bold text-foreground">{formatPrice(price)}</p>
          {durationMin != null && (
            <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3" /> {durationMin} min
            </span>
          )}
        </div>
        <ItemCTA
          item={{ isProduct, id: item.data.id, title, price, kind, externalUrl, serviceMode: item.type === "service" ? item.data.checkout_mode : undefined }}
          whatsapp={whatsapp}
          professionalName={professionalName}
        />
      </CardContent>
    </Card>
  );
}

export default function ProductsSection({ products, services, slug, whatsapp, professionalName, title, subtitle, limit = 3 }: ProductsSectionProps) {
  const items = unify(products, services);
  if (items.length === 0) return null;

  const visible = items.slice(0, limit);
  const hasMore = items.length > limit;

  return (
    <div className="container mx-auto px-4 md:px-8">
      <div className="max-w-2xl mx-auto text-center mb-12">
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
          {title?.trim() || DEFAULT_TITLE}
        </h2>
        <p className="text-muted-foreground text-lg">
          {subtitle?.trim() || DEFAULT_SUBTITLE}
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.map((item) => (
          <ItemCard key={item.id} item={item} whatsapp={whatsapp} professionalName={professionalName} />
        ))}
      </div>

      {slug && (
        <div className="flex justify-center mt-10">
          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link to={`/${slug}/produtos`}>
              {hasMore ? `Ver tudo (${items.length})` : "Ver tudo"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
