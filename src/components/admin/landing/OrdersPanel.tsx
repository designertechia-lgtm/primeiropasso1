import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/components/landing/ProductsSection";
import { Receipt, ChevronDown, RefreshCw } from "lucide-react";

interface Order {
  id: string;
  item_title: string;
  item_type: "product" | "service";
  amount_brl: number | null;
  platform_fee_brl: number | null;
  status: string;
  buyer_name: string;
  buyer_email: string | null;
  payment_method: string | null;
  created_at: string;
  paid_at: string | null;
}

// Rótulo + cor de cada status (Tailwind).
const STATUS: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Aguardando", cls: "bg-amber-100 text-amber-700" },
  paid:      { label: "Pago",       cls: "bg-emerald-100 text-emerald-700" },
  delivered: { label: "Entregue",   cls: "bg-emerald-100 text-emerald-700" },
  failed:    { label: "Falhou",     cls: "bg-rose-100 text-rose-700" },
  cancelled: { label: "Cancelado",  cls: "bg-muted text-muted-foreground" },
  refunded:  { label: "Estornado",  cls: "bg-muted text-muted-foreground" },
};

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// Painel de vendas do profissional: lista os pedidos do marketplace (product_orders).
// RLS permite a leitura só dos próprios pedidos (dono).
export default function OrdersPanel() {
  const { data: professional } = useProfessional();
  const [open, setOpen] = useState(false);

  const { data: orders = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["my-orders", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("product_orders")
        .select("id, item_title, item_type, amount_brl, platform_fee_brl, status, buyer_name, buyer_email, payment_method, created_at, paid_at")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Order[];
    },
    enabled: !!professional?.id,
  });

  const paidOrders = orders.filter((o) => o.status === "paid" || o.status === "delivered");
  const netReceived = paidOrders.reduce(
    (sum, o) => sum + ((o.amount_brl ?? 0) - (o.platform_fee_brl ?? 0)),
    0,
  );

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Receipt className="h-4 w-4 text-primary" /> Vendas
          {orders.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              · {paidOrders.length} paga{paidOrders.length === 1 ? "" : "s"} · {formatPrice(netReceived)} recebidos
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Valores já com a comissão da plataforma descontada.</p>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-3 w-3 ${isRefetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-6 animate-pulse">Carregando...</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhuma venda ainda.</p>
          ) : (
            <div className="divide-y">
              {orders.map((o) => {
                const st = STATUS[o.status] ?? STATUS.pending;
                const net = (o.amount_brl ?? 0) - (o.platform_fee_brl ?? 0);
                return (
                  <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{o.item_title}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {o.buyer_name} · {fmtDate(o.created_at)}
                        {o.payment_method && <span className="uppercase"> · {o.payment_method}</span>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">{formatPrice(o.amount_brl)}</p>
                      <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
