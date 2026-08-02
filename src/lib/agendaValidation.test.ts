import { describe, it, expect } from "vitest";
import { validateAgendaSlot, readableTextColor, type AgendaEntry } from "./agendaValidation";

// 2026-06-22 é uma segunda-feira (dia da semana 1).
const SEGUNDA = "2026-06-22";

const consulta = (over: Partial<AgendaEntry> = {}): AgendaEntry => ({
  id: "a1",
  appointment_date: SEGUNDA,
  start_time: "14:00:00",
  end_time: "15:00:00",
  status: "confirmed",
  appointment_type: "booking",
  ...over,
});

const base = {
  date: SEGUNDA,
  startTime: "14:00",
  endTime: "15:00",
  kind: "booking" as const,
  entries: [] as AgendaEntry[],
};

describe("validateAgendaSlot — coerência do intervalo", () => {
  it("recusa fim anterior ao início", () => {
    const r = validateAgendaSlot({ ...base, startTime: "15:00", endTime: "14:00" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/término/i);
  });

  it("recusa duração zero", () => {
    expect(validateAgendaSlot({ ...base, startTime: "14:00", endTime: "14:00" }).ok).toBe(false);
  });

  it("aceita um intervalo normal numa agenda vazia", () => {
    expect(validateAgendaSlot(base).ok).toBe(true);
  });
});

describe("validateAgendaSlot — almoço", () => {
  const lunchByDay = { 1: { start: "12:00", end: "13:00" } };

  it("recusa quem encosta no meio do almoço", () => {
    const r = validateAgendaSlot({ ...base, startTime: "12:30", endTime: "13:30", lunchByDay });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("almoço");
  });

  it("aceita quem termina exatamente quando o almoço começa", () => {
    expect(validateAgendaSlot({ ...base, startTime: "11:00", endTime: "12:00", lunchByDay }).ok).toBe(true);
  });

  it("aceita quem começa exatamente quando o almoço termina", () => {
    expect(validateAgendaSlot({ ...base, startTime: "13:00", endTime: "14:00", lunchByDay }).ok).toBe(true);
  });

  it("ignora o almoço de outro dia da semana", () => {
    // 2026-06-23 é terça; o almoço configurado é só de segunda.
    const r = validateAgendaSlot({ ...base, date: "2026-06-23", startTime: "12:30", endTime: "13:30", lunchByDay });
    expect(r.ok).toBe(true);
  });
});

describe("validateAgendaSlot — conflito", () => {
  it("recusa sobreposição parcial", () => {
    const r = validateAgendaSlot({ ...base, startTime: "14:30", endTime: "15:30", entries: [consulta()] });
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("22/06");
  });

  it("aceita encostar sem sobrepor quando não há folga configurada", () => {
    expect(validateAgendaSlot({ ...base, startTime: "15:00", endTime: "16:00", entries: [consulta()] }).ok).toBe(true);
  });

  it("aplica a folga dos dois lados do compromisso existente", () => {
    const depois = validateAgendaSlot({ ...base, startTime: "15:00", endTime: "16:00", entries: [consulta()], bufferMinutes: 15 });
    const antes = validateAgendaSlot({ ...base, startTime: "13:15", endTime: "14:00", entries: [consulta()], bufferMinutes: 15 });
    expect(depois.ok).toBe(false);
    expect(antes.ok).toBe(false);
    expect(depois.reason).toContain("folga");
    // 15 minutos de folga completos liberam.
    expect(validateAgendaSlot({ ...base, startTime: "15:15", endTime: "16:00", entries: [consulta()], bufferMinutes: 15 }).ok).toBe(true);
  });

  it("não conflita consigo mesmo ao editar ou arrastar", () => {
    const r = validateAgendaSlot({ ...base, startTime: "14:30", endTime: "15:30", entries: [consulta()], ignoreId: "a1" });
    expect(r.ok).toBe(true);
  });

  it("cancelado e concluído liberam o horário", () => {
    for (const status of ["cancelled", "completed"]) {
      const r = validateAgendaSlot({ ...base, entries: [consulta({ status })] });
      expect(r.ok, `status ${status} deveria liberar`).toBe(true);
    }
  });

  it("bloqueio pode cobrir outro bloqueio, mas não uma consulta", () => {
    const sobreBloqueio = validateAgendaSlot({
      ...base, kind: "block", entries: [consulta({ appointment_type: "block" })],
    });
    const sobreConsulta = validateAgendaSlot({ ...base, kind: "block", entries: [consulta()] });
    expect(sobreBloqueio.ok).toBe(true);
    expect(sobreConsulta.ok).toBe(false);
  });

  it("atendimento conflita também com bloqueio", () => {
    const r = validateAgendaSlot({ ...base, entries: [consulta({ appointment_type: "block" })] });
    expect(r.ok).toBe(false);
  });

  it("ignora compromisso de outro dia", () => {
    const r = validateAgendaSlot({ ...base, entries: [consulta({ appointment_date: "2026-06-23" })] });
    expect(r.ok).toBe(true);
  });

  it("evento de dia inteiro não disputa horário", () => {
    const r = validateAgendaSlot({ ...base, allDay: true, entries: [consulta()] });
    expect(r.ok).toBe(true);
  });
});

describe("readableTextColor — contraste dos eventos", () => {
  // As quatro cores PADRÃO de status são de tom médio: NENHUMA delas alcança os
  // 4.5:1 exigidos com texto branco (o verde de "Confirmado" dá 2.28:1, o
  // amarelo de "Concluído" dá 1.92:1). Todas ficam legíveis com texto escuro.
  // Ou seja: com a paleta padrão, o texto dos eventos passa a ser escuro — é o
  // resultado esperado, não um defeito. Não troque por "#fff" fixo de novo.
  it.each([
    ["#3B82F6", "Pendente"],
    ["#22C55E", "Confirmado"],
    ["#EAB308", "Concluído"],
    ["#EF4444", "Cancelado"],
  ])("usa texto escuro sobre %s (%s)", (hex) => {
    expect(readableTextColor(hex)).toBe("#111827");
  });

  it("usa texto claro sobre cores realmente escuras", () => {
    expect(readableTextColor("#1E3A8A")).toBe("#fff"); // azul-marinho
    expect(readableTextColor("#111111")).toBe("#fff");
  });

  it("aceita hex de 3 dígitos e cai no branco com entrada inválida", () => {
    expect(readableTextColor("#fff")).toBe("#111827");
    expect(readableTextColor(null)).toBe("#fff");
    expect(readableTextColor("nao-e-cor")).toBe("#fff");
  });
});
