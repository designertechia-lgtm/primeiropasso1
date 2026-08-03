// ANCORA-DOC: feature "agenda" — aba Cancelados.
//
// Cancelar um agendamento APAGA a linha de `appointments` (o horário precisa
// voltar a ficar livre), então o histórico vive em `appointment_cancellations`,
// alimentada por trigger no banco — ver migration 20260802c. Esta tela é onde o
// profissional classifica o motivo e fecha o assunto.

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarX2, Check, Tag, Trash2, User, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchAllPages } from "@/lib/fetchAllPages";
import {
  CANCELLATION_REASONS, CANCELLED_BY_LABELS, reasonColor, reasonLabel,
} from "@/lib/cancellationReasons";
import { readableTextColor } from "@/lib/agendaValidation";

interface Cancellation {
  id: number;
  appointment_id: string;
  client_name: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  previous_status: string | null;
  payment_status: string | null;
  notes: string | null;
  cancelled_at: string;
  cancelled_by: string;
  reason_category: string | null;
  reason_notes: string | null;
  handled: boolean;
}

const PERIODOS = [
  { value: "30", label: "Últimos 30 dias" },
  { value: "90", label: "Últimos 90 dias" },
  { value: "365", label: "Último ano" },
  { value: "all", label: "Todo o período" },
];

