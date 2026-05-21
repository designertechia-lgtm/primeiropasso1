import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bot, Loader2, Plus, Pause, Play, Trash2,
  Calendar, Clock, Zap, Instagram, Linkedin, Facebook, AtSign, Film,
} from "lucide-react";
import { TikTokIcon } from "@/components/icons/TikTokIcon";

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: Instagram, color: "text-pink-500",   bg: "bg-pink-50 border-pink-200"     },
  { id: "facebook",  label: "Facebook",  icon: Facebook,  color: "text-blue-600",   bg: "bg-blue-50 border-blue-200"     },
  { id: "threads",   label: "Threads",   icon: AtSign,    color: "text-neutral-900",bg: "bg-neutral-100 border-neutral-300" },
  { id: "linkedin",  label: "LinkedIn",  icon: Linkedin,  color: "text-blue-700",   bg: "bg-blue-50 border-blue-200"     },
  { id: "tiktok",    label: "TikTok",    icon: TikTokIcon,color: "text-rose-600",   bg: "bg-rose-50 border-rose-200"     },
] as const;

type Platform = (typeof PLATFORMS)[number]["id"];

interface Automation {
  id: string;
  platform: Platform;
  post_type: "reels" | "feed";
  tema: string;
  frequencia: "diario" | "semanal" | "quinzenal";
  hora_publicacao: string;
  status: "active" | "paused";
  ultimo_run_at: string | null;
  proximo_run_at: string | null;
}

const freqLabel: Record<string, string> = {
  diario: "Diário",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
};

export default function AutomacoesTab() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [tema,      setTema]      = useState("");
  const [freq,      setFreq]      = useState<"diario" | "semanal" | "quinzenal">("semanal");
  const [hora,      setHora]      = useState("09:00");
  const [platform,  setPlatform]  = useState<Platform>("instagram");
  const [postType,  setPostType]  = useState<"reels" | "feed">("reels");
  const [saving,    setSaving]    = useState(false);

  const { data: automations = [], isLoading } = useQuery<Automation[]>({
    queryKey: ["social-automations", professional?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("social_automations")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return (data ?? []) as Automation[];
    },
    enabled: !!professional?.id,
  });

  async function handleSave() {
    if (!professional || !tema.trim()) return;
    setSaving(true);
    const now = new Date();
    const [h, m] = hora.split(":").map(Number);
    const next = new Date(now);
    next.setHours(h, m, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);

    const { error } = await (supabase as any).from("social_automations").insert({
      professional_id: professional.id,
      platform,
      post_type: postType,
      tema: tema.trim(),
      frequencia: freq,
      hora_publicacao: hora,
      status: "active",
      proximo_run_at: next.toISOString(),
    });
    setSaving(false);
    if (error) return toast.error("Erro ao salvar automação", { description: error.message });
    toast.success("Automação criada!", { description: `Próximo post: ${next.toLocaleString("pt-BR")}` });
    setDialogOpen(false);
    setTema("");
    queryClient.invalidateQueries({ queryKey: ["social-automations"] });
  }

  async function handleToggle(auto: Automation) {
    const newStatus = auto.status === "active" ? "paused" : "active";
    const { error } = await (supabase as any)
      .from("social_automations")
      .update({ status: newStatus })
      .eq("id", auto.id);
    if (error) toast.error("Erro ao atualizar");
    else queryClient.invalidateQueries({ queryKey: ["social-automations"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta automação?")) return;
    const { error } = await (supabase as any)
      .from("social_automations")
      .delete()
      .eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Automação excluída");
      queryClient.invalidateQueries({ queryKey: ["social-automations"] });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Bot className="h-6 w-6 text-purple-500" />
            Automações PRO
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Gera e publica vídeos automaticamente com base num tema recorrente.
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Nova automação
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando…
        </div>
      ) : automations.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-purple-200 p-8 text-center space-y-2">
          <Zap className="h-10 w-10 text-purple-300 mx-auto" />
          <p className="text-sm text-muted-foreground">
            Nenhuma automação ainda. Crie uma para gerar e publicar vídeos automaticamente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {automations.map((auto) => {
            const plat = PLATFORMS.find((p) => p.id === auto.platform);
            const Icon = plat?.icon ?? Film;
            return (
              <Card key={auto.id} className={auto.status === "paused" ? "opacity-60" : ""}>
                <CardContent className="p-4 flex gap-4 items-start">
                  <div className="shrink-0 mt-0.5">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${plat?.bg ?? "bg-muted"}`}>
                      <Icon className={`h-4 w-4 ${plat?.color ?? "text-muted-foreground"}`} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="font-medium text-sm line-clamp-1">{auto.tema}</p>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">{freqLabel[auto.frequencia]}</Badge>
                      <Badge variant="outline" className="text-xs capitalize">{auto.post_type}</Badge>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />{auto.hora_publicacao.slice(0, 5)}
                      </span>
                      <Badge variant={auto.status === "active" ? "default" : "secondary"} className="text-xs">
                        {auto.status === "active" ? "Ativa" : "Pausada"}
                      </Badge>
                    </div>
                    {auto.proximo_run_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Próximo: {new Date(auto.proximo_run_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground"
                      title={auto.status === "active" ? "Pausar" : "Ativar"}
                      onClick={() => handleToggle(auto)}
                    >
                      {auto.status === "active"
                        ? <Pause className="h-3.5 w-3.5" />
                        : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(auto.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-500" /> Nova Automação PRO
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label>Tema recorrente</Label>
              <Textarea
                rows={3}
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                placeholder="Ex: Como reduzir a ansiedade no trabalho..."
              />
              <p className="text-xs text-muted-foreground">
                A IA vai gerar um vídeo novo sobre este tema a cada publicação.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Plataforma</Label>
              <div className="grid grid-cols-3 gap-2">
                {PLATFORMS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlatform(p.id)}
                      className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border-2 text-xs font-medium transition-colors ${
                        platform === p.id
                          ? `${p.bg} border-current ${p.color}`
                          : "border-border text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de post</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["reels", "feed"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPostType(type)}
                    className={`p-2.5 rounded-lg border-2 text-sm font-medium capitalize transition-colors ${
                      postType === type
                        ? "border-purple-500 bg-purple-50 text-purple-700"
                        : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Frequência</Label>
                <select
                  value={freq}
                  onChange={(e) => setFreq(e.target.value as typeof freq)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="diario">Diário</option>
                  <option value="semanal">Semanal</option>
                  <option value="quinzenal">Quinzenal</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving || !tema.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              {saving
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</>
                : <><Bot className="h-4 w-4 mr-2" />Criar automação</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
