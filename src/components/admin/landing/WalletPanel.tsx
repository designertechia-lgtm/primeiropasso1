import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Wallet, ChevronDown, RefreshCw, Loader2, ArrowDownToLine, Pencil } from "lucide-react";

const PIX_TYPES = [
  { v: "CPF", label: "CPF" }, { v: "CNPJ", label: "CNPJ" }, { v: "EMAIL", label: "E-mail" },
  { v: "PHONE", label: "Celular" }, { v: "EVP", label: "Aleatória" },
];
const STATUS_LABEL: Record<string, string> = { requested: "Solicitado", done: "Concluído", failed: "Falhou" };
const fmt = (n: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n ?? 0);
const fmtDate = (s: string) => new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

// invoke esconde o corpo de respostas não-2xx; tenta extrair a msg real da edge.
async function readErr(error: unknown, data: any): Promise<string | undefined> {
  if (data?.error) return data.error as string;
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === "function") { try { const j = await ctx.json(); if (j?.error) return j.error; } catch { /* noop */ } }
  return (error as any)?.message;
}

interface WalletStatus {
  active: boolean;
  balance: number;
  payout_pix_key?: string | null;
  payout_pix_key_type?: string | null;
  history?: { id: string; amount_brl: number; status: string; created_at: string }[];
}

// Carteira do profissional: saldo na subconta Asaas, chave PIX de saque e saque.
// Só aparece quando os recebimentos já estão ativos (subconta criada).
export default function WalletPanel() {
  const { data: professional } = useProfessional();
  const [open, setOpen] = useState(false);
  const [editingPix, setEditingPix] = useState(false);
  const [pixKey, setPixKey] = useState("");
  const [pixType, setPixType] = useState("CPF");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["wallet", professional?.id],
    queryFn: async (): Promise<WalletStatus> => {
      const { data, error } = await supabase.functions.invoke("asaas-wallet", { body: { action: "status" } });
      if (error) throw error;
      return data as WalletStatus;
    },
    enabled: !!professional?.id,
  });

  if (!data?.active) return null; // recebimentos não ativos → nada (o card de ativação já cuida disso)

  const balance = data.balance ?? 0;
  const hasPix = !!data.payout_pix_key;

  const savePix = async () => {
    if (!pixKey.trim()) { toast.error("Informe a chave PIX."); return; }
    setBusy(true);
    const { data: r, error } = await supabase.functions.invoke("asaas-wallet", {
      body: { action: "save_pix", pixKey: pixKey.trim(), pixKeyType: pixType },
    });
    setBusy(false);
    if (error || (r as any)?.error) { toast.error("Erro ao salvar a chave", { description: await readErr(error, r) }); return; }
    toast.success("Chave PIX de saque salva!");
    setEditingPix(false); setPixKey("");
    refetch();
  };

  const withdraw = async () => {
    const v = Number(amount.replace(",", "."));
    if (!v || v <= 0) { toast.error("Informe um valor."); return; }
    if (v > balance) { toast.error("Valor acima do saldo disponível."); return; }
    setBusy(true);
    const { data: r, error } = await supabase.functions.invoke("asaas-wallet", {
      body: { action: "withdraw", value: v },
    });
    setBusy(false);
    if (error || (r as any)?.error) { toast.error("Não foi possível sacar", { description: await readErr(error, r) }); return; }
    toast.success("Saque solicitado! Cai na sua conta via PIX.");
    setAmount("");
    refetch();
  };

  return (
    <div className="rounded-xl border bg-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wallet className="h-4 w-4 text-primary" /> Carteira
          <span className="text-xs font-normal text-muted-foreground">· {fmt(balance)} disponível</span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t px-4 py-4 space-y-5">
          {/* Saldo */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Saldo disponível</p>
              <p className="text-2xl font-semibold text-foreground">{fmt(balance)}</p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => refetch()} disabled={isRefetching}>
              <RefreshCw className={`h-3 w-3 ${isRefetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>

          {/* Chave PIX de saque */}
          <div className="space-y-2">
            <Label className="text-xs">Chave PIX para receber seus saques</Label>
            {hasPix && !editingPix ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <span className="text-sm text-foreground truncate">
                  <span className="text-muted-foreground text-xs mr-1">{data.payout_pix_key_type}</span>
                  {data.payout_pix_key}
                </span>
                <button type="button" className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                  onClick={() => { setEditingPix(true); setPixKey(data.payout_pix_key ?? ""); setPixType(data.payout_pix_key_type ?? "CPF"); }}>
                  <Pencil className="h-3 w-3" /> alterar
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select value={pixType} onChange={(e) => setPixType(e.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-2 text-sm">
                    {PIX_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                  </select>
                  <Input value={pixKey} onChange={(e) => setPixKey(e.target.value)} placeholder="Sua chave PIX" className="flex-1" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={savePix} disabled={busy}>{busy ? "Salvando..." : "Salvar chave"}</Button>
                  {hasPix && <Button size="sm" variant="ghost" onClick={() => setEditingPix(false)}>Cancelar</Button>}
                </div>
              </div>
            )}
          </div>

          {/* Sacar */}
          <div className="space-y-2">
            <Label className="text-xs">Sacar</Label>
            <div className="flex gap-2">
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder={`Até ${fmt(balance)}`} className="flex-1" disabled={!hasPix} />
              <Button onClick={withdraw} disabled={busy || !hasPix || balance <= 0} className="gap-2">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />} Sacar
              </Button>
            </div>
            {!hasPix && <p className="text-xs text-amber-600">Cadastre sua chave PIX acima para poder sacar.</p>}
            <p className="text-[11px] text-muted-foreground">O saque cai na sua conta via PIX. O Asaas oferece 30 saques/mês grátis; depois R$ 2,00 por saque.</p>
          </div>

          {/* Histórico */}
          {data.history && data.history.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Saques recentes</p>
              <div className="divide-y">
                {data.history.map((h) => (
                  <div key={h.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-foreground">{fmt(h.amount_brl)}</span>
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(h.created_at)} · {STATUS_LABEL[h.status] ?? h.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isLoading && <p className="text-sm text-muted-foreground text-center py-2 animate-pulse">Carregando...</p>}
        </div>
      )}
    </div>
  );
}
