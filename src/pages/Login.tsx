import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Leaf,
  Eye,
  EyeOff,
  Mail,
  Lock,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ShieldCheck,
  MessageCircle,
  Layers,
  LayoutTemplate,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

/** Funcionalidades reais da plataforma — espelham os pilares da landing institucional. */
const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: MessageCircle,
    title: "Agente no WhatsApp que agenda sozinho",
    text: "Conversa por texto, áudio ou imagem, busca horários reais na sua agenda e devolve o lead já marcado.",
  },
  {
    icon: Layers,
    title: "Uma ideia, cinco formatos",
    text: "O mesmo tema vira vídeo curto, carrossel, post, artigo e e-book — distribuídos na semana.",
  },
  {
    icon: LayoutTemplate,
    title: "Landing própria do consultório",
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

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, roles, isOwner, isLoading: authLoading } = useAuth();
  const from = (location.state as any)?.from?.pathname || "/";
  const searchParams = new URLSearchParams(location.search);
  const ref = searchParams.get("ref") || "";

  useEffect(() => {
    if (!pendingRedirect || authLoading || !user) return;
    console.log("[Login] redirect decision", { userId: user.id, roles, isOwner });
    const hasAdminAccess = isOwner || roles.includes("professional") || roles.includes("admin");
    if (hasAdminAccess) {
      navigate("/admin", { replace: true });
    } else if (roles.includes("patient")) {
      navigate("/minha-conta", { replace: true });
    } else {
      navigate(from, { replace: true });
    }
  }, [pendingRedirect, authLoading, user, roles, isOwner, navigate, from]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      const msg = error.message.toLowerCase().includes("invalid login")
        ? "E-mail ou senha incorretos"
        : error.message;
      toast.error("Erro ao entrar", { description: msg });
      return;
    }
    toast.success("Bem-vindo(a) de volta!");
    setPendingRedirect(true);
  };

  const busy = loading || pendingRedirect;
  const cadastroHref = ref ? `/cadastro?ref=${ref}` : "/cadastro";

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
        <div className="relative mt-12">
          <h2 className="max-w-[15ch] font-display text-[clamp(30px,3vw,42px)] font-bold leading-[1.1] tracking-[-0.02em]">
            Sua agenda enche{" "}
            <span className="bg-[linear-gradient(100deg,#a7f3d0,#67e8f9)] bg-clip-text italic text-transparent">
              enquanto você atende
            </span>
            .
          </h2>
          <p className="mt-4 max-w-[46ch] text-[15.5px] leading-[1.65] text-white/70">
            Entre no painel e continue de onde parou — o Axel segue trabalhando no
            WhatsApp e a central de conteúdo mantém você presente nas redes.
          </p>

          <ul className="mt-9 space-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="mt-[2px] flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[linear-gradient(140deg,rgba(167,243,208,.42),rgba(34,211,238,.24)_60%,rgba(255,255,255,.06))] shadow-[0_10px_24px_-14px_rgba(52,211,153,.9)] ring-1 ring-white/20">
                  <f.icon aria-hidden strokeWidth={2} className="h-[21px] w-[21px] text-[#a7f3d0]" />
                </span>
                <div>
                  <div className="text-[15.5px] font-semibold leading-snug">{f.title}</div>
                  <div className="mt-1 max-w-[44ch] text-[13.5px] leading-[1.55] text-white/60">
                    {f.text}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Números */}
        <div className="relative mt-12 grid grid-cols-4 gap-4 border-t border-white/12 pt-7">
          {STATS.map((s) => (
            <div key={s.label}>
              <div className="font-display text-[26px] font-bold leading-none text-[#a7f3d0]">
                {s.value}
              </div>
              <div className="mt-1.5 text-[11.5px] leading-tight text-white/55">{s.label}</div>
            </div>
          ))}
        </div>
      </aside>

      {/* ============ FORMULÁRIO ============ */}
      <main className="relative flex min-h-screen flex-col justify-center overflow-hidden bg-background px-5 py-10 sm:px-10 lg:min-h-0">
        {/* Degradês de ambiente atrás do card */}
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
            className="mb-7 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            Voltar para o site
          </Link>

          {/* Marca + funcionalidades em versão compacta (some no desktop, onde a vitrine assume) */}
          <div className="relative isolate mb-7 overflow-hidden rounded-[22px] bg-[linear-gradient(140deg,#047857,#068073_42%,#0a5f74_74%,#0b3550)] p-6 text-white shadow-[0_24px_56px_-24px_rgba(4,120,87,.85)] lg:hidden">
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
            <p className="mt-3 text-[14px] leading-[1.55] text-white/75">
              Agente no WhatsApp que agenda sozinho, conteúdo em cinco formatos e a
              landing do seu consultório — num painel só.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {["24/7 no WhatsApp", "5 formatos por ideia", "12 min do tema ao vídeo"].map((chip) => (
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
              <h1 className="relative bg-[linear-gradient(100deg,hsl(var(--foreground)),hsl(var(--primary)))] bg-clip-text font-heading text-[27px] font-bold leading-tight tracking-[-0.02em] text-transparent">
                Bem-vindo de volta
              </h1>
              <p className="mt-1.5 text-[14.5px] text-muted-foreground">
                Entre para continuar no seu painel.
              </p>

              <form onSubmit={handleLogin} className="mt-7 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-[13.5px] font-semibold">
                    E-mail
                  </Label>
                  <div className="relative">
                    <Mail
                      aria-hidden
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="email"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={busy}
                      autoComplete="email"
                      required
                      className="h-12 rounded-xl pl-11 text-[15px]"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[13.5px] font-semibold">
                    Senha
                  </Label>
                  <div className="relative">
                    <Lock
                      aria-hidden
                      className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={busy}
                      autoComplete="current-password"
                      required
                      className="h-12 rounded-xl pl-11 pr-11 text-[15px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                    </button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={busy}
                  className="group h-12 w-full rounded-xl bg-[linear-gradient(100deg,hsl(160_84%_28%),hsl(172_76%_31%)_52%,hsl(187_70%_36%))] text-[15.5px] font-semibold text-white shadow-[0_14px_30px_-12px_hsl(var(--primary)/.85)] transition-[filter,transform] hover:brightness-110 active:translate-y-[1px] disabled:opacity-70"
                >
                  {busy ? (
                    <>
                      <Loader2 aria-hidden className="mr-2 h-[18px] w-[18px] animate-spin" />
                      Entrando…
                    </>
                  ) : (
                    <>
                      Entrar
                      <ArrowRight
                        aria-hidden
                        className="ml-1.5 h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5"
                      />
                    </>
                  )}
                </Button>
              </form>

              <p className="mt-6 text-center text-[14px] text-muted-foreground">
                Não tem conta?{" "}
                <Link to={cadastroHref} className="font-semibold text-primary hover:underline">
                  Cadastre-se grátis
                </Link>
              </p>
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-[12.5px] text-muted-foreground">
            <ShieldCheck aria-hidden className="h-4 w-4 text-primary" />
            Conexão criptografada — seus dados e os dos seus pacientes ficam protegidos.
          </p>
        </div>
      </main>
    </div>
  );
}
