import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import {
  useDeleteCreditPack,
  useOwnerCreditPacks,
  useOwnerPixSettings,
  useOwnerServicePricing,
  useUpdatePixSettings,
  useUpsertCreditPack,
  useUpsertServicePricing,
  type CreditPack,
  type ServicePricing,
} from "@/hooks/useOwnerStats";
import {
  useSubscriptionPlans,
  useUpsertSubscriptionPlan,
  useDeleteSubscriptionPlan,
  type SubscriptionPlan,
} from "@/hooks/useSubscriptionPlans";

const PIX_KEY_TYPES = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "random", label: "Chave aleatória" },
];

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

function PixSettingsCard() {
  const { data, isLoading } = useOwnerPixSettings();
  const update = useUpdatePixSettings();

  const [form, setForm] = useState({
    pix_key: "",
    pix_key_type: "random",
    beneficiary_name: "",
    bank_name: "",
    instructions: "",
  });

  useEffect(() => {
    if (data) {
      setForm({
        pix_key: data.pix_key ?? "",
        pix_key_type: data.pix_key_type ?? "random",
        beneficiary_name: data.beneficiary_name ?? "",
        bank_name: data.bank_name ?? "",
        instructions: data.instructions ?? "",
      });
    }
  }, [data]);

  const handleSave = async () => {
    if (!form.pix_key.trim() || !form.beneficiary_name.trim()) {
      toast.error("Chave PIX e beneficiário são obrigatórios");
      return;
    }
    try {
      await update.mutateAsync({
        pix_key: form.pix_key.trim(),
        pix_key_type: form.pix_key_type,
        beneficiary_name: form.beneficiary_name.trim(),
        bank_name: form.bank_name.trim() || null,
        instructions: form.instructions.trim() || null,
      });
      toast.success("Configurações de PIX salvas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Chave PIX de recebimento</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pix_key_type">Tipo da chave</Label>
              <Select value={form.pix_key_type} onValueChange={(v) => setForm({ ...form, pix_key_type: v })}>
                <SelectTrigger id="pix_key_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PIX_KEY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pix_key">Chave PIX</Label>
              <Input
                id="pix_key"
                value={form.pix_key}
                onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
                placeholder="ex: contato@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="beneficiary_name">Beneficiário</Label>
              <Input
                id="beneficiary_name"
                value={form.beneficiary_name}
                onChange={(e) => setForm({ ...form, beneficiary_name: e.target.value })}
                placeholder="Nome ou razão social"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank_name">Banco (opcional)</Label>
              <Input
                id="bank_name"
                value={form.bank_name}
                onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                placeholder="ex: Sicoob"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="instructions">Instruções para o pagador (opcional)</Label>
              <Textarea
                id="instructions"
                rows={3}
                value={form.instructions}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                placeholder="ex: Após o pagamento, envie o comprovante pelo botão dentro do app."
              />
            </div>
            <div className="md:col-span-2">
              <Button onClick={handleSave} disabled={update.isPending}>
                {update.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar configurações
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CreditPackEditor({
  pack,
  onClose,
}: {
  pack: CreditPack | null;
  onClose: () => void;
}) {
  const upsert = useUpsertCreditPack();
  const isNew = !pack;
  const [form, setForm] = useState<CreditPack>(
    pack ?? {
      id: "",
      name: "",
      price_brl: 0,
      credits: 0,
      bonus_credits: 0,
      active: true,
    },
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.name.trim()) {
      toast.error("ID e nome são obrigatórios");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: form.id.trim(),
        name: form.name.trim(),
        price_brl: Number(form.price_brl),
        credits: Number(form.credits),
        bonus_credits: form.bonus_credits ? Number(form.bonus_credits) : 0,
        active: form.active ?? true,
      });
      toast.success(isNew ? "Pacote criado" : "Pacote atualizado");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isNew ? "Novo pacote de créditos" : `Editar ${pack?.name}`}</DialogTitle>
        <DialogDescription>Pacotes ficam visíveis para os terapeutas comprarem créditos.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pack_id">ID</Label>
          <Input
            id="pack_id"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            disabled={!isNew}
            placeholder="ex: pack_starter"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pack_name">Nome</Label>
          <Input
            id="pack_name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Pacote Inicial"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pack_price">Preço (R$)</Label>
          <Input
            id="pack_price"
            type="number"
            step="0.01"
            min="0"
            value={form.price_brl}
            onChange={(e) => setForm({ ...form, price_brl: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pack_credits">Créditos</Label>
          <Input
            id="pack_credits"
            type="number"
            min="0"
            value={form.credits}
            onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pack_bonus">Créditos bônus</Label>
          <Input
            id="pack_bonus"
            type="number"
            min="0"
            value={form.bonus_credits ?? 0}
            onChange={(e) => setForm({ ...form, bonus_credits: Number(e.target.value) })}
          />
        </div>
        <div className="flex items-center gap-2 self-end pb-2">
          <Switch
            id="pack_active"
            checked={form.active ?? true}
            onCheckedChange={(v) => setForm({ ...form, active: v })}
          />
          <Label htmlFor="pack_active">Ativo</Label>
        </div>
        <DialogFooter className="md:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function CreditPacksCard() {
  const { data, isLoading } = useOwnerCreditPacks();
  const del = useDeleteCreditPack();
  const [editing, setEditing] = useState<CreditPack | null>(null);
  const [open, setOpen] = useState(false);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este pacote? Compras já feitas não são afetadas.")) return;
    try {
      await del.mutateAsync(id);
      toast.success("Pacote removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Pacotes de créditos</CardTitle>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Novo pacote
            </Button>
          </DialogTrigger>
          <CreditPackEditor pack={editing} onClose={() => setOpen(false)} />
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum pacote cadastrado ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>ID</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead className="text-right">Créditos</TableHead>
                <TableHead className="text-right">Bônus</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.id}</TableCell>
                  <TableCell className="text-right">{brl(Number(p.price_brl))}</TableCell>
                  <TableCell className="text-right">{p.credits}</TableCell>
                  <TableCell className="text-right">{p.bonus_credits ?? 0}</TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        p.active ? "bg-emerald-500" : "bg-muted-foreground/40"
                      }`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ServicePricingEditor({
  row,
  onClose,
}: {
  row: ServicePricing | null;
  onClose: () => void;
}) {
  const upsert = useUpsertServicePricing();
  const isNew = !row;
  const [form, setForm] = useState<ServicePricing>(
    row ?? {
      service_key: "",
      display_name: "",
      unit: "uso",
      base_cost_brl: 0,
      markup_pct: 100,
      description: null,
      active: true,
      updated_at: null,
    },
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.service_key.trim() || !form.display_name.trim()) {
      toast.error("Chave e nome são obrigatórios");
      return;
    }
    try {
      await upsert.mutateAsync({
        service_key: form.service_key.trim(),
        display_name: form.display_name.trim(),
        unit: form.unit.trim() || "uso",
        base_cost_brl: Number(form.base_cost_brl),
        markup_pct: form.markup_pct == null ? 100 : Number(form.markup_pct),
        description: form.description?.trim() || null,
        active: form.active ?? true,
      });
      toast.success(isNew ? "Preço criado" : "Preço atualizado");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{isNew ? "Novo preço de serviço" : `Editar ${row?.display_name}`}</DialogTitle>
        <DialogDescription>
          Custos por feature usados pelo motor de cobrança em créditos.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="svc_key">service_key</Label>
          <Input
            id="svc_key"
            value={form.service_key}
            onChange={(e) => setForm({ ...form, service_key: e.target.value })}
            disabled={!isNew}
            placeholder="ex: video_generation"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="svc_name">Nome de exibição</Label>
          <Input
            id="svc_name"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            placeholder="Geração de vídeo"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="svc_unit">Unidade</Label>
          <Input
            id="svc_unit"
            value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
            placeholder="ex: segundo, post, geração"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="svc_cost">Custo base (R$)</Label>
          <Input
            id="svc_cost"
            type="number"
            step="0.0001"
            min="0"
            value={form.base_cost_brl}
            onChange={(e) => setForm({ ...form, base_cost_brl: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="svc_markup">Markup (%)</Label>
          <Input
            id="svc_markup"
            type="number"
            min="0"
            value={form.markup_pct ?? 100}
            onChange={(e) => setForm({ ...form, markup_pct: Number(e.target.value) })}
          />
        </div>
        <div className="flex items-center gap-2 self-end pb-2">
          <Switch
            id="svc_active"
            checked={form.active ?? true}
            onCheckedChange={(v) => setForm({ ...form, active: v })}
          />
          <Label htmlFor="svc_active">Ativo</Label>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="svc_desc">Descrição</Label>
          <Textarea
            id="svc_desc"
            rows={2}
            value={form.description ?? ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <DialogFooter className="md:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function ServicePricingCard() {
  const { data, isLoading } = useOwnerServicePricing();
  const [editing, setEditing] = useState<ServicePricing | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Preços por serviço</CardTitle>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Novo preço
            </Button>
          </DialogTrigger>
          <ServicePricingEditor row={editing} onClose={() => setOpen(false)} />
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum preço cadastrado ainda.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serviço</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Custo base</TableHead>
                <TableHead className="text-right">Markup</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((s) => (
                <TableRow key={s.service_key}>
                  <TableCell className="font-medium">{s.display_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{s.service_key}</TableCell>
                  <TableCell>{s.unit}</TableCell>
                  <TableCell className="text-right">{brl(Number(s.base_cost_brl))}</TableCell>
                  <TableCell className="text-right">{s.markup_pct ?? 100}%</TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        s.active ? "bg-emerald-500" : "bg-muted-foreground/40"
                      }`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(s);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Planos de assinatura mensal (lidos pela landing oficial) ───────────────

function SubscriptionPlanEditor({
  plan,
  onClose,
}: {
  plan: SubscriptionPlan | null;
  onClose: () => void;
}) {
  const upsert = useUpsertSubscriptionPlan();
  const isNew = !plan;
  const [form, setForm] = useState<SubscriptionPlan>(
    plan ?? {
      id: "",
      name: "",
      monthly_price_brl: 0,
      description: "",
      features: [],
      cta_label: "",
      featured: false,
      badge: null,
      active: true,
      sort_order: 0,
    },
  );
  const [featuresText, setFeaturesText] = useState(form.features.join("\n"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.id.trim() || !form.name.trim()) {
      toast.error("ID e nome são obrigatórios");
      return;
    }
    const features = featuresText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await upsert.mutateAsync({
        id: form.id.trim(),
        name: form.name.trim(),
        monthly_price_brl: Number(form.monthly_price_brl),
        description: form.description.trim(),
        features,
        cta_label: form.cta_label.trim() || `Começar ${form.name.trim()}`,
        featured: form.featured,
        badge: form.badge?.trim() || null,
        active: form.active,
        sort_order: Number(form.sort_order ?? 0),
      });
      toast.success(isNew ? "Plano criado" : "Plano atualizado");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar");
    }
  };

  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>{isNew ? "Novo plano de assinatura" : `Editar ${plan?.name}`}</DialogTitle>
        <DialogDescription>
          Aparece na seção Preços de <strong>primeiropasso.online</strong>.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="plan_id">ID</Label>
          <Input
            id="plan_id"
            value={form.id}
            onChange={(e) => setForm({ ...form, id: e.target.value })}
            disabled={!isNew}
            placeholder="ex: starter"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan_name">Nome</Label>
          <Input
            id="plan_name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Starter"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan_price">Preço mensal (R$)</Label>
          <Input
            id="plan_price"
            type="number"
            step="1"
            min="0"
            value={form.monthly_price_brl}
            onChange={(e) =>
              setForm({ ...form, monthly_price_brl: Number(e.target.value) })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan_sort">Ordem (1, 2, 3...)</Label>
          <Input
            id="plan_sort"
            type="number"
            min="0"
            value={form.sort_order}
            onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="plan_desc">Descrição curta</Label>
          <Input
            id="plan_desc"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Pipeline completo de vídeo, multi-formato e CRM."
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="plan_features">
            Features (uma por linha — viram bullets na landing)
          </Label>
          <Textarea
            id="plan_features"
            rows={8}
            value={featuresText}
            onChange={(e) => setFeaturesText(e.target.value)}
            placeholder={"Landing per-tenant + agenda\nAgente WhatsApp · 200 msgs/mês\n..."}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan_cta">CTA do botão</Label>
          <Input
            id="plan_cta"
            value={form.cta_label}
            onChange={(e) => setForm({ ...form, cta_label: e.target.value })}
            placeholder="Começar Starter"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="plan_badge">Badge (opcional)</Label>
          <Input
            id="plan_badge"
            value={form.badge ?? ""}
            onChange={(e) => setForm({ ...form, badge: e.target.value })}
            placeholder="Mais escolhido"
          />
        </div>
        <div className="flex items-center gap-2 self-end pb-2">
          <Switch
            id="plan_featured"
            checked={form.featured}
            onCheckedChange={(v) => setForm({ ...form, featured: v })}
          />
          <Label htmlFor="plan_featured">Destaque (card maior)</Label>
        </div>
        <div className="flex items-center gap-2 self-end pb-2">
          <Switch
            id="plan_active"
            checked={form.active}
            onCheckedChange={(v) => setForm({ ...form, active: v })}
          />
          <Label htmlFor="plan_active">Ativo</Label>
        </div>
        <DialogFooter className="md:col-span-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={upsert.isPending}>
            {upsert.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function SubscriptionPlansCard() {
  const { data, isLoading } = useSubscriptionPlans(true);
  const del = useDeleteSubscriptionPlan();
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [open, setOpen] = useState(false);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este plano da landing oficial?")) return;
    try {
      await del.mutateAsync(id);
      toast.success("Plano removido");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Planos de assinatura</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Cards exibidos em <strong>primeiropasso.online</strong> (seção Preços)
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger asChild>
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              <Plus className="mr-1 h-4 w-4" /> Novo plano
            </Button>
          </DialogTrigger>
          <SubscriptionPlanEditor plan={editing} onClose={() => setOpen(false)} />
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (data ?? []).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum plano cadastrado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ordem</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="text-right">Preço/mês</TableHead>
                <TableHead className="text-right">Features</TableHead>
                <TableHead className="text-center">Destaque</TableHead>
                <TableHead className="text-center">Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-xs text-muted-foreground">{p.sort_order}</TableCell>
                  <TableCell className="font-medium">
                    {p.name}
                    {p.badge && (
                      <span className="ml-2 inline-block rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium text-accent">
                        {p.badge}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{brl(Number(p.monthly_price_brl))}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {p.features.length} itens
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        p.featured ? "bg-primary" : "bg-muted-foreground/30"
                      }`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        p.active ? "bg-emerald-500" : "bg-muted-foreground/40"
                      }`}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(p);
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export default function PixPrecosTab() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="font-serif text-2xl text-foreground">PIX & Preços</h2>
        <p className="text-sm text-muted-foreground">
          Configure a chave PIX, planos de assinatura, pacotes de créditos e o custo de cada serviço.
        </p>
      </header>

      <PixSettingsCard />
      <SubscriptionPlansCard />
      <CreditPacksCard />
      <ServicePricingCard />
    </div>
  );
}
