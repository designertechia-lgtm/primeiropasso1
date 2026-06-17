import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Clock } from "lucide-react";
import { FieldHint } from "@/components/ui/FieldHint";
import { formatPrice } from "@/components/landing/ProductsSection";

interface ServiceForm {
  id?: string;
  name: string;
  description: string;
  duration_minutes: string;
  price: string;
  active: boolean;
}

const emptyForm: ServiceForm = {
  name: "",
  description: "",
  duration_minutes: "50",
  price: "",
  active: true,
};

// CRUD das sessões de terapia (tabela professional_services) — o serviço principal da plataforma.
// São os mesmos serviços usados no agendamento; o RLS "Professionals can manage own services" já permite.
export default function ServicesEditor() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["admin-services", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("professional_services")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const invalidate = () => {
    ["admin-services", "landing-preview-services", "services", "services-all", "book-services"].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] }),
    );
  };

  const openNew = () => {
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (s: any) => {
    setForm({
      id: s.id,
      name: s.name ?? "",
      description: s.description ?? "",
      duration_minutes: s.duration_minutes != null ? String(s.duration_minutes) : "50",
      price: s.price != null ? String(s.price) : "",
      active: s.active ?? true,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    if (!professional || !form.name.trim()) {
      toast.error("Informe um nome para a sessão.");
      return;
    }
    setSaving(true);
    const payload = {
      professional_id: professional.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      duration_minutes: form.duration_minutes.trim() ? Number(form.duration_minutes) : 50,
      price: form.price.trim() ? Number(form.price.replace(",", ".")) : null,
      active: form.active,
    };

    const res = form.id
      ? await supabase.from("professional_services").update(payload as any).eq("id", form.id)
      : await supabase.from("professional_services").insert(payload as any);

    setSaving(false);
    if (res.error) {
      toast.error(`Erro ao salvar: ${res.error.message}`);
      return;
    }
    toast.success(form.id ? "Sessão atualizada!" : "Sessão criada!");
    setOpen(false);
    invalidate();
  };

  const handleDelete = async (s: any) => {
    if (!confirm(`Excluir a sessão "${s.name}"?`)) return;
    const { error } = await supabase.from("professional_services").delete().eq("id", s.id);
    if (error) {
      toast.error("Erro ao excluir (ela pode estar vinculada a agendamentos).");
      return;
    }
    toast.success("Sessão excluída");
    invalidate();
  };

  return (
    <div className="space-y-4">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button onClick={openNew} className="w-full"><Plus className="h-4 w-4 mr-2" />Nova sessão</Button>
        </DialogTrigger>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar sessão" : "Nova sessão de terapia"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 mt-2">
            <div className="space-y-2">
              <Label>Nome da sessão</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Sessão de psicoterapia individual"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                placeholder="Para quem é, como funciona e o que o paciente pode esperar."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Duração (min)</Label>
                <Input
                  inputMode="numeric"
                  value={form.duration_minutes}
                  onChange={(e) => setForm((p) => ({ ...p, duration_minutes: e.target.value }))}
                  placeholder="50"
                />
              </div>
              <div className="space-y-2">
                <Label>Preço (R$) <FieldHint text="Deixe em branco para exibir 'Sob consulta'." /></Label>
                <Input
                  inputMode="decimal"
                  value={form.price}
                  onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                  placeholder="Ex: 150,00"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Switch checked={form.active} onCheckedChange={(v) => setForm((p) => ({ ...p, active: v }))} />
              <Label>Ativa (aparece na página e no agendamento)</Label>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? "Salvando..." : "Salvar sessão"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-6 animate-pulse">Carregando...</p>
      ) : services.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          Nenhuma sessão cadastrada. Clique em "Nova sessão" para começar.
        </p>
      ) : (
        <div className="space-y-3">
          {services.map((s: any) => (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <div className="min-w-0">
                  <CardTitle className="text-sm truncate">{s.name}</CardTitle>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {s.duration_minutes ?? 50} min · {formatPrice(s.price)}
                    {!s.active && <span className="ml-1 text-amber-600">· oculta</span>}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(s)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
