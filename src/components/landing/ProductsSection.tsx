import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Package, Briefcase, ShoppingBag, MessageCircle, ExternalLink, ArrowRight } from "lucide-react";
import { buildWhatsAppLink } from "@/lib/utils";

// Item de produto cadastrado pelo profissional (tabela professional_products).
export interface LandingProduct {
  id: string;
  kind: "ebook" | "physical" | "service" | "other";
  title: string;
  description: string | null;
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
}

interface ProductsSectionProps {
  products: LandingProduct[];
  services: LandingService[];
  slug?: string;
  whatsapp?: string | null;
  // Quantos itens aparecem na seção da landing (a vitrine completa fica em /:slug/produtos).
  limit?: number;
}

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

// Unifica produtos e serviços numa lista só, na ordem: produtos primeiro, depois serviços.
type Unified =
  | { type: "product"; id: string; data: LandingProduct }
  | { type: "service"; id: string; data: LandingService };

function unify(products: LandingProduct[], services: LandingService[]): Unified[] {
  return [
    ...products.map((p) => ({ type: "product" as const, id: `p_${p.id}`, data: p })),
    ...services.map((s) => ({ type: "service" as const, id: `s_${s.id}`, data: s })),
  ];
}

function ItemCard({ item, whatsapp }: { item: Unified; whatsapp?: string | null }) {
  const isProduct = item.type === "product";
  const title = isProduct ? item.data.title : item.data.name;
  const description = item.data.description;
  const price = item.data.price_brl;
  const cover = isProduct ? item.data.cover_image_url : null;
  const kind: LandingProduct["kind"] = isProduct ? item.data.kind : "service";
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  const externalUrl = isProduct ? item.data.external_url : null;

  // Fase 1: sem checkout integrado. Compra/contratação é via link externo (se houver) ou WhatsApp.
  const interesse = `Olá! Tenho interesse em "${title}". Pode me passar mais informações?`;
  const cta = externalUrl
    ? { href: externalUrl, external: true, label: "Comprar", icon: ExternalLink }
    : whatsapp
      ? { href: buildWhatsAppLink(whatsapp, interesse), external: true, label: "Tenho interesse", icon: MessageCircle }
      : null;

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
          <p className="text-sm text-muted-foreground line-clamp-2">{description}</p>
        )}
      </CardHeader>
      <CardContent className="pt-0 mt-auto space-y-3">
        <p className="font-heading text-lg font-bold text-foreground">{formatPrice(price)}</p>
        {cta && (
          <Button asChild className="w-full gap-2" size="sm">
            <a href={cta.href} target={cta.external ? "_blank" : undefined} rel={cta.external ? "noopener noreferrer" : undefined}>
              <cta.icon className="h-4 w-4" /> {cta.label}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProductsSection({ products, services, slug, whatsapp, limit = 3 }: ProductsSectionProps) {
  const items = unify(products, services);
  if (items.length === 0) return null;

  const visible = items.slice(0, limit);
  const hasMore = items.length > limit;

  return (
    <div className="container mx-auto px-4 md:px-8">
      <div className="max-w-2xl mx-auto text-center mb-12">
        <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground mb-4">
          Produtos e Serviços
        </h2>
        <p className="text-muted-foreground text-lg">
          Materiais, e-books e serviços para apoiar a sua jornada.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.map((item) => (
          <ItemCard key={item.id} item={item} whatsapp={whatsapp} />
        ))}
      </div>

      {slug && (
        <div className="flex justify-center mt-10">
          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link to={`/${slug}/produtos`}>
              {hasMore ? `Ver tudo (${items.length})` : "Ver todos os produtos"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
