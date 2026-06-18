import { useParams } from "react-router-dom";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/components/landing/ProductsSection";
import { CheckCircle2, Clock, Download, XCircle, Loader2, Truck, Calendar, CreditCard } from "lucide-react";

interface OrderInfo {
  status: string;
  item_type: "product" | "service";
  item_title: string;
  amount_brl: number | null;
  is_paid: boolean;
  has_download: boolean;
  download_url?: string;
  professional_name?: string;
  invoice_url?: string | null;
}

// Página de retorno do pagamento (o Asaas redireciona o comprador para cá após pagar).
// Acompanha o status do pedido pelo delivery_token e entrega o PDF quando confirmado.
export default function OrderStatusPage() {
  const { token } = useParams<{ token: string }>();
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const pollRef = useRef<number | null>(null);
  const tries = useRef(0);

  const fetchOrder = useCallback(async () => {
    if (!token) return;
    const { data, error } = await supabase.functions.invoke("marketplace-order", { body: { token } });
    setLoading(false);
    if (error || (data as any)?.error) {
      if ((data as any)?.error === "Pedido não encontrado") setNotFound(true);
      return;
    }
    setOrder(data as OrderInfo);
  }, [token]);

  useEffect(() => {
    fetchOrder();
    // Pagamento PIX confirma em segundos; faz polling enquanto não está pago (até ~2min).
    pollRef.current = window.setInterval(() => {
      tries.current += 1;
      if (tries.current > 30) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        return;
      }
      setOrder((cur) => {
        if (cur?.is_paid) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          return cur;
        }
        fetchOrder();
        return cur;
      });
    }, 4000);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [fetchOrder]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center max-w-sm">
          <XCircle className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">Pedido não encontrado. Confira o link recebido.</p>
        </div>
      </div>
    );
  }

  const paid = order.is_paid;
  const cancelled = order.status === "cancelled" || order.status === "failed" || order.status === "refunded";
  const isPhysical = order.item_type === "product" && paid && !order.has_download;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        {/* Ícone de estado */}
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: paid ? "hsl(var(--primary) / 0.12)" : cancelled ? "hsl(var(--destructive) / 0.10)" : "hsl(var(--muted))" }}>
          {paid ? <CheckCircle2 className="h-7 w-7 text-primary" />
            : cancelled ? <XCircle className="h-7 w-7 text-destructive" />
            : <Clock className="h-7 w-7 text-muted-foreground" />}
        </div>

        <h1 className="font-serif text-xl font-bold text-foreground mb-1">
          {paid ? "Pagamento confirmado!" : cancelled ? "Pagamento não concluído" : "Quase lá!"}
        </h1>
        <p className="text-sm text-muted-foreground mb-5">
          {paid ? "Obrigado pela compra." : cancelled ? "Seu pedido não foi concluído." : "Finalize o pagamento para concluir o seu pedido."}
        </p>

        {/* Resumo do item */}
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-left mb-5">
          <p className="text-sm font-medium text-foreground">{order.item_title}</p>
          <div className="flex items-center justify-between mt-1">
            {order.professional_name && <span className="text-xs text-muted-foreground">de {order.professional_name}</span>}
            <span className="text-sm font-semibold text-foreground ml-auto">{formatPrice(order.amount_brl)}</span>
          </div>
        </div>

        {/* Ação por estado */}
        {paid && order.has_download && order.download_url && (
          <Button asChild className="w-full gap-2">
            <a href={order.download_url} target="_blank" rel="noopener noreferrer">
              <Download className="h-4 w-4" /> Baixar material
            </a>
          </Button>
        )}

        {isPhysical && (
          <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-4 py-3 text-left text-sm text-muted-foreground">
            <Truck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>O profissional vai combinar o envio com você. Fique de olho no seu contato.</span>
          </div>
        )}

        {paid && order.item_type === "service" && (
          <div className="flex items-start gap-2 rounded-lg bg-primary/5 px-4 py-3 text-left text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span>Sua sessão está paga. O profissional confirma o horário com você.</span>
          </div>
        )}

        {!paid && !cancelled && order.invoice_url && (
          <Button asChild className="w-full gap-2 mb-3">
            <a href={order.invoice_url} target="_blank" rel="noopener noreferrer">
              <CreditCard className="h-4 w-4" /> Pagar agora
            </a>
          </Button>
        )}

        {!paid && !cancelled && (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Aguardando o pagamento...
          </div>
        )}
      </div>
    </div>
  );
}
