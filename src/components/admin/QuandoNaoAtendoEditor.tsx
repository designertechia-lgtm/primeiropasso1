// ANCORA-DOC: feature "agenda" — "Quando eu não atendo" (regra semanal + feriados).
//
// POR QUE ISTO EXISTE: até 02/08/2026 a única forma de dizer "não atendo domingo"
// era criar um bloqueio por domingo. Um profissional real acabou com 3.281
// registros para expressar 5 regras (almoço, antes/depois do expediente, sábado,
// domingo) — massa que estourava o teto de 1000 linhas do PostgREST e escondia
// dois terços da própria agenda dele.
//
// Aqui a indisponibilidade é REGRA, não registro: zero linhas em `appointments`.
// A fonte é `availability` + `professionals.lunch_breaks`, que as telas do
// paciente (lib/slots.ts) e o Axel (edge whatsapp-agent) já respeitam.
//
// O mesmo componente atende o diálogo do Calendário e a aba Bloqueios — a regra
// não pode ter dois editores divergentes.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, X, CalendarIcon, Sun, Coffee, PartyPopper } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfessionalHolidays } from "@/hooks/useProfessionalHolidays";
import { nationalHolidaysBetween } from "@/lib/holidays";

const DAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface AvailSlot {
  id?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: boolean;
}

