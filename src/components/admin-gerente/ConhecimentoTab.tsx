/**
 * ConhecimentoTab — Editor da base de conhecimento SECCIONADA do Axel.
 *
 * Cada seção (mapa do site / how-to) vive em axel.knowledge_sections (schema `axel`),
 * acessada via RPCs em public (SECURITY DEFINER + is_super_admin):
 *   - axel_kb_admin_list   → lista todas as seções de um scope
 *   - axel_kb_admin_upsert → cria/atualiza por (scope, key)
 *   - axel_kb_admin_delete → remove
 *
 * O agente (edge axel-agent) lê via axel_kb_sections e injeta o ÍNDICE no system prompt
 * + tool consultar_secao(key). NÃO há mais RAG/worker no caminho do Axel.
 *
 * Acesso: apenas super-admin (designertech.ia@gmail.com). Multi-tenant via `scope`
 * (hoje fixo em 'platform' = base global do produto).
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { BookOpen, Plus, Pencil, Trash2, Loader2, Save } from "lucide-react";

const SCOPE = "platform";

interface Section {
  id: string;
  scope: string;
  key: string;
  title: string;
  category: string | null;
  route: string | null;
  keywords: string[] | null;
  body: string;
  priority: number;
  enabled: boolean;
  updated_at: string;
}

interface FormState {
  id: string | null;
  key: string;
  title: string;
  category: string;
  route: string;
  keywords: string; // separadas por vírgula na UI
  body: string;
  priority: number;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  id: null, key: "", title: "", category: "how-to", route: "",
  keywords: "", body: "", priority: 100, enabled: true,
};

const CATEGORIES = ["how-to", "feature", "faq", "regra"];

export default function ConhecimentoTab() {
  const [sections, setSections] = useState<Section[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await (supabase as any).rpc("axel_kb_admin_list", { p_scope: SCOPE });
    if (error) {
      toast.error(`Erro ao carregar seções: ${error.message}`);
    } else {
      setSections((data || []) as Section[]);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(EMPTY_FORM); setOpen(true); };

  const openEdit = (s: Section) => {
    setForm({
      id: s.id,
      key: s.key,
      title: s.title,
      category: s.category || "how-to",
      route: s.route || "",
      keywords: (s.keywords || []).join(", "),
      body: s.body,
      priority: s.priority,
      enabled: s.enabled,
    });
    setOpen(true);
  };

  const handleSave = async () => {
    const key = form.key.trim();
    const title = form.title.trim();
    const body = form.body.trim();
    if (!key || !title || !body) {
      toast.error("Chave, título e conteúdo são obrigatórios.");
      return;
    }
    setSaving(true);
    const keywords = form.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    const { error } = await (supabase as any).rpc("axel_kb_admin_upsert", {
      p_key: key,
      p_title: title,
      p_body: body,
      p_category: form.category || null,
      p_route: form.route.trim() || null,
      p_keywords: keywords,
      p_priority: Number.isFinite(form.priority) ? form.priority : 100,
      p_enabled: form.enabled,
      p_scope: SCOPE,
    });
    setSaving(false);
    if (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
      return;
    }
    toast.success(form.id ? "Seção atualizada!" : "Seção criada!");
    setOpen(false);
    load();
  };

  const handleDelete = async (s: Section) => {
    if (!confirm(`Excluir a seção "${s.title}"? Essa ação não pode ser desfeita.`)) return;
    setDeletingId(s.id);
    const { error } = await (supabase as any).rpc("axel_kb_admin_delete", { p_id: s.id });
    setDeletingId(null);
    if (error) {
      toast.error(`Erro ao excluir: ${error.message}`);
      return;
    }
    toast.success("Seção excluída.");
    load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <CardTitle>Base de Conhecimento do Axel</CardTitle>
                <CardDescription>
                  Mapa do site em <strong>seções</strong>. O Axel recebe o índice (título + chave) no
                  prompt e abre a seção pela <code className="text-xs bg-muted px-1 rounded">key</code> via{" "}
                  <code className="text-xs bg-muted px-1 rounded">consultar_secao</code>. Sem RAG/worker.
                </CardDescription>
              </div>
            </div>
            <Button onClick={openNew} className="gap-2 rounded-xl shrink-0">
              <Plus className="h-4 w-4" /> Nova seção
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sections.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nenhuma seção ainda. Clique em <strong>"Nova seção"</strong> para começar o mapa do site.
            </div>
          ) : (
            sections.map((s) => (
              <div
                key={s.id}
                // Tokens do tema no lugar de branco translúcido: sobre bg-card
                // claro, white/5 sumia (card sem separação visível); os tokens
                // funcionam no claro e no escuro.
                className="flex items-start justify-between gap-3 p-4 rounded-xl border border-border bg-muted/40"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{s.title}</span>
                    <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded">{s.key}</code>
                    {s.category && (
                      <Badge variant="secondary" className="text-[10px]">{s.category}</Badge>
                    )}
                    {!s.enabled && (
                      <Badge variant="outline" className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30">
                        oculta
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {s.route ? <span className="mr-2">{s.route}</span> : null}
                    {(s.keywords || []).join(", ")}
                  </div>
                  <p className="text-xs text-muted-foreground/80 line-clamp-2">{s.body}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" onClick={() => handleDelete(s)}
                    disabled={deletingId === s.id} title="Excluir"
                  >
                    {deletingId === s.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                </div>
              </div>
            ))
          )}

          <p className="text-xs text-muted-foreground pt-2">
            🔒 Apenas o super-admin (<code>designertech.ia@gmail.com</code>) acessa esta página.
            💡 Use <strong>queries de busca</strong> claras nas palavras-chave e títulos objetivos — é
            como o Axel encontra a seção certa.
          </p>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar seção" : "Nova seção"}</DialogTitle>
            <DialogDescription>
              A <strong>chave</strong> é o identificador estável usado pelo Axel (não use espaços).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Chave (key)</Label>
                <Input
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  placeholder="google-agenda"
                  disabled={!!form.id}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Conectar o Google Agenda (importar via iCal)"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rota (opcional)</Label>
                <Input
                  value={form.route}
                  onChange={(e) => setForm({ ...form, route: e.target.value })}
                  placeholder="/admin/agenda"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Prioridade</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value, 10) || 100 })}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Input
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                placeholder="google agenda, ical, importar agenda, sincronizar"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Conteúdo (markdown)</Label>
              <Textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Passo a passo / explicação da seção..."
                className="min-h-[240px] font-mono text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              <Label className="cursor-pointer">Visível para o Axel</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {form.id ? "Salvar alterações" : "Criar seção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
