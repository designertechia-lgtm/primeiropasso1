import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Leaf,
  ArrowLeft,
  ShieldCheck,
  MessageCircle,
  CalendarClock,
  Megaphone,
  LayoutTemplate,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/**
 * Moldura das telas de autenticação (Login e Cadastro).
 *
 * O espaço que sobrava ao lado do formulário virou vitrine: as funcionalidades
 * reais da plataforma, com a mesma copy da landing institucional. Em telas
 * pequenas a vitrine dá lugar a um bloco compacto com chips, para a proposta de
 * valor não sumir no celular.
 */

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MessageCircle,
    title: "Agente no WhatsApp que agenda sozinho",
    text: "Conversa por texto, áudio ou imagem, busca horários reais na sua agenda e devolve o lead já marcado.",
  },
  {
    icon: CalendarClock,
    title: "Conteúdo criado e publicado no automático",
    text: "Um tema vira vídeo, carrossel, post, artigo e e-book — o calendário editorial publica nas redes conectadas.",
  },
  {
    icon: Megaphone,
    title: "Tráfego pago com criativos de IA",
    text: "A IA monta as campanhas e gera imagem e vídeo. O relatório vai do clique até o agendamento.",
  },
  {
    icon: LayoutTemplate,
    title: "Landing própria do profissional",
    text: "Sua página pública com a sua especialidade, o seu tom e os seus horários de atendimento.",
  },
  {
    icon: Sparkles,
    title: "Multi-IA, paga só o que usa",
    text: "Escolhe o motor ideal para cada vídeo, com créditos flexíveis via Pix.",
  },
];

const STATS = [
  { value: "5", label: "formatos por ideia" },
  { value: "4", label: "IAs especializadas" },
  { value: "12 min", label: "do tema ao vídeo" },
  { value: "24/7", label: "agente no WhatsApp" },
];

const CHIPS = ["24/7 no WhatsApp", "5 formatos por ideia", "Tráfego pago por IA"];

interface AuthShellProps {
  /** Manchete da vitrine (aceita marcação para o trecho em degradê). */
  headline: ReactNode;
  /** Parágrafo curto abaixo da manchete. */
  intro: string;
  /** Resumo da vitrine na versão compacta (celular). */
  mobileIntro: string;
  /** Título do cartão do formulário. */
  title: string;
  /** Linha de apoio do título. */
  subtitle: string;
  /** O formulário em si — campos e botão de envio. */
  children: ReactNode;
  /** Rodapé do cartão: o link para a outra tela de autenticação. */
  footer: ReactNode;
}