export default function QuandoNaoAtendoEditor({
  professional,
  onSaved,
}: {
  professional: any;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();
  const [salvando, setSalvando] = useState(false);

  const { data: availability = [] } = useQuery({
    queryKey: ["agenda-availability", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("availability").select("*")
        .eq("professional_id", professional!.id)
        .order("day_of_week").order("start_time");
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const [slots, setSlots] = useState<AvailSlot[]>([]);
  const [lunchByDay, setLunchByDay] = useState<Record<number, { start: string; end: string }>>({});
  const [bufferMin, setBufferMin] = useState(0);
  const [skipNational, setSkipNational] = useState(true);

  useEffect(() => {
    setSlots(availability.map((s: any) => ({
      id: s.id, day_of_week: s.day_of_week, start_time: s.start_time.slice(0, 5),
      end_time: s.end_time.slice(0, 5), active: s.active,
    })));
  }, [availability]);

  useEffect(() => {
    if (!professional) return;
    const p = professional as any;
    setBufferMin(Number(p.slot_buffer_minutes) || 0);
    setSkipNational(p.skip_national_holidays !== false);
    const lb = (p.lunch_breaks && typeof p.lunch_breaks === "object") ? p.lunch_breaks : {};
    const norm: Record<number, { start: string; end: string }> = {};
    for (let d = 0; d <= 6; d++) {
      const e = lb[String(d)];
      if (e?.start && e?.end) norm[d] = { start: String(e.start).slice(0, 5), end: String(e.end).slice(0, 5) };
    }
    setLunchByDay(norm);
  }, [professional]);

  const { custom: feriadosProprios } = useProfessionalHolidays(professional?.id, skipNational);

  const slotsDoDia = (dia: number) =>
    slots.map((s, i) => ({ ...s, _i: i })).filter((s) => s.day_of_week === dia);
  const atendeNoDia = (dia: number) => slotsDoDia(dia).some((s) => s.active);

  // Desligar o dia mantém o horário guardado (active=false) — religar devolve o
  // que a pessoa tinha, em vez de exigir digitar tudo de novo.
  const toggleDia = (dia: number, ligado: boolean) => {
    setSlots((prev) => {
      const doDia = prev.filter((s) => s.day_of_week === dia);
      if (doDia.length === 0 && ligado) {
        return [...prev, { day_of_week: dia, start_time: "08:00", end_time: "18:00", active: true }];
      }
      return prev.map((s) => (s.day_of_week === dia ? { ...s, active: ligado } : s));
    });
  };

  const addFaixa = (dia: number) =>
    setSlots((prev) => [...prev, { day_of_week: dia, start_time: "08:00", end_time: "12:00", active: true }]);
  const removeFaixa = (i: number) => setSlots((prev) => prev.filter((_, idx) => idx !== i));
  const updateFaixa = (i: number, campo: "start_time" | "end_time", valor: string) =>
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, [campo]: valor } : s)));

  const toggleAlmoco = (dia: number, on: boolean) =>
    setLunchByDay((prev) => {
      const next = { ...prev };
      if (on) next[dia] = prev[dia] || { start: "12:00", end: "13:00" };
      else delete next[dia];
      return next;
    });
  const updateAlmoco = (dia: number, campo: "start" | "end", valor: string) =>
    setLunchByDay((prev) => ({ ...prev, [dia]: { ...(prev[dia] || { start: "12:00", end: "13:00" }), [campo]: valor } }));

  const addFeriadoProprio = async (data: Date) => {
    const iso = format(data, "yyyy-MM-dd");
    const { error } = await (supabase.from("professional_holidays" as any) as any).insert({
      professional_id: professional.id, date: iso, name: "Não atendo",
    });
    // 23505 = a data já está na lista; não é erro para o usuário.
    if (error && (error as any).code !== "23505") {
      toast.error("Não foi possível adicionar", { description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["professional-holidays"] });
  };

  const removeFeriadoProprio = async (id: number) => {
    const { error } = await (supabase.from("professional_holidays" as any) as any).delete().eq("id", id);
    if (error) { toast.error("Não foi possível remover", { description: error.message }); return; }
    queryClient.invalidateQueries({ queryKey: ["professional-holidays"] });
  };

  const salvar = async () => {
    if (!professional) return;

    // Uma faixa invertida deixaria o dia sem horário nenhum, silenciosamente.
    const invertida = slots.find((s) => s.active && s.end_time <= s.start_time);
    if (invertida) {
      toast.error(`${DAYS[invertida.day_of_week]}: o fim precisa ser depois do início.`);
      return;
    }
    for (const [dia, l] of Object.entries(lunchByDay)) {
      if (l.end <= l.start) {
        toast.error(`${DAYS[Number(dia)]}: o almoço termina antes de começar.`);
        return;
      }
    }

    setSalvando(true);
    await supabase.from("availability").delete().eq("professional_id", professional.id);
    if (slots.length > 0) {
      const { error } = await supabase.from("availability").insert(
        slots.map((s) => ({
          professional_id: professional.id, day_of_week: s.day_of_week,
          start_time: s.start_time, end_time: s.end_time, active: s.active,
        })),
      );
      if (error) {
        toast.error("Erro ao salvar horários", { description: error.message });
        setSalvando(false);
        return;
      }
    }

    const { error: cfgError } = await supabase
      .from("professionals")
      .update({
        slot_buffer_minutes: bufferMin,
        lunch_breaks: lunchByDay,
        skip_national_holidays: skipNational,
      } as any)
      .eq("id", professional.id);
    if (cfgError) {
      toast.error("Erro ao salvar as configurações", { description: cfgError.message });
      setSalvando(false);
      return;
    }

    toast.success("Pronto! A agenda pública já respeita esses horários.");
    queryClient.invalidateQueries({ queryKey: ["agenda-availability"] });
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    queryClient.invalidateQueries({ queryKey: ["book-availability"] });
    queryClient.invalidateQueries({ queryKey: ["linked-availability"] });
    setSalvando(false);
    onSaved?.();
  };

  const hoje = format(new Date(), "yyyy-MM-dd");
  const proximosNacionais = nationalHolidaysBetween(hoje, `${new Date().getFullYear() + 1}-12-31`).slice(0, 4);
  const nenhumDiaLigado = !slots.some((s) => s.active);

  return (
    <div className="space-y-5">
      {/* Semana */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Sun className="h-3.5 w-3.5" /> Dias e horários
        </p>

        {nenhumDiaLigado && (
          <p className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            Com nenhum dia ligado, a agenda pública usa o horário padrão (07:00–20:00, todos os
            dias). Ligue os dias em que você atende para fechar o resto.
          </p>
        )}

        {DAYS.map((nome, dia) => {
          const doDia = slotsDoDia(dia);
          const atende = atendeNoDia(dia);
          return (
            <div key={dia} className={cn("rounded-lg border p-3", !atende && "bg-muted/40")}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <Switch checked={atende} onCheckedChange={(v) => toggleDia(dia, v)} />
                  <span className={cn("font-medium text-sm", !atende && "text-muted-foreground")}>{nome}</span>
                  {!atende && <Badge variant="secondary" className="text-xs">Não atendo</Badge>}
                </div>
                {atende && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => addFaixa(dia)}>
                    <Plus className="h-3 w-3 mr-1" /> Outra faixa
                  </Button>
                )}
              </div>

              {atende && (
                <div className="mt-2.5 space-y-2 pl-1">
                  {doDia.filter((s) => s.active).map((s) => (
                    <div key={s._i} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-muted-foreground w-14">Atendo</span>
                      <Input type="time" value={s.start_time}
                        onChange={(e) => updateFaixa(s._i, "start_time", e.target.value)}
                        className="w-28 h-8 text-xs" />
                      <span className="text-xs">até</span>
                      <Input type="time" value={s.end_time}
                        onChange={(e) => updateFaixa(s._i, "end_time", e.target.value)}
                        className="w-28 h-8 text-xs" />
                      {doDia.filter((x) => x.active).length > 1 && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeFaixa(s._i)}>
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  ))}

                  <div className="flex items-center gap-2 flex-wrap text-xs border-t pt-2">
                    <Coffee className="h-3.5 w-3.5 text-muted-foreground" />
                    <Switch checked={!!lunchByDay[dia]} onCheckedChange={(v) => toggleAlmoco(dia, v)} />
                    <span className="text-muted-foreground">Almoço</span>
                    {lunchByDay[dia] && (
                      <>
                        <Input type="time" value={lunchByDay[dia].start}
                          onChange={(e) => updateAlmoco(dia, "start", e.target.value)}
                          className="w-28 h-8 text-xs" />
                        <span>até</span>
                        <Input type="time" value={lunchByDay[dia].end}
                          onChange={(e) => updateAlmoco(dia, "end", e.target.value)}
                          className="w-28 h-8 text-xs" />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Feriados */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <PartyPopper className="h-3.5 w-3.5" /> Feriados
        </p>

        <div className="rounded-lg border p-3 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <Switch checked={skipNational} onCheckedChange={setSkipNational} />
            <span className="text-sm">Não atendo nos feriados nacionais</span>
          </div>
          {skipNational && proximosNacionais.length > 0 && (
            <p className="text-xs text-muted-foreground pl-11">
              Próximos:{" "}
              {proximosNacionais
                .map((h) => `${format(parseISO(h.date), "dd/MM")} ${h.name}`)
                .join(" · ")}
            </p>
          )}

          <div className="border-t pt-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm">Outras datas em que não atendo</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 text-xs">
                    <CalendarIcon className="h-3 w-3 mr-1" /> Adicionar data
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar mode="single" locale={ptBR} className="p-3 pointer-events-auto"
                    onSelect={(d) => d && addFeriadoProprio(d)} />
                </PopoverContent>
              </Popover>
            </div>
            {feriadosProprios.length === 0 ? (
              <p className="text-xs text-muted-foreground mt-1.5">
                Feriado municipal, recesso, viagem — o que for só seu.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {feriadosProprios.map((f) => (
                  <Badge key={f.id} variant="secondary" className="gap-1 pr-1">
                    {format(parseISO(f.date), "dd/MM/yyyy")}
                    <button type="button" onClick={() => removeFeriadoProprio(f.id)}
                      className="hover:text-destructive" aria-label={`Remover ${f.date}`}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Folga entre atendimentos */}
      <div className="rounded-lg border p-3">
        <Label className="text-sm">Intervalo entre atendimentos</Label>
        <p className="text-xs text-muted-foreground mb-2">
          Folga automática entre um atendimento e o próximo, todos os dias.
        </p>
        <div className="flex items-center gap-2">
          <Input type="number" min={0} step={5} value={bufferMin}
            onChange={(e) => setBufferMin(Math.max(0, Number(e.target.value) || 0))}
            className="w-20 h-9" />
          <span className="text-sm text-muted-foreground">minutos</span>
        </div>
      </div>

      <Button onClick={salvar} disabled={salvando} className="w-full">
        {salvando ? "Salvando..." : "Salvar"}
      </Button>
    </div>
  );
}
