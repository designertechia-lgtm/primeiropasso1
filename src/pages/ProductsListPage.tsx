import { useParams, Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ShoppingBag, BookOpen, Package, Briefcase, ChevronDown, Clock, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatPrice, type LandingProduct, type LandingService } from "@/components/landing/ProductsSection";
import { ItemCTA } from "@/components/landing/CheckoutDialog";

// Rótulos dos chips de filtro por tipo (só aparecem os tipos que existirem).
const TYPE_FILTER_LABELS: Record<string, string> = {
  all: "Tudo", service: "Sessões", ebook: "E-books", physical: "Produtos", other: "Outros",
};

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

function ItemCard({ item, whatsapp, professionalName }: { item: Unified; whatsapp?: string | null; professionalName?: string }) {
  const [expanded, setExpanded] = useState(false);
  const isProduct = item.type === "product";
  const title = isProduct ? item.data.title : item.data.name;
  const description = item.data.description;
  const descriptionFull = isProduct ? item.data.description_full : null;
  const price = item.data.price_brl;
  const cover = item.data.cover_image_url;
  const kind: LandingProduct["kind"] = isProduct ? item.data.kind : "service";
  const meta = KIND_META[kind] ?? KIND_META.other;
  const Icon = meta.icon;
  const externalUrl = isProduct ? item.data.external_url : null;
  const durationMin = !isProduct ? item.data.duration_minutes : null;

  return (
    <div className="group rounded-2xl overflow-hidden border bg-card transition-all duration-300 flex flex-col hover:shadow-xl hover:-translate-y-1">
      <div className="aspect-[3/2] overflow-hidden bg-muted relative">
        {cover ? (
          <img src={cover} alt={title} className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-700" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/12 to-accent/12">
            <Icon className="h-9 w-9 text-primary/25" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />
        <div className="absolute top-3 left-3 flex items-center gap-1 bg-background/85 text-foreground text-[10px] font-medium px-2 py-1 rounded-full backdrop-blur-sm">
          <Icon className="h-3 w-3 text-primary" /> {meta.label}
        </div>
      </div>
      <div className="p-4 flex flex-col flex-1">
        <h2 className="font-heading text-[15px] font-semibold text-foreground leading-snug line-clamp-2">{title}</h2>
        {description && (
          <p className="text-[13px] text-muted-foreground leading-relaxed mt-1.5 line-clamp-2">{description}</p>
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
              <p className="text-[13px] text-muted-foreground whitespace-pre-line border-l-2 border-primary/30 pl-3 mt-2">
                {descriptionFull}
              </p>
            )}
          </>
        )}
        <div className="flex-1" />
        <div className="flex items-center gap-2 mt-4">
          <span className="h-px w-5 bg-primary/40 shrink-0" />
          <span className="font-heading text-base font-semibold text-foreground">{formatPrice(price)}</span>
          {durationMin != null && (
            <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1 shrink-0">
              <Clock className="h-3 w-3" /> {durationMin} min
            </span>
          )}
        </div>
        <div className="mt-3">
          <ItemCTA
            item={{ isProduct, id: item.data.id, title, price, kind, externalUrl, serviceMode: item.type === "service" ? item.data.checkout_mode : undefined }}
            whatsapp={whatsapp}
            professionalName={professionalName}
          />
        </div>
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
      const { data, error } = await (supabase as any)
        .from("professionals")
        .select("id, slug, full_name, primary_color, background_color, whatsapp, products_title, products_subtitle")
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
      const { data } = await (supabase as any)
        .from("professional_services")
        .select("id, name, description, price_brl:price, duration_minutes, cover_image_url, checkout_mode, active")
        .eq("professional_id", professional!.id)
        .eq("active", true);
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  // Sessões de terapia (serviços) primeiro — o principal —, depois os produtos.
  const items: Unified[] = useMemo(() => [
    ...(services as LandingService[]).map((s) => ({ type: "service" as const, id: `s_${s.id}`, data: s })),
    ...(products as LandingProduct[]).map((p) => ({ type: "product" as const, id: `p_${p.id}`, data: p })),
  ], [products, services]);

  // Busca + filtro por tipo. A barra só aparece quando há itens suficientes p/ valer a pena
  // (profissional com 1 produto não vê nada disso); com muitos itens, vira fácil de navegar.
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const typeOf = (it: Unified) => (it.type === "service" ? "service" : it.data.kind);
  const presentTypes = useMemo(() => {
    const s = new Set<string>();
    items.forEach((it) => s.add(typeOf(it)));
    return s;
  }, [items]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (typeFilter !== "all" && typeOf(it) !== typeFilter) return false;
      if (!q) return true;
      const title = it.type === "service" ? it.data.name : it.data.title;
      return `${title} ${it.data.description ?? ""}`.toLowerCase().includes(q);
    });
  }, [items, search, typeFilter]);
  const showToolbar = items.length >= 4;

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
          <span className="font-heading font-semibold text-foreground text-sm">{name}</span>
        </div>
      </header>

      {/* Hero compacto: só o título "Produtos e Serviços" (ou o título personalizado). */}
      <div className="bg-primary/5 border-b">
        <div className="container mx-auto px-4 py-6 md:py-7">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-primary shrink-0" />
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">
              {(professional as any).products_title?.trim() || "Produtos e Serviços"}
            </h1>
          </div>
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
          <>
            {showToolbar && (
              <div className="mb-8 space-y-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar..."
                    className="pl-9"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {["all", "service", "ebook", "physical", "other"]
                    .filter((t) => t === "all" || presentTypes.has(t))
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTypeFilter(t)}
                        className={`text-sm font-medium px-3.5 py-1.5 rounded-full border transition-colors ${
                          typeFilter === t
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {TYPE_FILTER_LABELS[t]}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-16">Nada encontrado para esse filtro.</p>
            ) : filtered.length === 1 ? (
              <div className="max-w-sm mx-auto">
                <ItemCard item={filtered[0]} whatsapp={whatsapp} professionalName={name} />
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filtered.map((item) => (
                  <ItemCard key={item.id} item={item} whatsapp={whatsapp} professionalName={name} />
                ))}
              </div>
            )}
          </>
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