export default function AuthShell({
  headline,
  intro,
  mobileIntro,
  title,
  subtitle,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      {/* ============ VITRINE (só em telas grandes) ============ */}
      <aside className="relative hidden overflow-hidden bg-[#08201b] px-14 py-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* Gradiente base */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,#047857_0%,#04796a_28%,#0a5f74_58%,#0b3550_84%,#071f33_100%)]"
        />
        {/* Auréola esmeralda (topo-direita) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-[240px] -right-[170px] h-[660px] w-[660px] rounded-full bg-[radial-gradient(circle,rgba(52,211,153,.55),rgba(16,185,129,.22)_45%,transparent_70%)] pp-anim-glow"
        />
        {/* Auréola ciano (baixo-esquerda) */}
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-[280px] -left-[190px] h-[700px] w-[700px] rounded-full bg-[radial-gradient(circle,rgba(34,211,238,.42),rgba(14,165,233,.18)_48%,transparent_72%)] pp-anim-float"
        />
        {/* Brasa sálvia no miolo, para o degradê não ficar em duas metades */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-[38%] left-[42%] h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(167,243,208,.24),transparent_68%)] blur-[18px] pp-anim-glow"
          style={{ animationDelay: "2.5s" }}
        />
        {/* Malha de linhas finíssimas, para o degradê não ficar chapado */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[.16] [background-image:linear-gradient(rgba(255,255,255,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.13)_1px,transparent_1px)] [background-size:58px_58px] [mask-image:radial-gradient(ellipse_at_30%_25%,black,transparent_75%)]"
        />
        {/* Folha decorativa, como na landing */}
        <Leaf
          aria-hidden
          strokeWidth={1}
          className="pointer-events-none absolute -bottom-6 right-4 h-64 w-64 text-white opacity-[.06]"
        />

        {/* Marca */}
        <Link to="/" className="relative flex items-center gap-3 self-start">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(140deg,rgba(255,255,255,.28),rgba(255,255,255,.08))] shadow-[0_8px_24px_-8px_rgba(0,0,0,.6)] ring-1 ring-white/25">
            <Leaf aria-hidden strokeWidth={2} className="h-6 w-6" />
          </span>
          <span className="font-display text-[22px] font-semibold tracking-tight">
            Primeiro Passo
          </span>
        </Link>

        {/* Discurso + funcionalidades */}
        <div className="relative mt-10">
          <h2 className="max-w-[16ch] font-display text-[clamp(28px,2.7vw,40px)] font-bold leading-[1.1] tracking-[-0.02em]">
            {headline}
          </h2>
          <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.6] text-white/70">{intro}</p>

          <ul className="mt-8 space-y-4">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="mt-[2px] flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[linear-gradient(140deg,rgba(167,243,208,.42),rgba(34,211,238,.24)_60%,rgba(255,255,255,.06))] shadow-[0_10px_24px_-14px_rgba(52,211,153,.9)] ring-1 ring-white/20">
                  <f.icon aria-hidden strokeWidth={2} className="h-5 w-5 text-[#a7f3d0]" />
                </span>
                <div>
                  <div className="text-[15px] font-semibold leading-snug">{f.title}</div>
                  <div className="mt-0.5 max-w-[46ch] text-[13px] leading-[1.5] text-white/60">
                    {f.text}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Números */}
        <div className="relative mt-10 grid grid-cols-4 gap-4 border-t border-white/12 pt-6">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="font-display text-[24px] font-bold leading-none text-[#a7f3d0]">
                {s.value}
              </div>
              <div className="mt-1.5 text-[11.5px] leading-tight text-white/55">{s.label}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* ============ FORMULÁRIO ============ */}
      <main className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-background px-5 py-10 sm:px-10 lg:min-h-0">
        {/* Degradês de ambiente atrás do cartão */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(155deg,hsl(var(--secondary)/.22)_0%,transparent_38%,hsl(var(--primary)/.10)_72%,hsl(var(--primary)/.22)_100%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -top-44 right-[-130px] h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle,hsl(var(--primary)/.30),hsl(var(--secondary)/.12)_50%,transparent_72%)] pp-anim-glow"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-56 left-[-150px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,hsl(var(--secondary)/.34),hsl(var(--primary)/.10)_52%,transparent_74%)] pp-anim-float"
        />

        <div className="relative mx-auto w-full max-w-[440px]">
          <Link
            to="/"
            className="mb-6 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Voltar para o site
          </Link>

          {/* Marca + proposta em versão compacta (some no desktop, onde a vitrine assume) */}
          <div className="relative isolate mb-6 overflow-hidden rounded-[22px] bg-[linear-gradient(140deg,#047857,#068073_42%,#0a5f74_74%,#0b3550)] p-6 text-white shadow-[0_24px_56px_-24px_rgba(4,120,87,.85)] lg:hidden">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-24 -right-16 -z-10 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(52,211,153,.5),transparent_68%)]"
            />
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
                <Leaf aria-hidden strokeWidth={2} className="h-[18px] w-[18px]" />
              </span>
              <span className="font-display text-[18px] font-semibold">Primeiro Passo</span>
            </div>
            <p className="mt-3 text-[14px] leading-[1.55] text-white/75">{mobileIntro}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {CHIPS.map((chip) => (
                <span
                  key={chip}
                  className="rounded-full bg-white/12 px-3 py-1 text-[11.5px] font-medium text-white/85 ring-1 ring-white/15"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>

          {/* Cartão do formulário, com borda em degradê */}
          <div className="rounded-[26px] bg-[linear-gradient(140deg,hsl(var(--primary)/.85),hsl(var(--secondary)/.7)_42%,hsl(var(--primary)/.15)_78%,transparent)] p-[1.5px] shadow-[0_34px_80px_-38px_hsl(var(--primary)/.75)]">
            <div className="relative isolate overflow-hidden rounded-[24.5px] bg-card/95 px-7 py-8 backdrop-blur-xl sm:px-9">
              {/* Brilho de topo, para o cartão pegar a luz do degradê de fundo */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-40 bg-[linear-gradient(180deg,hsl(var(--secondary)/.16),transparent)]"
              />
              <h1 className="bg-[linear-gradient(100deg,hsl(var(--foreground)),hsl(var(--primary)))] bg-clip-text font-heading text-[27px] font-bold leading-tight tracking-[-0.02em] text-transparent">
                {title}
              </h1>
              <p className="mt-1.5 text-[14.5px] text-muted-foreground">{subtitle}</p>

              {children}

              <p className="mt-6 text-center text-[14px] text-muted-foreground">{footer}</p>
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-muted-foreground">
            <ShieldCheck aria-hidden className="h-4 w-4 shrink-0 text-primary" />
            Conexão criptografada — seus dados e os dos seus pacientes ficam protegidos.
          </p>
        </div>
      </main>
    </div>
  );
}
