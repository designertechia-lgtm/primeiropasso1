export interface ICalEvent {
  uid: string;
  summary: string;
  dtstart: Date;
  dtend: Date;
  allDay: boolean;
}

interface RRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  count?: number;
  until?: Date;
  interval: number;
  byday?: string[];
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

function parseRRule(value: string): RRule {
  const parts = value.split(";");
  const map: Record<string, string> = {};
  for (const part of parts) {
    const [k, v] = part.split("=");
    map[k] = v;
  }

  const freq = (map["FREQ"] ?? "DAILY") as RRule["freq"];
  const interval = parseInt(map["INTERVAL"] ?? "1", 10);
  const count = map["COUNT"] ? parseInt(map["COUNT"], 10) : undefined;
  const until = map["UNTIL"] ? parseICalDate(map["UNTIL"]).date : undefined;
  const byday = map["BYDAY"] ? map["BYDAY"].split(",") : undefined;

  return { freq, interval, count, until, byday };
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function addWeeks(date: Date, n: number): Date {
  return addDays(date, n * 7);
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function addYears(date: Date, n: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

const MAX_OCCURRENCES = 365;
// Expand no further than 1 year from today
const EXPAND_UNTIL = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

function expandRecurring(
  base: Omit<ICalEvent, "uid"> & { uid: string },
  rrule: RRule,
  duration: number,
): ICalEvent[] {
  const results: ICalEvent[] = [];
  let current = new Date(base.dtstart);
  let i = 0;

  while (true) {
    if (rrule.count !== undefined && i >= rrule.count) break;
    if (rrule.until && current > rrule.until) break;
    if (current > EXPAND_UNTIL) break;
    if (i >= MAX_OCCURRENCES) break;

    const dtend = new Date(current.getTime() + duration);
    results.push({
      uid: `${base.uid}_${i}`,
      summary: base.summary,
      dtstart: new Date(current),
      dtend,
      allDay: base.allDay,
    });

    i++;
    switch (rrule.freq) {
      case "DAILY":
        current = addDays(current, rrule.interval);
        break;
      case "WEEKLY":
        current = addWeeks(current, rrule.interval);
        break;
      case "MONTHLY":
        current = addMonths(current, rrule.interval);
        break;
      case "YEARLY":
        current = addYears(current, rrule.interval);
        break;
    }
  }

  return results;
}

export function parseIcal(text: string): ICalEvent[] {
  const events: ICalEvent[] = [];
  const normalized = text.replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  let current: Partial<ICalEvent & { rruleRaw?: string }> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
    } else if (line === "END:VEVENT") {
      if (current?.dtstart && current?.dtend) {
        const base: ICalEvent = {
          uid: current.uid ?? crypto.randomUUID(),
          summary: current.summary ?? "Evento",
          dtstart: current.dtstart,
          dtend: current.dtend,
          allDay: current.allDay ?? false,
        };

        if (current.rruleRaw) {
          const rrule = parseRRule(current.rruleRaw);
          const duration = base.dtend.getTime() - base.dtstart.getTime();
          events.push(...expandRecurring(base, rrule, duration));
        } else {
          events.push(base);
        }
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
      } else if (line.startsWith("RRULE:")) {
        current.rruleRaw = line.slice(6).trim();
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
