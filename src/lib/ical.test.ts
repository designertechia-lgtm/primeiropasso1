import { describe, it, expect } from "vitest";
import { normalizeIcalUrl, parseIcal } from "./ical";

describe("normalizeIcalUrl", () => {
  it("converte link de embed do Google para o endereço iCal público", () => {
    expect(
      normalizeIcalUrl("https://calendar.google.com/calendar/embed?src=daiane.naturologia%40gmail.com&ctz=America%2FSao_Paulo"),
    ).toBe("https://calendar.google.com/calendar/ical/daiane.naturologia%40gmail.com/public/basic.ics");
  });

  it("converte link de embed legado (www.google.com)", () => {
    expect(
      normalizeIcalUrl("https://www.google.com/calendar/embed?src=fulana@gmail.com"),
    ).toBe("https://calendar.google.com/calendar/ical/fulana%40gmail.com/public/basic.ics");
  });

  it("mantém o endereço iCal como está (só tira espaços)", () => {
    const ics = "https://calendar.google.com/calendar/ical/fulana%40gmail.com/public/basic.ics";
    expect(normalizeIcalUrl(`  ${ics} `)).toBe(ics);
  });

  it("mantém texto que não é URL (a edge rejeita depois)", () => {
    expect(normalizeIcalUrl("não é um link")).toBe("não é um link");
  });

  it("mantém embed sem src (não dá para derivar o iCal)", () => {
    const semSrc = "https://calendar.google.com/calendar/embed?ctz=America%2FSao_Paulo";
    expect(normalizeIcalUrl(semSrc)).toBe(semSrc);
  });
});

describe("parseIcal", () => {
  it("extrai evento simples com data e hora", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:abc123",
      "SUMMARY:Consulta",
      "DTSTART:20260720T140000Z",
      "DTEND:20260720T150000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseIcal(ics);
    expect(events).toHaveLength(1);
    expect(events[0].summary).toBe("Consulta");
    expect(events[0].allDay).toBe(false);
    expect(events[0].dtstart.toISOString()).toBe("2026-07-20T14:00:00.000Z");
  });

  it("devolve lista vazia para HTML que não é calendário", () => {
    expect(parseIcal("<html><body>não sou um ics</body></html>")).toHaveLength(0);
  });

  it("extrai a descrição do evento, com unescape de \\n, \\, e \\;", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:abc123",
      "SUMMARY:Consulta Maria",
      "DESCRIPTION:Cliente: Maria\\nTelefone: 11 99999-0000\\, retorno\\; confirmar",
      "DTSTART:20260720T140000Z",
      "DTEND:20260720T150000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const events = parseIcal(ics);
    expect(events).toHaveLength(1);
    expect(events[0].description).toBe("Cliente: Maria\nTelefone: 11 99999-0000, retorno; confirmar");
  });

  it("evento sem DESCRIPTION fica com description undefined", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:abc123",
      "SUMMARY:Consulta",
      "DTSTART:20260720T140000Z",
      "DTEND:20260720T150000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcal(ics)[0].description).toBeUndefined();
  });
});
