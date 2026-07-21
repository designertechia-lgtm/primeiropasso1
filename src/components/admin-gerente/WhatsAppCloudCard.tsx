import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, MessageSquareText, Cloud, QrCode } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

// Gestão do canal de WhatsApp por profissional (super-admin):
// Evolution (QR/Baileys) x Cloud API oficial da Meta. O cadastro da conta Cloud
// (phone_number_id + token) é feito AQUI — o token nunca aparece no painel do
// profissional (RLS fechada; leitura do dono é mascarada via RPC).
// Caso de uso que motivou (20/07): número banido/restrito no Baileys migra pra oficial.

type ProRow = { id: string; slug: string | null; full_name: string | null; whatsapp_channel: string };
type CloudAccount = {
  professional_id: string;
  phone_number_id: string;
  display_number: string | null;
  verified_name: string | null;
  status: string;
  updated_at: string;
};

export default function WhatsAppCloudCard() {
  const qc = useQueryClient();
  const [selectedPro, setSelectedPro] = useState<string>("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [displayNumber, setDisplayNumber] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const pros = useQuery({
    queryKey: ["admin-wa-cloud-pros"],
    queryFn: async (): Promise<ProRow[]> => {
      const { data, error } = await supabase
        .from("professionals" as any)
        .select("id, slug, full_name, whatsapp_channel")
        .order("full_name", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as ProRow[];
    },
  });

  const accounts = useQuery({
    queryKey: ["admin-wa-cloud-accounts"],
    queryFn: async (): Promise<CloudAccount[]> => {
      const { data, error } = await supabase
        .from("whatsapp_cloud_accounts" as any)
        .select("professional_id, phone_number_id, display_number, verified_name, status, updated_at");
      if (error) throw error;
      return (data ?? []) as unknown as CloudAccount[];
    },
  });

  const upsertAccount = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("admin_upsert_whatsapp_cloud_account" as any, {
        p_professional_id: selectedPro,
        p_phone_number_id: phoneNumberId.trim(),
        p_access_token: accessToken.trim(),
        p_waba_id: wabaId.trim() || null,
        p_display_number: displayNumber.trim() || null,
        p_verified_name: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Conta Cloud salva e ativada.");
      setAccessToken("");
      qc.invalidateQueries({ queryKey: ["admin-wa-cloud-accounts"] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar conta Cloud."),
  });

  const setChannel = useMutation({
    mutationFn: async ({ proId, channel }: { proId: string; channel: "evolution" | "cloud" }) => {
      const { data, error } = await supabase.rpc("admin_set_whatsapp_channel" as any, {
        p_professional_id: proId,
        p_channel: channel,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      toast.success(`Canal alterado para ${vars.channel === "cloud" ? "API Oficial" : "Evolution (QR)"}.`);
      qc.invalidateQueries({ queryKey: ["admin-wa-cloud-pros"] });
    },
    onError: (e: any) =>
      toast.error(
        e.message?.includes("no_active_cloud_account")
          ? "Cadastre a conta Cloud (token + phone_number_id) antes de mudar o canal."
          : e.message || "Erro ao mudar canal.",
      ),
  });

  const proLabel = (p: ProRow) => p.full_name || p.slug || p.id.slice(0, 8);
  const selected = (pros.data ?? []).find((p) => p.id === selectedPro);
  const selectedAccount = (accounts.data ?? []).find(
    (a) => a.professional_id === selectedPro && a.status === "active",
  );

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-5 w-5 text-primary" />
          WhatsApp Oficial (Cloud API) — canal por profissional
        </CardTitle>
        <CardDescription>
          Números banidos/restritos no Baileys migram pra API oficial da Meta. Cadastre o número
          registrado (phone_number_id + token permanente) e troque o canal do profissional.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pros.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando profissionais…
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Profissional</Label>
                <Select
                  value={selectedPro}
                  onValueChange={(v) => {
                    // Limpa o form ao trocar de profissional — senão um token/phone_number_id
                    // digitado pra A seria gravado no B (a RPC roteia por phone_number_id).
                    setSelectedPro(v);
                    setPhoneNumberId("");
                    setWabaId("");
                    setDisplayNumber("");
                    setAccessToken("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {(pros.data ?? []).map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {proLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {selected && (
                <div className="space-y-1.5">
                  <Label>Canal atual</Label>
                  <div className="flex items-center gap-2 pt-1">
                    {selected.whatsapp_channel === "cloud" ? (
                      <Badge className="gap-1 bg-primary text-primary-foreground hover:bg-primary">
                        <Cloud className="h-3 w-3" /> API Oficial
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <QrCode className="h-3 w-3" /> Evolution (QR)
                      </Badge>
                    )}
                    {selectedAccount && (
                      <span className="text-xs text-muted-foreground">
                        Conta Cloud ativa: {selectedAccount.display_number || selectedAccount.phone_number_id}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={setChannel.isPending}
                      onClick={() =>
                        setChannel.mutate({
                          proId: selected.id,
                          channel: selected.whatsapp_channel === "cloud" ? "evolution" : "cloud",
                        })
                      }
                    >
                      {setChannel.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : selected.whatsapp_channel === "cloud" ? (
                        "Voltar pra Evolution"
                      ) : (
                        "Mudar pra API Oficial"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {selectedPro && (
              <div className="space-y-3 rounded-lg border border-border/60 p-4">
                <p className="text-sm font-medium">
                  {selectedAccount ? "Atualizar conta Cloud (re-colar o token substitui)" : "Cadastrar conta Cloud"}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="wac-pnid">phone_number_id *</Label>
                    <Input
                      id="wac-pnid"
                      placeholder="Ex.: 123456789012345"
                      value={phoneNumberId}
                      onChange={(e) => setPhoneNumberId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wac-waba">WABA ID (opcional)</Label>
                    <Input
                      id="wac-waba"
                      placeholder="Ex.: 987654321098765"
                      value={wabaId}
                      onChange={(e) => setWabaId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wac-num">Número (exibição, opcional)</Label>
                    <Input
                      id="wac-num"
                      placeholder="Ex.: +55 48 9xxxx-xxxx"
                      value={displayNumber}
                      onChange={(e) => setDisplayNumber(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="wac-token">Token permanente (System User) *</Label>
                    <Input
                      id="wac-token"
                      type="password"
                      placeholder="EAAG…"
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={!phoneNumberId.trim() || !accessToken.trim() || upsertAccount.isPending}
                  onClick={() => upsertAccount.mutate()}
                >
                  {upsertAccount.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Salvando…
                    </>
                  ) : (
                    "Salvar e ativar conta Cloud"
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  O token fica só no servidor (RLS fechada). Depois de salvar, use "Mudar pra API
                  Oficial" acima — o Axel passa a responder por ela na hora.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
