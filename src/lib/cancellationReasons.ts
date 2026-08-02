// ANCORA-DOC: feature "agenda" — motivos de cancelamento.
//
// Os valores gravados em `appointment_cancellations.reason_category` vivem aqui,
// e só aqui. São chaves curtas em português, sem acento, para não dependerem do
// rótulo exibido: mudar o texto de um motivo não deve reclassificar o histórico.

export interface ReasonOption {
  value: string;
  label: string;
  /** Ajuda a distinguir motivos parecidos na hora de classificar. */
  hint: string;
  /** Cor do badge e da barra no resumo. */
  color: string;
}

export const CANCELLATION_REASONS: ReasonOption[] = [
  { value: "cliente_desmarcou", label: "Cliente desmarcou", hint: "Avisou antes e não remarcou", color: "#F97316" },
  { value: "remarcado",         label: "Remarcado",         hint: "Foi movido para outra data", color: "#3B82F6" },
  { value: "falta",             label: "Não compareceu",    hint: "Não avisou e não veio", color: "#EF4444" },
  { value: "saude",             label: "Saúde",             hint: "Doença, imprevisto médico", color: "#14B8A6" },
  { value: "financeiro",        label: "Financeiro",        hint: "Não conseguiu pagar no momento", color: "#EAB308" },
  { value: "profissional",      label: "Eu cancelei",       hint: "Imprevisto meu, agenda cheia, férias", color: "#A855F7" },
  { value: "engano",            label: "Engano",            hint: "Agendamento duplicado ou errado", color: "#64748B" },
  { value: "outro",             label: "Outro",             hint: "Não se encaixa nos anteriores", color: "#EC4899" },
];

const BY_VALUE = new Map(CANCELLATION_REASONS.map((r) => [r.value, r]));

export const reasonLabel = (value?: string | null): string =>
  (value && BY_VALUE.get(value)?.label) || "Sem motivo";

export const reasonColor = (value?: string | null): string =>
  (value && BY_VALUE.get(value)?.color) || "#94A3B8";

/** Quem encerrou o agendamento, como o trigger `log_appointment_cancellation` grava. */
export const CANCELLED_BY_LABELS: Record<string, string> = {
  professional: "Você",
  patient: "O cliente",
  system: "Automático / Axel",
};
