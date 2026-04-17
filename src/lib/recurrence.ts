import { addDays, format, isBefore, isEqual } from "date-fns";

export type RecurrenceType = "unico" | "diario" | "semanal" | "quinzenal" | "selecionavel";

export function generateRecurrenceDates(
  startDate: Date,
  endDate: Date,
  type: RecurrenceType
): string[] {
  const dates: string[] = [];
  let current = new Date(startDate);

  if (type === "selecionavel") return [];
  if (type === "unico") return [format(startDate, "yyyy-MM-dd")];

  const increment = type === "diario" ? 1 : type === "semanal" ? 7 : 14;

  while (isBefore(current, endDate) || isEqual(current, endDate)) {
    dates.push(format(current, "yyyy-MM-dd"));
    current = addDays(current, increment);
  }

  return dates;
}
