import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CreditCard, CheckCircle2, ShieldCheck } from "lucide-react";
import { FieldHint } from "@/components/ui/FieldHint";

interface OnboardingForm {
  cpfCnpj: string;
  mobilePhone: string;
  incomeValue: string;
  postalCode: string;
  address: string;
  addressNumber: string;
  province: string; // bairro (Asaas deriva cidade/estado do CEP)
  complement: string;
}

const empty: OnboardingForm = {
  cpfCnpj: "", mobilePhone: "", incomeValue: "", postalCode: "",
  address: "", addressNumber: "", province: "", complement: "",
};

// Card de ativação de recebimentos: cria a subconta Asaas do profissional (one-time).
// Sem a subconta, ele não consegue receber pelas vendas do marketplace.
export default function ReceivablesOnboarding() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<OnboardingForm>(empty);
  const [saving, setSaving] = useState(false);

  const active = !!(professional as any)?.asaas_wallet_id;

  const set = (k: keyof OnboardingForm, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    const required: (keyof OnboardingForm)[] = ["cpfCnpj", "mobilePhone", "incomeValue", "postalCode", "address", "addressNumber", "province"];
    const missing = required.filter((k) => !form[k].trim());
    if (missing.length) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("asaas-onboarding", {
      body: {
        cpfCnpj: form.cpfCnpj,
        mobilePhone: form.mobilePhone,
        incomeValue: Number(form.incomeValue.replace(",", ".")),
        postalCode: form.postalCode,
        address: form.address,
        addressNumber: form.addressNumber,
        province: form.province,
        complement: form.complement || undefined,
      },
    });
    setSaving(false);
    if (error || (data as any)?.error) {
      toast.error("Não foi possível ativar", { description: (data as any)?.error ?? error?.message });
      return;
    }
    toast.success("Recebimentos ativados!");
    setOpen(false);
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
  };

  if (active) {
    return (
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
        <span className="text-foreground font-medium">Recebimentos ativos</span>
        <span className="text-muted-foreground">— suas vendas caem direto na sua conta.</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <CreditCard className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-semibold text-amber-800">Ative os recebimentos para vender</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Cadastre seus dados uma vez para receber os pagamentos das suas sessões e produtos direto na sua conta (PIX e cartão).
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="mt-1.5" onClick={() => setForm(empty)}>Ativar recebimentos</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Ativar recebimentos</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <p className="text-xs text-muted-foreground">
                  Seus dados são usados só para criar sua conta de recebimento. Nome e e-mail vêm do seu cadastro.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>CPF ou CNPJ</Label>
                    <Input value={form.cpfCnpj} onChange={(e) => set("cpfCnpj", e.target.value)} placeholder="Só números" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Celular</Label>
                    <Input value={form.mobilePhone} onChange={(e) => set("mobilePhone", e.target.value)} placeholder="(DDD) 9...." />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Faturamento mensal estimado (R$) <FieldHint text="Exigido pelo Asaas para fins cadastrais." /></Label>
                  <Input inputMode="decimal" value={form.incomeValue} onChange={(e) => set("incomeValue", e.target.value)} placeholder="Ex: 3000" />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>CEP</Label>
                    <Input value={form.postalCode} onChange={(e) => set("postalCode", e.target.value)} placeholder="00000-000" />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label>Endereço</Label>
                    <Input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Rua / Avenida" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Número</Label>
                    <Input value={form.addressNumber} onChange={(e) => set("addressNumber", e.target.value)} placeholder="123" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bairro</Label>
                    <Input value={form.province} onChange={(e) => set("province", e.target.value)} placeholder="Bairro" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Complemento</Label>
                    <Input value={form.complement} onChange={(e) => set("complement", e.target.value)} placeholder="Opcional" />
                  </div>
                </div>

                <Button onClick={handleSubmit} disabled={saving} className="w-full">
                  {saving ? "Ativando..." : "Ativar recebimentos"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
