// ANCORA-DOC: feature "agenda" — converter bloqueios repetidos em regra semanal.
//
// Migração de dados com o usuário no comando: a detecção (lib/detectarRegras) é
// um palpite informado, então a tela MOSTRA o que entendeu, deixa ajustar e só
// aplica depois do "confirmar". A ordem também importa — a disponibilidade nova
// é gravada ANTES de qualquer exclusão, para nenhum horário ficar aberto por
// engano no meio do caminho.

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowRight, Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { sugerirRegras, detectarFaixasRepetidas, type BlocoSimples, type RegraSugerida } from "@/lib/detectarRegras";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface RegraEditavel extends RegraSugerida {
  aplicar: boolean;
  inicio: string;
  fim: string;
  almocoLigado: boolean;
  almocoInicio: string;
  almocoFim: string;
}

export default function ConverterBloqueiosDialog({
  open,
  onOpenChange,
  professionalId,
  blocos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  professionalId: string;
  blocos: BlocoSimples[];
}) {
  const queryClient = useQueryClient();
  const [aplicando, setAplicando] = useState(false);
  const [apagarBloqueios, setApagarBloqueios] = useState(true);

  const sugestoes = useMemo(() => sugerirRegras(detectarFaixasRepetidas(blocos)), [blocos]);

  const [regras, setRegras] = useState<RegraEditavel[]>([]);
  // Recarrega o rascunho a cada abertura, para não mostrar edição abandonada.
  useEffect(() => {
    if (!open) return;
    setRegras(sugestoes.map((r) => ({
      ...r,
      aplicar: true,
      inicio: r.janelas[0]?.start ?? "08:00",
      fim: r.janelas[r.janelas.length - 1]?.end ?? "18:00",
      almocoLigado: !!r.almoco,
      almocoInicio: r.almoco?.start ?? "12:00",
      almocoFim: r.almoco?.end ?? "13:00",
    })));
  }, [open, sugestoes]);

  const selecionadas = regras.filter((r) => r.aplicar);
  const totalRemovidos = selecionadas.reduce((s, r) => s + r.idsSubstituidos.length, 0);

  const set = (dow: number, campos: Partial<RegraEditavel>) =>
    setRegras((prev) => prev.map((r) => (r.dow === dow ? { ...r, ...campos } : r)));

  const aplicar = async () => {
    if (selecionadas.length === 0) return;

    for (const r of selecionadas) {
      if (!r.fechado && r.fim <= r.inicio) {
        toast.error(`${DAYS[r.dow]}: o fim precisa ser depois do início.`);
        return;
      }
      if (!r.fechado && r.almocoLigado && r.almocoFim <= r.almocoInicio) {
        toast.error(`${DAYS[r.dow]}: o almoço termina antes de começar.`);
        return;
      }
    }

    setAplicando(true);
    try {
      // 1) Disponibilidade PRIMEIRO. Se algo falhar daqui pra frente, o pior
      // cenário é ter regra e bloqueio ao mesmo tempo — nunca um dia aberto.
      const diasTocados = selecionadas.map((r) => r.dow);
      const { error: delErr } = await supabase
        .from("availability").delete()
        .eq("professional_id", professionalId)
        .in("day_of_week", diasTocados);
      if (delErr) throw delErr;

      const novas = selecionadas
        .filter((r) => !r.fechado)
        .map((r) => ({
          professional_id: professionalId,
          day_of_week: r.dow,
          start_time: r.inicio,
          end_time: r.fim,
          active: true,
        }));
      if (novas.length > 0) {
        const { error } = await supabase.from("availability").insert(novas);
        if (error) throw error;
      }

      // 2) Almoço, preservando os dias que não entraram na conversão.
      const { data: prof } = await supabase
        .from("professionals").select("lunch_breaks").eq("id", professionalId).maybeSingle();
      const lunch: Record<string, { start: string; end: string }> =
        ((prof as any)?.lunch_breaks && typeof (prof as any).lunch_breaks === "object")
          ? { ...(prof as any).lunch_breaks } : {};
      for (const r of selecionadas) {
        if (r.fechado) continue;
        if (r.almocoLigado) lunch[String(r.dow)] = { start: r.almocoInicio, end: r.almocoFim };
        else delete lunch[String(r.dow)];
      }
      const { error: lunchErr } = await supabase
        .from("professionals").update({ lunch_breaks: lunch } as any).eq("id", professionalId);
      if (lunchErr) throw lunchErr;

      // 3) Só então os bloqueios que a regra substitui.
      let removidos = 0;
      if (apagarBloqueios) {
        const ids = selecionadas.flatMap((r) => r.idsSubstituidos);
        // Lotes de 200: um .in() com milhares de uuids estoura o tamanho da URL.
        for (let i = 0; i < ids.length; i += 200) {
          const { data, error } = await supabase
            .from("appointments").delete().in("id", ids.slice(i, i + 200)).select("id");
          if (error) throw error;
          removidos += data?.length ?? 0;
        }
      }

      queryClient.invalidateQueries({ queryKey: ["admin-block-groups"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-blocks-all"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-availability"] });
      queryClient.invalidateQueries({ queryKey: ["my-professional"] });

      toast.success("Regras aplicadas!", {
        description: apagarBloqueios
          ? `${removidos} bloqueio(s) removido(s) — a agenda agora segue a regra semanal.`
          : "Os bloqueios antigos foram mantidos, como você pediu.",
      });
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Não foi possível concluir", { description: e.message });
    } finally {
      setAplicando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" /> Transformar bloqueios repetidos em regra
          </DialogTitle>
          <DialogDescription>
            Estes bloqueios se repetem toda semana, então parecem ser o seu horário fixo.
            Confira o que eu entendi, ajuste o que estiver errado e confirme.
          </DialogDescription>
        </DialogHeader>

        {regras.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nenhum bloqueio repetido o bastante para virar regra. Nada a fazer aqui.
          </p>
        ) : (
          <div className="space-y-3">
            {regras.map((r) => (
              <div key={r.dow} className={cn("rounded-lg border p-3", !r.aplicar && "opacity-50")}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2.5">
                    <Switch checked={r.aplicar} onCheckedChange={(v) => set(r.dow, { aplicar: v })} />
                    <span className="font-medium text-sm">{DAYS[r.dow]}</span>
                    <Badge variant="outline" className="text-xs">
                      {r.idsSubstituidos.length} bloqueio(s)
                    </Badge>
                  </div>
                  {r.fechado ? (
                    <Badge variant="secondary">Não atendo neste dia</Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      bloqueado o dia todo, menos <ArrowRight className="h-3 w-3" />
                    </span>
                  )}
                </div>

                {r.aplicar && !r.fechado && (
                  <div className="mt-2.5 flex items-center gap-2 flex-wrap pl-11 text-xs">
                    <span className="text-muted-foreground">Atendo</span>
                    <Input type="time" value={r.inicio} className="w-28 h-8 text-xs"
                      onChange={(e) => set(r.dow, { inicio: e.target.value })} />
                    <span>até</span>
                    <Input type="time" value={r.fim} className="w-28 h-8 text-xs"
                      onChange={(e) => set(r.dow, { fim: e.target.value })} />
                    <span className="mx-1 opacity-40">|</span>
                    <Switch checked={r.almocoLigado}
                      onCheckedChange={(v) => set(r.dow, { almocoLigado: v })} />
                    <span className="text-muted-foreground">Almoço</span>
                    {r.almocoLigado && (
                      <>
                        <Input type="time" value={r.almocoInicio} className="w-28 h-8 text-xs"
                          onChange={(e) => set(r.dow, { almocoInicio: e.target.value })} />
                        <span>até</span>
                        <Input type="time" value={r.almocoFim} className="w-28 h-8 text-xs"
                          onChange={(e) => set(r.dow, { almocoFim: e.target.value })} />
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div className="rounded-lg border bg-muted/40 p-3 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Checkbox id="apagar" checked={apagarBloqueios}
                  onCheckedChange={(v) => setApagarBloqueios(!!v)} className="mt-0.5" />
                <label htmlFor="apagar" className="text-sm cursor-pointer">
                  Remover os <strong>{totalRemovidos}</strong> bloqueios que a regra substitui
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    A regra passa a valer de qualquer forma. Desmarcado, os bloqueios continuam
                    lá — o efeito é o mesmo, só ocupando espaço na agenda.
                  </span>
                </label>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={aplicar}
                disabled={aplicando || selecionadas.length === 0}>
                {aplicando ? "Aplicando..." : `Aplicar em ${selecionadas.length} dia(s)`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
