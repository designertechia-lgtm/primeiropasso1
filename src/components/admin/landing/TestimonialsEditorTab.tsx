import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Check, X, Trash2, Star, Plus, ShieldAlert, Clock, Loader2 } from "lucide-react";

interface Row {
  id: string;
  author_name: string;
  author_context: string | null;
  text: string;
  rating: number | null;
  status: "pending" | "approved" | "rejected";
  source: "lead" | "professional";
  created_at: string;
}

function Stars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= rating ? "text-primary fill-primary" : "text-muted-foreground/30"}`} />
      ))}
    </div>
  );
}

// Aba "Depoimentos" do editor da landing (/admin/landing). Autossuficiente (como ProductsEditorTab):
// controla o cabeçalho + liga/desliga da seção (colunas em professionals) e a moderação
// (aprovar/rejeitar/excluir) da tabela testimonials, além de adicionar um depoimento manual.
export default function TestimonialsEditorTab() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const p = professional as any;

  // Cabeçalho / liga-desliga (colunas em professionals)
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [savingHeader, setSavingHeader] = useState(false);

  useEffect(() => {
    if (!professional) return;
    setEnabled(!!p.testimonials_enabled);
    setTitle(p.testimonials_title || "");
    setSubtitle(p.testimonials_subtitle || "");
  }, [professional]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveHeader = async () => {
    if (!professional) return;
    setSavingHeader(true);
    const { error } = await supabase.from("professionals").update({
      testimonials_enabled: enabled,
      testimonials_title: title || null,
      testimonials_subtitle: subtitle || null,
    } as any).eq("id", professional.id);
    setSavingHeader(false);
    if (error) toast.error("Erro ao salvar");
    else { toast.success("Configuração salva!"); queryClient.invalidateQueries({ queryKey: ["my-professional"] }); }
  };

  // Lista de depoimentos (todos os status) para moderação
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-testimonials", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("testimonials")
        .select("id, author_name, author_context, text, rating, status, source, created_at")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Row[];
    },
    enabled: !!professional?.id,
  });

  const pending = rows.filter((r) => r.status === "pending");
  const approved = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected");

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-testimonials", professional?.id] });

  const setStatus = async (id: string, status: Row["status"]) => {
    const patch: any = { status };
    patch.approved_at = status === "approved" ? new Date().toISOString() : null;
    const { error } = await (supabase as any).from("testimonials").update(patch).eq("id", id);
    if (error) { toast.error("Erro ao atualizar"); return; }
    toast.success(status === "approved" ? "Depoimento aprovado!" : status === "rejected" ? "Depoimento rejeitado." : "Atualizado.");
    refresh();
  };

  const remove = async (id: string) => {
    const { error } = await (supabase as any).from("testimonials").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Depoimento excluído.");
    refresh();
  };

  // Adicionar manual
  const [addOpen, setAddOpen] = useState(false);
  const [mName, setMName] = useState("");
  const [mCtx, setMCtx] = useState("");
  const [mText, setMText] = useState("");
  const [mRating, setMRating] = useState(0);
  const [addingSaving, setAddingSaving] = useState(false);

  const addManual = async () => {
    if (!professional) return;
    if (mName.trim().length < 2 || mText.trim().length < 10) {
      toast.error("Preencha nome e depoimento.");
      return;
    }
    setAddingSaving(true);
    const { error } = await (supabase as any).from("testimonials").insert({
      professional_id: professional.id,
      author_name: mName.trim(),
      author_context: mCtx.trim() || null,
      text: mText.trim(),
      rating: mRating || null,
      consent: true,
      status: "approved",
      source: "professional",
      approved_at: new Date().toISOString(),
    });
    setAddingSaving(false);
    if (error) { toast.error("Erro ao adicionar"); return; }
    toast.success("Depoimento adicionado e publicado.");
    setMName(""); setMCtx(""); setMText(""); setMRating(0); setAddOpen(false);
    refresh();
  };

  const Card = ({ r, actions }: { r: Row; actions: React.ReactNode }) => (
    <div className="rounded-xl border bg-background p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{r.author_name}</p>
          {r.author_context && <p className="text-xs text-muted-foreground">{r.author_context}</p>}
        </div>
        <Stars rating={r.rating} />
      </div>
      <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{r.text}</p>
      <div className="flex items-center justify-end gap-2 pt-1">{actions}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Aviso de conformidade */}
      <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5">
        <ShieldAlert className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-amber-800">Sua responsabilidade sobre os depoimentos</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            Publique apenas depoimentos espontâneos e com autorização de quem os escreveu — nunca exponha
            pacientes ou casos clínicos. Respeite as regras do seu conselho de classe sobre publicidade
            (alguns conselhos, como o CFP, restringem depoimentos de pacientes). Nada aparece na sua página sem a sua aprovação.
          </p>
        </div>
      </div>

      {/* Cabeçalho + liga/desliga */}
      <div className="space-y-4 rounded-xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label className="text-sm font-semibold">Mostrar seção de depoimentos na página</Label>
            <p className="text-xs text-muted-foreground">Quando ativada, a seção e o botão "Deixar depoimento" aparecem na sua página.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="t-title">Título da seção</Label>
          <Input id="t-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Quem já deu o primeiro passo" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="t-sub">Subtítulo</Label>
          <Textarea id="t-sub" rows={2} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="Histórias de pessoas que decidiram cuidar de si." />
        </div>
        <Button onClick={saveHeader} disabled={savingHeader} className="w-full">
          {savingHeader ? "Salvando..." : "Salvar configuração"}
        </Button>
      </div>

      {/* Adicionar manual */}
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold">Adicionar depoimento manualmente</Label>
          <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setAddOpen((v) => !v)}>
            <Plus className="h-4 w-4" /> {addOpen ? "Fechar" : "Novo"}
          </Button>
        </div>
        {addOpen && (
          <div className="space-y-3 pt-1">
            <Input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="Nome" maxLength={80} />
            <Input value={mCtx} onChange={(e) => setMCtx(e.target.value)} placeholder="Contexto (opcional)" maxLength={80} />
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setMRating((r) => (r === n ? 0 : n))} className="p-0.5">
                  <Star className={`h-5 w-5 ${n <= mRating ? "text-primary fill-primary" : "text-muted-foreground/40"}`} />
                </button>
              ))}
            </div>
            <Textarea rows={3} value={mText} onChange={(e) => setMText(e.target.value)} placeholder="Depoimento" maxLength={1500} />
            <Button onClick={addManual} disabled={addingSaving} className="w-full gap-2">
              {addingSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</> : "Adicionar e publicar"}
            </Button>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando depoimentos...</p>
      ) : (
        <>
          {/* Pendentes */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <h3 className="text-sm font-semibold">Pendentes de aprovação {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs">{pending.length}</span>}</h3>
            </div>
            {pending.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum depoimento aguardando aprovação.</p>
            ) : (
              pending.map((r) => (
                <Card key={r.id} r={r} actions={
                  <>
                    <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => setStatus(r.id, "rejected")}>
                      <X className="h-4 w-4" /> Rejeitar
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={() => setStatus(r.id, "approved")}>
                      <Check className="h-4 w-4" /> Aprovar
                    </Button>
                  </>
                } />
              ))
            )}
          </div>

          {/* Publicados */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Publicados ({approved.length})</h3>
            {approved.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum depoimento publicado ainda.</p>
            ) : (
              approved.map((r) => (
                <Card key={r.id} r={r} actions={
                  <>
                    <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setStatus(r.id, "pending")}>
                      Despublicar
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  </>
                } />
              ))
            )}
          </div>

          {/* Rejeitados */}
          {rejected.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground">Rejeitados ({rejected.length})</h3>
              {rejected.map((r) => (
                <Card key={r.id} r={r} actions={
                  <>
                    <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setStatus(r.id, "approved")}>
                      <Check className="h-4 w-4" /> Aprovar
                    </Button>
                    <Button size="sm" variant="ghost" className="gap-1.5 text-destructive" onClick={() => remove(r.id)}>
                      <Trash2 className="h-4 w-4" /> Excluir
                    </Button>
                  </>
                } />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
