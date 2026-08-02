import { describe, it, expect } from "vitest";
import { getFreeSlots } from "./slots";

// Segunda-feira fixa (2026-06-22 é segunda). Hora 00:00 → nada cai no passado.
const segunda = new Date(2026, 5, 22, 0, 0, 0);
const avail = [{ day_of_week: 1, start_time: "08:00", end_time: "18:00" }];

describe("getFreeSlots — buffer + almoço (pedido da Daiane)", () => {
  it("aplica passo = duração + buffer e subtrai o almoço", () => {
    const slots = getFreeSlots({
      date: segunda,
      durationMinutes: 50,
      availability: avail,
      appointments: [],
      bufferMinutes: 15,
      lunch: { enabled: true, start: "11:30", end: "13:15" },
      now: segunda,
    });
    // passo 65; manhã 08:00-11:30 e tarde 13:15-18:00; nada dentro do almoço.
    expect(slots).toEqual(["08:00", "09:05", "10:10", "13:15", "14:20", "15:25", "16:30"]);
  });

  it("sem almoço e sem buffer = passo igual à duração", () => {
    const slots = getFreeSlots({
      date: segunda,
      durationMinutes: 60,
      availability: avail,
      appointments: [],
      bufferMinutes: 0,
      lunch: null,
      now: segunda,
    });
    expect(slots).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"]);
  });

  it("respeita a folga (buffer) dos dois lados de um atendimento existente", () => {
    const slots = getFreeSlots({
      date: segunda,
      durationMinutes: 50,
      availability: avail,
      appointments: [{ start_time: "09:05", end_time: "09:55" }],
      bufferMinutes: 15,
      lunch: { enabled: true, start: "11:30", end: "13:15" },
      now: segunda,
    });
    // 09:05 ocupado; 08:00 ok (termina 08:50, +15 < 09:05); 10:10 ok (09:55+15=10:10).
    expect(slots).not.toContain("09:05");
    expect(slots).toContain("08:00");
    expect(slots).toContain("10:10");
  });

  it("não oferece nada dentro do intervalo de almoço", () => {
    const slots = getFreeSlots({
      date: segunda,
      durationMinutes: 50,
      availability: avail,
      appointments: [],
      bufferMinutes: 15,
      lunch: { enabled: true, start: "11:30", end: "13:15" },
      now: segunda,
    });
    const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
    for (const s of slots) {
      // nenhum slot pode começar dentro do almoço nem invadir o início do almoço
      expect(toMin(s) >= 690 && toMin(s) < 795).toBe(false);
      expect(toMin(s) < 690 && toMin(s) + 50 > 690).toBe(false);
    }
  });
});

// ── Dia fechado × profissional que nunca configurou ─────────────────────────
// Distinção que faltava: sem ela, desligar o domingo fazia a agenda pública
// OFERECER domingo das 7h às 20h (caía no defaultRange). O fechado virava aberto.
describe("getFreeSlots — dia sem janela cadastrada", () => {
  const domingo = new Date(2026, 5, 21, 0, 0, 0); // 21/06/2026 é domingo

  it("quem configurou a agenda tem o dia fechado de verdade", () => {
    const slots = getFreeSlots({
      date: domingo,
      durationMinutes: 60,
      availability: avail, // só segunda-feira
      appointments: [],
      now: domingo,
    });
    expect(slots).toEqual([]);
  });

  it("quem nunca configurou nada continua com a janela padrão", () => {
    const slots = getFreeSlots({
      date: domingo,
      durationMinutes: 60,
      availability: [],
      appointments: [],
      now: domingo,
    });
    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0]).toBe("07:00");
  });

  it("sábado até 12:00 não oferece horário depois do meio-dia", () => {
    const sabado = new Date(2026, 5, 20, 0, 0, 0); // 20/06/2026 é sábado
    const slots = getFreeSlots({
      date: sabado,
      durationMinutes: 60,
      availability: [...avail, { day_of_week: 6, start_time: "08:00", end_time: "12:00" }],
      appointments: [],
      now: sabado,
    });
    expect(slots).toEqual(["08:00", "09:00", "10:00", "11:00"]);
  });

  it("feriado fecha o dia mesmo com janela cadastrada", () => {
    const slots = getFreeSlots({
      date: segunda,
      durationMinutes: 60,
      availability: avail,
      appointments: [],
      isHoliday: true,
      now: segunda,
    });
    expect(slots).toEqual([]);
  });
});
