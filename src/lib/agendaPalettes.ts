// ANCORA-DOC: feature "agenda" — paletas prontas para as cores de status.
//
// A paleta original (Suave) usa tons médios do Tailwind 500. Eles ficam
// "lavados" no tema claro do projeto, que já é bem claro — e como o texto do
// evento é escolhido por contraste (readableTextColor), tom médio força texto
// escuro e o conjunto perde presença.
//
// As paletas fortes descem para 600/700: a cor fica mais densa e o texto volta
// a ser branco, que é o que dá o aspecto "cheio" que o Carlos pediu em 02/08.

export interface AgendaPalette {
  id: string;
  nome: string;
  descricao: string;
  cores: {
    pending: string;
    confirmed: string;
    completed: string;
    cancelled: string;
    paymentPending: string;
    paymentPaid: string;
  };
}

export const AGENDA_PALETTES: AgendaPalette[] = [
  {
    id: "suave",
    nome: "Suave",
    descricao: "A original — tons médios, visual mais leve",
    cores: {
      pending: "#3B82F6", confirmed: "#22C55E", completed: "#EAB308",
      cancelled: "#EF4444", paymentPending: "#F97316", paymentPaid: "#10B981",
    },
  },
  {
    id: "viva",
    nome: "Viva",
    descricao: "Mais densa, com texto branco por cima",
    cores: {
      pending: "#1D4ED8", confirmed: "#15803D", completed: "#B45309",
      cancelled: "#DC2626", paymentPending: "#C2410C", paymentPaid: "#047857",
    },
  },
  {
    id: "contraste",
    nome: "Alto contraste",
    descricao: "A mais forte — para tela clara ou vista cansada",
    cores: {
      pending: "#1E3A8A", confirmed: "#14532D", completed: "#854D0E",
      cancelled: "#991B1B", paymentPending: "#9A3412", paymentPaid: "#065F46",
    },
  },
  {
    id: "terra",
    nome: "Terrosa",
    descricao: "Fechada e quente, combina com o verde da marca",
    cores: {
      pending: "#3F6212", confirmed: "#166534", completed: "#92400E",
      cancelled: "#7F1D1D", paymentPending: "#9F1239", paymentPaid: "#115E59",
    },
  },
];

/** Qual paleta corresponde às cores atuais — para marcar a escolhida na tela. */
export function detectarPalette(cores: AgendaPalette["cores"]): string | null {
  const igual = (a: string, b: string) => (a || "").toLowerCase() === (b || "").toLowerCase();
  const achada = AGENDA_PALETTES.find((p) =>
    (Object.keys(p.cores) as Array<keyof AgendaPalette["cores"]>)
      .every((k) => igual(p.cores[k], cores[k])),
  );
  return achada?.id ?? null;
}
