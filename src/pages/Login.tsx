import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthShell from "@/components/auth/AuthShell";
import { toast } from "sonner";
import { Eye, EyeOff, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";

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

  return (
    <AuthShell
      headline={
        <>
          Sua agenda enche{" "}
          <span className="bg-[linear-gradient(100deg,#a7f3d0,#67e8f9)] bg-clip-text italic text-transparent">
            enquanto você atende
          </span>
          .
        </>
      }
      intro="Entre no painel e continue de onde parou — o Axel segue trabalhando no WhatsApp, o conteúdo continua saindo e as campanhas seguem rodando."
      mobileIntro="Agente no WhatsApp que agenda sozinho, conteúdo publicado no automático e tráfego pago com criativos de IA — num painel só."
      title="Bem-vindo de volta"
      subtitle="Entre para continuar no seu painel."
      footer={
        <>
          Não tem conta?{" "}
          <Link
            to={ref ? `/cadastro?ref=${ref}` : "/cadastro"}
            className="font-semibold text-primary hover:underline"
          >
            Cadastre-se grátis
          </Link>
        </>
      }
    >
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
    </AuthShell>
  );
}
