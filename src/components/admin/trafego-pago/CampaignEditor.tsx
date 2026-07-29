import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Globe, Pencil, X, Plus, Save, Download, Rocket, PlayCircle, PauseCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type Campaign,
  type Asset,
  HEADLINE_MAX,
  DESC_MAX,
  PATH_MAX,
} from "./types";
import { downloadGoogleAdsEditorCsv } from "./exportGoogleAdsCsv";
import { sanitizeKeywordText } from "./keywordUtils";
import PublishChecklistDialog from "./PublishChecklistDialog";
import { useAdsAccountStatus } from "./GoogleAdsAccountCard";

async function callAdsProxy(action: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("google-ads-proxy", {
    body: { action, ...extra },
  });
  if (error) {
    let detail: any = null;
    try { detail = await (error as any).context?.json?.(); } catch { /* ignore */ }
    throw new Error(detail?.mensagem ?? detail?.error ?? error.message);
  }
  if (data?.error) throw new Error(data.mensagem ?? data.error);
  // A ação valeu no Google mas o registro local divergiu — avisar em vez de mostrar sucesso limpo.
  if (data?.aviso_local) toast.warning("Confira no Google Ads", { description: data.aviso_local });
  return data;
}

function charCounter(value: string, max: number) {
  const len = value.length;
  const over = len > max;
  return (
    <span className={`text-xs tabular-nums shrink-0 ${over ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
      {len}/{max}
    </span>
  );
}

// ── Hook: assets de uma campanha ───────────────────────────
function useCampaignAssets(campaignId: string | null) {
  return useQuery({
    queryKey: ["ads_campaign_assets", campaignId],
    enabled: !!campaignId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ads_campaign_assets" as any)
        .select("*")
        .eq("campaign_id", campaignId!)
        .order("position");
      if (error) throw error;
      return (data ?? []) as Asset[];
    },
  });
}

// ── Rascunhos de edição ────────────────────────────────────
interface RsaDraft {
  headlines: string[];
  descriptions: string[];
  path1: string;
  path2: string;
}
interface KwDraft {
  text: string;
  match_type: string;
}
interface NewKw {
  tempId: string;
  groupId: string;
  text: string;
  match_type: string;
}

export default function CampaignEditor({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient();
  const { data: assets = [], isLoading } = useCampaignAssets(campaign.id);

  const [editing, setEditing] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [apiPublishSummary, setApiPublishSummary] = useState<{ nome: string; orcamento_diario: string; aviso: string } | null>(null);
  const [confirmAtivar, setConfirmAtivar] = useState(false);
  const [apiBusy, setApiBusy] = useState(false);
  const { data: adsStatus } = useAdsAccountStatus();
  const accountActive = adsStatus?.conta?.status === "active";
  const [rsaDrafts, setRsaDrafts] = useState<Record<string, RsaDraft>>({});
  const [kwDrafts, setKwDrafts] = useState<Record<string, KwDraft>>({});
  const [removedKw, setRemovedKw] = useState<Set<string>>(new Set());
  const [newKws, setNewKws] = useState<NewKw[]>([]);

  const editable = campaign.status === "draft" || campaign.status === "approved";

  const adGroups = assets.filter((a) => a.asset_type === "ad_group").sort((a, b) => a.position - b.position);
  const sitelinks = assets.filter((a) => a.asset_type === "sitelink");
  const callouts = assets.filter((a) => a.asset_type === "callout");
  const globalNegs = assets.filter((a) => a.asset_type === "negative_keyword" && !a.parent_id);

  function enterEditMode() {
    const rsa: Record<string, RsaDraft> = {};
    const kws: Record<string, KwDraft> = {};
    for (const a of assets) {
      if (a.asset_type === "rsa") {
        rsa[a.id] = {
          headlines: [...(a.payload.headlines ?? [])],
          descriptions: [...(a.payload.descriptions ?? [])],
          path1: a.payload.path1 ?? "",
          path2: a.payload.path2 ?? "",
        };
      } else if (a.asset_type === "keyword") {
        kws[a.id] = { text: a.payload.text ?? "", match_type: a.payload.match_type ?? "broad" };
      }
    }
    setRsaDrafts(rsa);
    setKwDrafts(kws);
    setRemovedKw(new Set());
    setNewKws([]);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setRsaDrafts({});
    setKwDrafts({});
    setRemovedKw(new Set());
    setNewKws([]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Validação antes de gravar
      for (const [rsaId, draft] of Object.entries(rsaDrafts)) {
        const headlines = draft.headlines.map((h) => h.trim()).filter(Boolean);
        if (headlines.length < 3) throw new Error("Cada anúncio precisa de pelo menos 3 títulos.");
        if (headlines.some((h) => h.length > HEADLINE_MAX)) throw new Error(`Título acima de ${HEADLINE_MAX} caracteres.`);
        const descriptions = draft.descriptions.map((d) => d.trim()).filter(Boolean);
        if (descriptions.length < 1) throw new Error("Cada anúncio precisa de pelo menos 1 descrição.");
        if (descriptions.some((d) => d.length > DESC_MAX)) throw new Error(`Descrição acima de ${DESC_MAX} caracteres.`);
        if (draft.path1.includes(" ") || draft.path2.includes(" ")) throw new Error("Paths não podem ter espaços.");
        void rsaId;
      }

      // 1. RSAs alterados
      for (const a of assets.filter((x) => x.asset_type === "rsa")) {
        const draft = rsaDrafts[a.id];
        if (!draft) continue;
        const next = {
          ...a.payload,
          headlines: draft.headlines.map((h) => h.trim()).filter(Boolean),
          descriptions: draft.descriptions.map((d) => d.trim()).filter(Boolean),
          path1: draft.path1.trim() || undefined,
          path2: draft.path2.trim() || undefined,
        };
        if (JSON.stringify(next) !== JSON.stringify(a.payload)) {
          const { error } = await supabase
            .from("ads_campaign_assets" as any)
            .update({ payload: next })
            .eq("id", a.id);
          if (error) throw error;
        }
      }

      // 2. Keywords alteradas (sanitizadas: o Google rejeita pontuação/símbolos)
      for (const a of assets.filter((x) => x.asset_type === "keyword")) {
        if (removedKw.has(a.id)) continue;
        const draft = kwDrafts[a.id];
        if (!draft || !draft.text.trim()) continue;
        const cleanText = sanitizeKeywordText(draft.text);
        if (!cleanText) throw new Error(`Palavra-chave inválida: "${draft.text}" (use só letras, números e espaços — máx. 10 palavras).`);
        const next = { ...a.payload, text: cleanText, match_type: draft.match_type };
        if (JSON.stringify(next) !== JSON.stringify(a.payload)) {
          const { error } = await supabase
            .from("ads_campaign_assets" as any)
            .update({ payload: next })
            .eq("id", a.id);
          if (error) throw error;
        }
      }

      // 3. Keywords removidas
      if (removedKw.size > 0) {
        const { error } = await supabase
          .from("ads_campaign_assets" as any)
          .delete()
          .in("id", Array.from(removedKw));
        if (error) throw error;
      }

      // 4. Keywords novas (sanitizadas)
      const inserts = newKws
        .filter((k) => k.text.trim())
        .map((k, i) => {
          const cleanText = sanitizeKeywordText(k.text);
          if (!cleanText) throw new Error(`Palavra-chave inválida: "${k.text}" (use só letras, números e espaços — máx. 10 palavras).`);
          return {
            campaign_id: campaign.id,
            asset_type: "keyword",
            parent_id: k.groupId,
            payload: { text: cleanText, match_type: k.match_type },
            position: 100 + i,
          };
        });
      if (inserts.length > 0) {
        const { error } = await supabase.from("ads_campaign_assets" as any).insert(inserts);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ads_campaign_assets", campaign.id] });
      toast.success("Campanha atualizada!");
      cancelEdit();
    },
    onError: (e: any) => toast.error("Erro ao salvar", { description: e.message }),
  });

  async function startApiPublish() {
    setApiBusy(true);
    try {
      const res = await callAdsProxy("publicar_campanha", { campaign_id: campaign.id });
      if (res.requer_confirmacao) setApiPublishSummary(res.resumo);
      else if (res.ja_publicada) toast.info("Essa campanha já está publicada no Google Ads.");
    } catch (e: any) {
      toast.error("Publicação", { description: e.message });
    } finally {
      setApiBusy(false);
    }
  }

  async function confirmApiPublish() {
    setApiBusy(true);
    try {
      const res = await callAdsProxy("publicar_campanha", { campaign_id: campaign.id, confirmar: true });
      toast.success("Campanha publicada no Google Ads! 🎉", { description: res.aviso });
      setApiPublishSummary(null);
      qc.invalidateQueries({ queryKey: ["ads_campaigns"] });
    } catch (e: any) {
      toast.error("Publicação falhou", { description: e.message });
    } finally {
      setApiBusy(false);
    }
  }

  async function toggleVeiculacao(action: "ativar_campanha" | "pausar_campanha") {
    setApiBusy(true);
    try {
      await callAdsProxy(action, { campaign_id: campaign.id });
      toast.success(action === "ativar_campanha"
        ? "Campanha ATIVA no Google Ads — começou a veicular."
        : "Campanha pausada no Google Ads.");
      qc.invalidateQueries({ queryKey: ["ads_campaigns"] });
    } catch (e: any) {
      toast.error("Google Ads", { description: e.message });
    } finally {
      setApiBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando estrutura da campanha...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar de edição */}
      {editable && (
        <div className="flex justify-end gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saveMutation.isPending}>
                Cancelar
              </Button>
              <Button size="sm" className="gap-1.5" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Save className="h-3.5 w-3.5" />}
                Salvar alterações
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={enterEditMode}>
              <Pencil className="h-3.5 w-3.5" />
              Editar textos
            </Button>
          )}
        </div>
      )}

      {/* Informações gerais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">URL de destino</Label>
          <p className="text-xs text-muted-foreground break-all font-mono bg-muted/30 rounded px-2 py-1">
            {campaign.landing_url ?? "—"}
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Orçamento máximo/dia</Label>
          <p className="text-xs text-muted-foreground">
            R$ {campaign.max_daily_budget_brl.toFixed(2)}
            <span className="ml-2 text-yellow-600 dark:text-yellow-400 font-medium">(Google pode gastar até 2× o diário)</span>
          </p>
        </div>
      </div>

      {/* Grupos de anúncios */}
      {adGroups.length > 0 && (
        <Accordion type="multiple" className="space-y-2">
          {adGroups.map((group) => {
            const rsa = assets.find((a) => a.asset_type === "rsa" && a.parent_id === group.id);
            const keywords = assets
              .filter((a) => a.asset_type === "keyword" && a.parent_id === group.id && !removedKw.has(a.id))
              .sort((a, b) => a.position - b.position);
            const negKws = assets.filter((a) => a.asset_type === "negative_keyword" && a.parent_id === group.id);
            const groupNewKws = newKws.filter((k) => k.groupId === group.id);

            return (
              <AccordionItem key={group.id} value={group.id} className="border rounded-md px-3">
                <AccordionTrigger className="py-3 hover:no-underline">
                  <span className="font-medium text-sm text-left">{group.payload.name}</span>
                  <span className="text-xs text-muted-foreground ml-2 font-normal">{group.payload.theme}</span>
                </AccordionTrigger>
                <AccordionContent className="pb-4 space-y-4">

                  {/* RSA */}
                  {rsa && (() => {
                    const draft = editing ? rsaDrafts[rsa.id] : null;
                    const headlines: string[] = draft ? draft.headlines : (rsa.payload.headlines ?? []);
                    const descriptions: string[] = draft ? draft.descriptions : (rsa.payload.descriptions ?? []);
                    const path1 = draft ? draft.path1 : (rsa.payload.path1 ?? "");
                    const path2 = draft ? draft.path2 : (rsa.payload.path2 ?? "");

                    const setDraft = (patch: Partial<RsaDraft>) =>
                      setRsaDrafts((prev) => ({ ...prev, [rsa.id]: { ...prev[rsa.id], ...patch } }));

                    return (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Anúncio Responsivo (RSA)</p>

                        <div className="space-y-2">
                          <Label className="text-xs">Títulos ({headlines.length}/15)</Label>
                          {headlines.map((h, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                value={h}
                                readOnly={!editing}
                                maxLength={HEADLINE_MAX}
                                className="text-xs h-7"
                                onChange={(e) => {
                                  if (!draft) return;
                                  const next = [...draft.headlines];
                                  next[i] = e.target.value;
                                  setDraft({ headlines: next });
                                }}
                              />
                              {charCounter(h, HEADLINE_MAX)}
                              {editing && headlines.length > 3 && (
                                <button
                                  type="button"
                                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                  onClick={() => draft && setDraft({ headlines: draft.headlines.filter((_, j) => j !== i) })}
                                  aria-label="Remover título"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                          {editing && headlines.length < 15 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 h-7 text-xs"
                              onClick={() => draft && setDraft({ headlines: [...draft.headlines, ""] })}
                            >
                              <Plus className="h-3 w-3" />
                              Adicionar título
                            </Button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs">Descrições ({descriptions.length}/4)</Label>
                          {descriptions.map((d, i) => (
                            <div key={i} className="flex items-start gap-2">
                              <Textarea
                                value={d}
                                readOnly={!editing}
                                maxLength={DESC_MAX}
                                className="text-xs min-h-[3rem] resize-none"
                                onChange={(e) => {
                                  if (!draft) return;
                                  const next = [...draft.descriptions];
                                  next[i] = e.target.value;
                                  setDraft({ descriptions: next });
                                }}
                              />
                              {charCounter(d, DESC_MAX)}
                            </div>
                          ))}
                        </div>

                        {(editing || path1 || path2) && (
                          <div className="flex gap-2">
                            <div className="space-y-1 flex-1">
                              <Label className="text-xs">Path 1</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  value={path1}
                                  readOnly={!editing}
                                  maxLength={PATH_MAX}
                                  className="text-xs h-7"
                                  onChange={(e) => setDraft({ path1: e.target.value.replace(/\s/g, "") })}
                                />
                                {charCounter(path1, PATH_MAX)}
                              </div>
                            </div>
                            <div className="space-y-1 flex-1">
                              <Label className="text-xs">Path 2</Label>
                              <div className="flex items-center gap-2">
                                <Input
                                  value={path2}
                                  readOnly={!editing}
                                  maxLength={PATH_MAX}
                                  className="text-xs h-7"
                                  onChange={(e) => setDraft({ path2: e.target.value.replace(/\s/g, "") })}
                                />
                                {charCounter(path2, PATH_MAX)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Keywords */}
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Palavras-chave ({keywords.length + groupNewKws.length})
                    </p>

                    {!editing ? (
                      <div className="flex flex-wrap gap-1.5">
                        {keywords.map((kw) => (
                          <Badge key={kw.id} variant="outline" className="text-xs font-normal gap-1">
                            <span className="text-muted-foreground">
                              {kw.payload.match_type === "exact" ? "[" : kw.payload.match_type === "phrase" ? '"' : ""}
                            </span>
                            {kw.payload.text}
                            <span className="text-muted-foreground">
                              {kw.payload.match_type === "exact" ? "]" : kw.payload.match_type === "phrase" ? '"' : ""}
                            </span>
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {keywords.map((kw) => {
                          const draft = kwDrafts[kw.id];
                          if (!draft) return null;
                          return (
                            <div key={kw.id} className="flex items-center gap-2">
                              <Input
                                value={draft.text}
                                className="text-xs h-7 flex-1"
                                onChange={(e) =>
                                  setKwDrafts((prev) => ({ ...prev, [kw.id]: { ...prev[kw.id], text: e.target.value } }))
                                }
                              />
                              <Select
                                value={draft.match_type}
                                onValueChange={(v) =>
                                  setKwDrafts((prev) => ({ ...prev, [kw.id]: { ...prev[kw.id], match_type: v } }))
                                }
                              >
                                <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="exact">Exata</SelectItem>
                                  <SelectItem value="phrase">Frase</SelectItem>
                                  <SelectItem value="broad">Ampla</SelectItem>
                                </SelectContent>
                              </Select>
                              <button
                                type="button"
                                className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                                onClick={() => setRemovedKw((prev) => new Set(prev).add(kw.id))}
                                aria-label="Remover palavra-chave"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}

                        {groupNewKws.map((nk) => (
                          <div key={nk.tempId} className="flex items-center gap-2">
                            <Input
                              value={nk.text}
                              placeholder="nova palavra-chave"
                              className="text-xs h-7 flex-1"
                              onChange={(e) =>
                                setNewKws((prev) => prev.map((k) => k.tempId === nk.tempId ? { ...k, text: e.target.value } : k))
                              }
                            />
                            <Select
                              value={nk.match_type}
                              onValueChange={(v) =>
                                setNewKws((prev) => prev.map((k) => k.tempId === nk.tempId ? { ...k, match_type: v } : k))
                              }
                            >
                              <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="exact">Exata</SelectItem>
                                <SelectItem value="phrase">Frase</SelectItem>
                                <SelectItem value="broad">Ampla</SelectItem>
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                              onClick={() => setNewKws((prev) => prev.filter((k) => k.tempId !== nk.tempId))}
                              aria-label="Descartar nova palavra-chave"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}

                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 h-7 text-xs"
                          onClick={() =>
                            setNewKws((prev) => [
                              ...prev,
                              { tempId: crypto.randomUUID(), groupId: group.id, text: "", match_type: "phrase" },
                            ])
                          }
                        >
                          <Plus className="h-3 w-3" />
                          Adicionar palavra-chave
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Negativos do grupo (só leitura — controle de escopo) */}
                  {negKws.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Negativos do grupo
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {negKws.map((kw) => (
                          <Badge key={kw.id} variant="secondary" className="text-xs font-normal line-through opacity-60">
                            {kw.payload.text}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      {/* Sitelinks */}
      {sitelinks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Sitelinks ({sitelinks.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {sitelinks.map((sl) => (
              <div key={sl.id} className="bg-muted/30 rounded px-3 py-2 text-xs space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{sl.payload.text}</span>
                  {charCounter(sl.payload.text ?? "", 25)}
                </div>
                {sl.payload.description && (
                  <p className="text-muted-foreground">{sl.payload.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Callouts */}
      {callouts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Callouts ({callouts.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {callouts.map((co) => (
              <Badge key={co.id} variant="outline" className="text-xs font-normal">
                {co.payload.text}
                <span className="ml-1 text-muted-foreground/60">
                  ({(co.payload.text ?? "").length}/25)
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Negativos globais */}
      {globalNegs.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Negativos de campanha ({globalNegs.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {globalNegs.map((kw) => (
              <Badge key={kw.id} variant="secondary" className="text-xs font-normal opacity-60 line-through">
                {kw.payload.text}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Publicação guiada (campanha aprovada) */}
      {campaign.status === "approved" && !editing && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2.5 text-xs text-blue-800 dark:text-blue-200 mt-2 space-y-2">
          <div className="flex items-start gap-2">
            <Globe className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Campanha aprovada — pronta para publicar</p>
              <p className="mt-0.5 text-blue-700 dark:text-blue-300">
                Exporte o CSV e siga o checklist guiado. A campanha importa <strong>pausada</strong> — você ativa quando conferir tudo na sua conta Google Ads.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {accountActive && (
              <Button
                size="sm"
                className="gap-1.5 h-7 text-xs"
                disabled={apiBusy}
                onClick={startApiPublish}
              >
                {apiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Rocket className="h-3 w-3" />}
                Publicar pela plataforma
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-7 text-xs bg-background"
              onClick={() => downloadGoogleAdsEditorCsv(campaign, assets)}
            >
              <Download className="h-3 w-3" />
              Exportar CSV (Ads Editor)
            </Button>
            <Button
              variant={accountActive ? "outline" : "default"}
              size="sm"
              className={`gap-1.5 h-7 text-xs ${accountActive ? "bg-background" : ""}`}
              onClick={() => setPublishOpen(true)}
            >
              <Globe className="h-3 w-3" />
              {accountActive ? "Publicação manual" : "Como publicar"}
            </Button>
          </div>
        </div>
      )}

      {/* Publicada / veiculando / pausada */}
      {["published", "active", "paused"].includes(campaign.status) && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-2.5 text-xs text-emerald-800 dark:text-emerald-200 mt-2 space-y-2">
          <div className="flex items-start gap-2">
            <Globe className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">
                {campaign.status === "active"
                  ? "Veiculando no Google Ads"
                  : campaign.status === "paused"
                  ? "Pausada no Google Ads"
                  : "Publicada no Google Ads"}
              </p>
              <p className="mt-0.5 text-emerald-700 dark:text-emerald-300">
                {campaign.status === "published" && (
                  <>A campanha está pausada no Google (aprovação leva 1-3 dias úteis). Ative quando quiser veicular.{" "}</>
                )}
                {!campaign.external_id && (
                  <>Precisa do CSV de novo?{" "}
                    <button type="button" className="underline" onClick={() => downloadGoogleAdsEditorCsv(campaign, assets)}>
                      Baixar
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
          {campaign.external_id && (
            <div className="pl-6">
              {campaign.status === "active" ? (
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs bg-background" disabled={apiBusy}
                  onClick={() => toggleVeiculacao("pausar_campanha")}>
                  {apiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PauseCircle className="h-3 w-3" />}
                  Pausar veiculação
                </Button>
              ) : (
                <Button size="sm" className="gap-1.5 h-7 text-xs" disabled={apiBusy}
                  onClick={() => setConfirmAtivar(true)}>
                  {apiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PlayCircle className="h-3 w-3" />}
                  Ativar veiculação
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <PublishChecklistDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        campaign={campaign}
        assets={assets}
      />

      {/* Dupla confirmação da publicação via API */}
      <AlertDialog open={apiPublishSummary !== null} onOpenChange={(o) => { if (!o) setApiPublishSummary(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publicar no Google Ads?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p><span className="font-medium text-foreground">{apiPublishSummary?.nome}</span></p>
                <p>Orçamento: <span className="font-medium text-foreground">{apiPublishSummary?.orcamento_diario}</span> (o Google pode gastar até 2× num dia)</p>
                <p>{apiPublishSummary?.aviso}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apiBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={apiBusy} onClick={(e) => { e.preventDefault(); confirmApiPublish(); }}>
              {apiBusy ? "Publicando…" : "Confirmar publicação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dupla confirmação da ATIVAÇÃO — é o passo que liga o gasto real no cartão do profissional */}
      <AlertDialog open={confirmAtivar} onOpenChange={setConfirmAtivar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar a veiculação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>A partir de agora a campanha <span className="font-medium text-foreground">{campaign.name}</span> passa a veicular e a gastar no seu cartão do Google Ads.</p>
                <p>Orçamento: <span className="font-medium text-foreground">R$ {Number(campaign.daily_budget_brl).toFixed(2)}/dia</span> — o Google pode gastar até 2× num dia (compensa na média do mês).</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={apiBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={apiBusy} onClick={(e) => { e.preventDefault(); setConfirmAtivar(false); toggleVeiculacao("ativar_campanha"); }}>
              {apiBusy ? "Ativando…" : "Sim, ativar e começar a gastar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
