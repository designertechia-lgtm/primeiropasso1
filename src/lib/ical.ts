export interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  allDay: boolean;
}

function parseICalDate(value: string): { date: Date; allDay: boolean } {
  const clean = value.split(":").pop()!.trim();
  if (clean.length === 8) {
    return {
      date: new Date(`${clean.slice(0, 4)}-${clean.slice(4, 6)}-${clean.slice(6, 8)}`),
      allDay: true,
    };
  }
  const y = clean.slice(0, 4), mo = clean.slice(4, 6), d = clean.slice(6, 8);
  const h = clean.slice(9, 11), mi = clean.slice(11, 13), s = clean.slice(13, 15);
  const utc = clean.endsWith("Z");
  return {
    date: new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${utc ? "Z" : ""}`),
    allDay: false,
  };
}

export function parseIcal(text: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const normalized = text.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  let current: Partial<ICalEvent & { allDay: boolean }> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current?.dtstart && current?.dtend) {
        events.push({
          uid: current.uid ?? crypto.randomUUID(),
          summary: current.summary ?? "Evento",
          dtstart: current.dtstart,
          dtend: current.dtend,
          allDay: current.allDay ?? false,
        });
      }
      current = null;
    } else if (current) {
      if (line.startsWith("SUMMARY:")) {
        current.summary = line.slice(8).trim();
      } else if (line.startsWith("UID:")) {
        current.uid = line.slice(4).trim();
      } else if (line.match(/^DTSTART/)) {
        const parsed = parseICalDate(line);
        current.dtstart = parsed.date;
        current.allDay = parsed.allDay;
      } else if (line.match(/^DTEND/)) {
        current.dtend = parseICalDate(line).date;
      }
    }
  }

  return events;
}

export async function fetchIcal(icalUrl: string): Promise<ICalEvent[]> {
  const proxy = `https://corsproxy.io/?url=${encodeURIComponent(icalUrl)}`;
  const res = await fetch(proxy);
  if (!res.ok) throw new Error("Não foi possível buscar o calendário. Verifique se o link está correto e público.");
  const text = await res.text();
  return parseIcal(text);
}
