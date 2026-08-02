// ANCORA-DOC: feature "agenda" — feriados de um profissional, prontos para consulta.
//
// Junta as duas fontes: os feriados NACIONAIS (calculados em lib/holidays.ts,
// ligados/desligados por `professionals.skip_national_holidays`) e as datas
// próprias da tabela `professional_holidays`.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildHolidayMap, type CustomHoliday } from "@/lib/holidays";

export interface ProfessionalHolidayRow {
  id: number;
  date: string;
  name: string;
}

/**
 * @param professionalId dono da agenda
 * @param skipNational  `professionals.skip_national_holidays` (default: true)
 * @param janela        período consultado; por padrão cobre o ano anterior e o próximo
 */
export function useProfessionalHolidays(
  professionalId: string | undefined,
  skipNational: boolean | undefined,
  janela?: { inicio: string; fim: string },
) {
  const { data: custom = [], isLoading } = useQuery({
    queryKey: ["professional-holidays", professionalId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("professional_holidays" as any) as any)
        .select("id, date, name")
        .eq("professional_id", professionalId)
        .order("date");
      if (error) throw error;
      return (data ?? []) as ProfessionalHolidayRow[];
    },
    enabled: !!professionalId,
  });

  const inicio = janela?.inicio ?? `${new Date().getFullYear() - 1}-01-01`;
  const fim = janela?.fim ?? `${new Date().getFullYear() + 1}-12-31`;

  const mapa = useMemo(
    () => buildHolidayMap({
      inicio,
      fim,
      // O default do banco é true; `undefined` aqui é "ainda carregando".
      nacionais: skipNational !== false,
      custom: custom as CustomHoliday[],
    }),
    [inicio, fim, skipNational, custom],
  );

  return {
    /** Datas próprias, para a tela de gerenciamento. */
    custom,
    isLoading,
    /** Nome do feriado, ou undefined se o dia é normal. */
    holidayName: (date: string) => mapa.get(date),
    isHoliday: (date: string) => mapa.has(date),
    mapa,
  };
}