export default function AdminCancelados() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const [periodo, setPeriodo] = useState("90");
  const [filtroMotivo, setFiltroMotivo] = useState("all");
  const [soPendentes, setSoPendentes] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  // Trocar de filtro zera a seleção de propósito: sem isso a pessoa marcaria
  // itens, mudaria o filtro e apagaria coisa que não está mais na tela.
  const trocarFiltro = <T,>(set: (v: T) => void) => (v: T) => {
    setSelecionados(new Set());
    set(v);
  };

  const { data: cancelamentos = [], isLoading } = useQuery({
    queryKey: ["appointment-cancellations", professional?.id],
    queryFn: async () =>
      fetchAllPages<Cancellation>((from, to) =>
        (supabase.from("appointment_cancellations" as any) as any)
          .select("*")
          .eq("professional_id", professional!.id)
          .order("cancelled_at", { ascending: false })
          .range(from, to)),
    enabled: !!professional?.id,
  });

  // Uma anotação só: categoria, observação e "já tratei" salvam juntos.
  const anotar = useMutation({
    mutationFn: async (p: { id: number; reason_category?: string | null; reason_notes?: string; handled?: boolean }) => {
      const { id, ...campos } = p;
      const { error } = await (supabase.from("appointment_cancellations" as any) as any)
        .update(campos).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment-cancellations"] });
    },
    onError: (e: any) => toast.error("Não foi possível salvar", { description: e.message }),
  });

  const excluir = useMutation({
    mutationFn: async (id: number) => {
      const { data, error } = await (supabase.from("appointment_cancellations" as any) as any)
        .delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Nada foi removido — o banco recusou a exclusão.");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointment-cancellations"] });
      toast.success("Registro removido do histórico.");
    },
    onError: (e: any) => toast.error("Erro ao remover", { description: e.message }),
  });

  const excluirVarios = useMutation({
    mutationFn: async (ids: number[]) => {
      let removidos = 0;
      // Lotes de 200: um .in() com centenas de ids estoura o tamanho da URL.
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await (supabase.from("appointment_cancellations" as any) as any)
          .delete().in("id", ids.slice(i, i + 200)).select("id");
        if (error) throw error;
        removidos += data?.length ?? 0;
      }
      if (removidos === 0) throw new Error("Nada foi removido — o banco recusou a exclusão.");
      return removidos;
    },
    onSuccess: (removidos) => {
      queryClient.invalidateQueries({ queryKey: ["appointment-cancellations"] });
      setSelecionados(new Set());
      toast.success(`${removidos} registro(s) removido(s) do histórico.`);
    },
    onError: (e: any) => toast.error("Erro ao remover", { description: e.message }),
  });

  const filtrados = useMemo(() => {
    const limite = periodo === "all" ? null : Number(periodo);
    return cancelamentos.filter((c) => {
      if (limite !== null && differenceInCalendarDays(new Date(), parseISO(c.cancelled_at)) > limite) return false;
      if (filtroMotivo === "sem" && c.reason_category) return false;
      if (filtroMotivo !== "all" && filtroMotivo !== "sem" && c.reason_category !== filtroMotivo) return false;
      if (soPendentes && c.handled) return false;
      return true;
    });
  }, [cancelamentos, periodo, filtroMotivo, soPendentes]);

  // Distribuição por motivo — a leitura que o profissional quer fazer.
  const distribuicao = useMemo(() => {
    const contagem = new Map<string, number>();
    filtrados.forEach((c) => {
      const k = c.reason_category || "__sem";
      contagem.set(k, (contagem.get(k) || 0) + 1);
    });
    const total = filtrados.length || 1;
    return [...contagem.entries()]
      .map(([k, n]) => ({
        key: k,
        label: k === "__sem" ? "Sem motivo" : reasonLabel(k),
        color: k === "__sem" ? "#94A3B8" : reasonColor(k),
        n,
        pct: Math.round((n / total) * 100),
      }))
      .sort((a, b) => b.n - a.n);
  }, [filtrados]);

  const semMotivo = filtrados.filter((c) => !c.reason_category).length;
  const naoTratados = filtrados.filter((c) => !c.handled).length;

  const todosSelecionados = filtrados.length > 0 && filtrados.every((c) => selecionados.has(c.id));
  const alternar = (id: number) =>
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Cancelados</h1>
        <p className="text-muted-foreground mt-1">
          O que foi cancelado e por quê. Classifique os motivos para enxergar o padrão.
        </p>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{filtrados.length}</p>
            <p className="text-xs text-muted-foreground mt-1">Cancelamentos no período</p>
          </CardContent>
        </Card>
        <Card className={cn(semMotivo > 0 && "border-amber-500/50")}>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{semMotivo}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {semMotivo > 0 && <AlertCircle className="h-3 w-3 text-amber-500" />}
              Sem motivo classificado
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold tabular-nums">{naoTratados}</p>
            <p className="text-xs text-muted-foreground mt-1">Ainda não tratados</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição */}
      {distribuicao.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Por que estão cancelando</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {distribuicao.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => setFiltroMotivo(d.key === "__sem" ? "sem" : d.key)}
                className="w-full text-left group"
                title={`Filtrar por ${d.label}`}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium group-hover:underline">{d.label}</span>
                  <span className="text-muted-foreground tabular-nums">{d.n} · {d.pct}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.max(d.pct, 2)}%`, backgroundColor: d.color }}
                  />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={periodo} onValueChange={trocarFiltro(setPeriodo)}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {PERIODOS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroMotivo} onValueChange={trocarFiltro(setFiltroMotivo)}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os motivos</SelectItem>
            <SelectItem value="sem">Sem motivo</SelectItem>
            {CANCELLATION_REASONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={soPendentes ? "default" : "outline"}
          size="sm"
          onClick={() => { setSelecionados(new Set()); setSoPendentes((v) => !v); }}
        >
          Só não tratados
        </Button>
      </div>

      {/* ── Seleção em lote ─────────────────────────────────────────────────
          "Selecionar todos" marca apenas o que está NA TELA (já filtrado), e a
          contagem no botão é sempre a do que será apagado de fato. */}
      {filtrados.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap rounded-lg border bg-muted/40 px-3 py-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <Checkbox
              checked={todosSelecionados}
              onCheckedChange={(v) =>
                setSelecionados(v ? new Set(filtrados.map((c) => c.id)) : new Set())
              }
            />
            {todosSelecionados ? "Desmarcar todos" : "Selecionar todos"}
            <span className="text-muted-foreground">({filtrados.length} na tela)</span>
          </label>

          {selecionados.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {selecionados.size} selecionado(s)
              </span>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="gap-1.5 ml-auto"
                    disabled={excluirVarios.isPending}>
                    <Trash2 className="h-3.5 w-3.5" />
                    {excluirVarios.isPending ? "Removendo..." : `Excluir ${selecionados.size}`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Remover {selecionados.size} registro(s) do histórico?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      Some da lista de cancelados definitivamente, junto com os motivos
                      e observações. Os agendamentos em si já não existem — isso apaga
                      apenas as anotações. Não dá para desfazer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Voltar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => excluirVarios.mutate([...selecionados])}
                    >
                      Remover {selecionados.size}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      )}

      {/* Lista */}
      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <CalendarX2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">
              {cancelamentos.length === 0
                ? "Nenhum cancelamento registrado. Os próximos aparecem aqui automaticamente."
                : "Nenhum cancelamento com esses filtros."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtrados.map((c) => (
            <Card key={c.id} className={cn(
              c.handled && "opacity-70",
              selecionados.has(c.id) && "ring-2 ring-primary/60",
            )}>
              <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 space-y-1.5 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Checkbox
                      checked={selecionados.has(c.id)}
                      onCheckedChange={() => alternar(c.id)}
                      aria-label={`Selecionar cancelamento de ${c.client_name || "sem nome"}`}
                      className="shrink-0"
                    />
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{c.client_name || "Sem nome"}</span>
                    <Badge
                      style={{
                        backgroundColor: reasonColor(c.reason_category),
                        color: readableTextColor(reasonColor(c.reason_category)),
                        borderColor: reasonColor(c.reason_category),
                      }}
                    >
                      {reasonLabel(c.reason_category)}
                    </Badge>
                    {c.handled && (
                      <Badge variant="outline" className="gap-1">
                        <Check className="h-3 w-3" /> Tratado
                      </Badge>
                    )}
                  </div>

                  <p className="text-sm text-muted-foreground flex items-center gap-1.5 flex-wrap">
                    <Clock className="h-3.5 w-3.5" />
                    Era {format(parseISO(c.appointment_date), "dd/MM/yyyy", { locale: ptBR })}
                    {" · "}{c.start_time.slice(0, 5)}–{c.end_time.slice(0, 5)}
                    <span className="opacity-60">|</span>
                    Cancelado em {format(parseISO(c.cancelled_at), "dd/MM/yyyy", { locale: ptBR })}
                    {" por "}{CANCELLED_BY_LABELS[c.cancelled_by] || c.cancelled_by}
                  </p>

                  {c.reason_notes && (
                    <p className="text-sm border-l-2 border-muted pl-2 whitespace-pre-line">{c.reason_notes}</p>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <ClassificarPopover
                    cancelamento={c}
                    onSalvar={(campos) => anotar.mutate({ id: c.id, ...campos })}
                    salvando={anotar.isPending}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    title={c.handled ? "Reabrir" : "Marcar como tratado"}
                    onClick={() => anotar.mutate({ id: c.id, handled: !c.handled })}
                    disabled={anotar.isPending}
                  >
                    <Check className={cn("h-4 w-4", c.handled && "text-primary")} />
                    <span className="hidden sm:inline">{c.handled ? "Reabrir" : "Tratado"}</span>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" title="Remover do histórico" disabled={excluir.isPending}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remover do histórico?</AlertDialogTitle>
                        <AlertDialogDescription>
                          O registro sai da lista de cancelados definitivamente. O agendamento
                          em si já não existe — isso apaga só a anotação.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Voltar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => excluir.mutate(c.id)}
                        >
                          Remover
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** Classificação do motivo, em popover para não tirar a pessoa da lista. */
function ClassificarPopover({
  cancelamento,
  onSalvar,
  salvando,
}: {
  cancelamento: Cancellation;
  onSalvar: (campos: { reason_category: string | null; reason_notes: string }) => void;
  salvando: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [categoria, setCategoria] = useState(cancelamento.reason_category);
  const [notas, setNotas] = useState(cancelamento.reason_notes || "");

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // Reabrir mostra o que está gravado, não o rascunho abandonado.
        if (v) { setCategoria(cancelamento.reason_category); setNotas(cancelamento.reason_notes || ""); }
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Tag className="h-4 w-4" />
          <span className="hidden sm:inline">{cancelamento.reason_category ? "Editar" : "Classificar"}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Motivo</Label>
            <div className="grid grid-cols-2 gap-1.5 mt-1.5">
              {CANCELLATION_REASONS.map((r) => {
                const ativo = categoria === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    title={r.hint}
                    onClick={() => setCategoria(ativo ? null : r.value)}
                    className={cn(
                      "rounded-lg border-2 px-2 py-1.5 text-xs transition-all text-left",
                      ativo ? "border-primary bg-primary/5 font-semibold" : "border-border hover:border-primary/40",
                    )}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="truncate">{r.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Observação</Label>
            <Textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="O que aconteceu?"
              rows={3}
              className="mt-1.5"
            />
          </div>
          <Button
            className="w-full"
            size="sm"
            disabled={salvando}
            onClick={() => {
              onSalvar({ reason_category: categoria, reason_notes: notas.trim() });
              setOpen(false);
            }}
          >
            {salvando ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
