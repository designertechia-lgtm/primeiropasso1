import { useParams, Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ShoppingBag, BookOpen, Package, Briefcase, MessageCircle, ExternalLink, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildWhatsAppLink } from "@/lib/utils";
import { formatPrice, type LandingProduct, type LandingService } from "@/components/landing/ProductsSection";

// Mesmo esquema de tematização da ArticlesListPage, para as duas páginas de lista combinarem.
function hexToHSL(hex: string): string | null {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return null;
  const rv = parseInt(r[1], 16) / 255;
  const g = parseInt(r[2], 16) / 255;
  const b = parseInt(r[3], 16) / 255;
  const max = Math.max(rv, g, b), min = Math.min(rv, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rv: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g:  h = ((b - rv) / d + 2) / 6; break;
      case b:  h = ((rv - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const KIND_META: Record<string, { label: string; icon: React.ElementType }> = {
  ebook: { label: "E-book / PDF", icon: BookOpen },
  physical: { label: "Produto", icon: Package },
  service: { label: "Serviço", icon: Briefcase },
  other: { label: "Produto", icon: ShoppingBag },
};

type Unified =
  | { type: "product"; id: string; data: LandingProduct }
  | { type: "service"; id: string; data: LandingService };

function ItemCard({ item, whatsapp }: { item: Unified; whatsapp?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const isProduct = item.type === "product";
  const title = isProduct ? item.data.title : item.data.name;
  const description = item.data.description;
  const descriptionFull = isProduct ? item.data.description_full : null;
  const price = item.data.price_brl;
  const cover = isProduct ? item.data.cover_image_url : null;
  const kind = isProduct ? item.data.kind : "service";
  const meta = KIND_META[kind] ?? KIND_META.other;
  const Icon = meta.icon;
  const externalUrl = isProduct ? item.data.external_url : null;

  const interesse = `Olá! Tenho interesse em "${title}". Pode me passar mais informações?`;
  const cta = externalUrl
    ? { href: externalUrl, label: "Comprar", icon: ExternalLink }
    : whatsapp
      ? { href: buildWhatsAppLink(whatsapp, interesse), label: "Tenho interesse", icon: MessageCircle }
      : null;

  return (
    <div className="group rounded-2xl overflow-hidden border bg-card transition-all duration-300 flex flex-col hover:shadow-lg hover:-translate-y-0.5">
      <div className="aspect-[4/3] overflow-hidden bg-muted relative">
        {cover ? (
          <img src={cover} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/15 to-accent/15">
            <Icon className="h-10 w-10 text-primary/30" />
          </div>
        )}
        <div className="absolute top-3 left-3 flex items-center gap-1 bg-background/85 text-foreground text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
          <Icon className="h-3 w-3 text-primary" /> {meta.label}
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h2 className="font-serif text-lg font-semibold text-foreground leading-snug mb-2 line-clamp-2">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        )}
        {descriptionFull && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex items-center gap-1 text-xs font-medium text-primary hover:underline w-fit mt-2"
            >
              {expanded ? "Ver menos" : "Ver mais"}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </button>
            {expanded && (
              <p className="text-sm text-muted-foreground whitespace-pre-line border-l-2 border-primary/30 pl-3 mt-2">
                {descriptionFull}
              </p>
            )}
          </>
        )}
        <div className="flex-1" />
        <p className="font-serif text-lg font-bold text-foreground mt-4">{formatPrice(price)}</p>
        {cta && (
          <Button asChild className="w-full gap-2 mt-3" size="sm">
            <a href={cta.href} target="_blank" rel="noopener noreferrer">
              <cta.icon className="h-4 w-4" /> {cta.label}
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function ProductsListPage() {
  const { slug } = useParams<{ slug: string }>();
  const dark = slug ? localStorage.getItem(`dark_${slug}`) === "1" : false;

  const { data: professional, isLoading: loadingProf } = useQuery({
    queryKey: ["professional", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("id, slug, full_name, primary_color, background_color, whatsapp")
        .eq("slug", slug!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!slug,
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["products-all", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("professional_products")
        .select("id, kind, title, description, description_full, price_brl, cover_image_url, external_url, active, sort_order")
        .eq("professional_id", professional!.id)
        .eq("active", true)
        .order("sort_order", { ascending: true });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const { data: services = [], isLoading: loadingServices } = useQuery({
    queryKey: ["services-all", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("professional_services")
        .select("id, name, description, price_brl:price, duration_minutes, active")
        .eq("professional_id", professional!.id)
        .eq("active", true);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const items: Unified[] = useMemo(() => [
    ...(products as LandingProduct[]).map((p) => ({ type: "product" as const, id: `p_${p.id}`, data: p })),
    ...(services as LandingService[]).map((s) => ({ type: "service" as const, id: `s_${s.id}`, data: s })),
  ], [products, services]);

  const customStyles = useMemo(() => {
    if (!professional) return undefined;
    const styles: Record<string, string> = {};
    const primary = (professional as any).primary_color;
    const bg = (professional as any).background_color;
    if (primary) {
      const hsl = hexToHSL(primary);
      if (hsl) {
        styles["--primary"] = hsl;
        styles["--ring"] = hsl;
        styles["--primary-foreground"] = parseInt(hsl.split(" ")[2]) > 55 ? "220 15% 10%" : "210 40% 98%";
      }
    }
    if (bg) {
      const hsl = hexToHSL(bg);
      if (hsl) {
        const [h, sv, lv] = hsl.split(" ");
        const s = parseInt(sv), l = parseInt(lv);
        styles["--background"] = hsl;
        styles["--card"] = `${h} ${Math.max(s - 5, 0)}% ${Math.min(l + 2, 100)}%`;
        styles["--foreground"] = l < 50 ? `${h} ${Math.max(s - 15, 0)}% 90%` : `${h} ${Math.min(s + 10, 100)}% 15%`;
        styles["--muted-foreground"] = `${h} ${Math.max(s - 5, 0)}% 45%`;
        styles["--border"] = `${h} ${Math.max(s - 10, 0)}% ${l < 50 ? Math.min(l + 22, 55) : Math.max(l - 10, 0)}%`;
      }
    }
    return Object.keys(styles).length > 0 ? styles : undefined;
  }, [professional]);

  const isLoading = loadingProf || loadingProducts || loadingServices;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!professional) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Profissional não encontrado.</p>
      </div>
    );
  }

  const name = (professional as any).full_name || "Profissional";
  const whatsapp = (professional as any).whatsapp as string | null | undefined;

  return (
    <div className={`min-h-screen bg-background${dark ? " dark" : ""}`} style={customStyles as React.CSSProperties}>
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            to={`/${slug}#produtos`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para o site
          </Link>
          <span className="font-serif font-semibold text-foreground text-sm">{name}</span>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-primary/5 border-b">
        <div className="container mx-auto px-4 py-12 md:py-16">
          <div className="flex items-center gap-3 mb-3">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <span className="text-sm font-medium text-primary uppercase tracking-widest">Produtos e Serviços</span>
          </div>
          <h1 className="font-serif text-3xl md:text-5xl font-bold text-foreground mb-3">
            Tudo o que {name} oferece
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            E-books, materiais e serviços para apoiar a sua jornada.
          </p>
        </div>
      </div>

      {/* Grid */}
      <main className="container mx-auto px-4 py-12">
        {items.length === 0 ? (
          <div className="text-center py-24">
            <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum produto ou serviço disponível ainda.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} whatsapp={whatsapp} />
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t mt-8">
        <div className="container mx-auto px-4 py-6 text-center text-xs text-muted-foreground">
          <Link to={`/${slug}#produtos`} className="hover:text-primary transition-colors">
            ← Voltar para o site de {name}
          </Link>
        </div>
      </footer>
    </div>
  );
}
