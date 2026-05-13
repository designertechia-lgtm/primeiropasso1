import {
  Calendar,
  Kanban,
  BookOpen,
  Share2,
  BarChart3,
  Reply,
  CreditCard,
  Lock,
  FileText,
  Sparkles,
} from "lucide-react";

const FEATURES = [
  {
    icon: Calendar,
    title: "Calendário editorial",
    body: "Programa publicações por semana e mês. Vinculado à sua agenda real.",
  },
  {
    icon: Kanban,
    title: "CRM Kanban inteligente",
    body: "6 estágios: Novo, Em Conversa, Proposta, Agendado, Cliente, Inativo.",
  },
  {
    icon: BookOpen,
    title: "Biblioteca de ideias virais",
    body: "200+ tópicos curados por especialidade. Atualizada semanalmente.",
  },
  {
    icon: Share2,
    title: "Publicação multi-rede",
    body: "YouTube, TikTok, Instagram, LinkedIn — agendado automaticamente.",
  },
  {
    icon: BarChart3,
    title: "Analytics + sugestões",
    body: "Detecta posts virais e sugere próximas variações de ângulo.",
  },
  {
    icon: Reply,
    title: "Resposta a DMs e comentários",
    body: "Agente responde no seu tom. Escalona casos sensíveis para você.",
  },
  {
    icon: FileText,
    title: "RAG personalizado",
    body: "Suba seus PDFs e artigos. O agente fala como você fala.",
  },
  {
    icon: Sparkles,
    title: "Editor de roteiro fino",
    body: "Markup de ênfase, palavras-chave em destaque, B-roll por trecho.",
  },
  {
    icon: CreditCard,
    title: "Pagamento via Pix",
    body: "Mensal ou créditos avulsos. Mercado Pago integrado.",
  },
  {
    icon: Lock,
    title: "LGPD + CFP",
    body: "Dados criptografados, vault de credenciais, audit log.",
  },
];

export default function PlatformFeatureGrid() {
  return (
    <section className="py-20 md:py-28 bg-gradient-to-b from-muted/30 to-background">
      <div className="container mx-auto max-w-6xl px-4">
        <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
          <p className="text-sm uppercase tracking-[0.18em] text-accent font-semibold mb-3">
            Tudo no painel
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight tracking-tight">
            Mais que vídeo.{" "}
            <span className="text-primary">Operação completa do consultório.</span>
          </h2>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-5">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-sm transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <Icon className="h-4 w-4 text-primary" aria-hidden />
              </div>
              <h3 className="font-serif text-base font-semibold text-foreground mb-1.5 leading-tight">
                {title}
              </h3>
              <p className="text-sm text-foreground/65 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
