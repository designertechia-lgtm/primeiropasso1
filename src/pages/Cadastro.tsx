import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthShell from "@/components/auth/AuthShell";
import { toast } from "sonner";
import { Eye, EyeOff, User, Phone, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { formatPhone, toWhatsAppNumber } from "@/lib/utils";

export default function Cadastro() {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, roles, isLoading: authLoading } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const refSlug = searchParams.get("ref") || "";
  const prefilledEmail = searchParams.get("email") || "";

  useEffect(() => {
    if (prefilledEmail) setEmail(prefilledEmail);
  }, [prefilledEmail]);

  useEffect(() => {
    if (!pendingRedirect || authLoading || !user) return;
    // Recém-cadastrado vai para o onboarding guiado (coleta o contexto do DNA e do Axel).
    // Login normal (Login.tsx) continua indo direto ao /admin — este redirect é só do signup.
    navigate("/bem-vindo", { replace: true });
  }, [pendingRedirect, authLoading, user, roles, navigate]);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedSlug = slug
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

    if (!normalizedSlug) {
      toast.error("Informe um slug válido para sua página profissional");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone: toWhatsAppNumber(phone), role: "professional", slug: normalizedSlug, ref_slug: refSlug || undefined },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setLoading(false);
      const lower = error.message.toLowerCase();
      const msg = lower.includes("already registered") || lower.includes("user already")
        ? "Este e-mail já está cadastrado. Faça login."
        : error.message;
      toast.error("Erro ao cadastrar", { description: msg });
      return;
    }

    if (!data.session) {
      setLoading(false);
      toast.success("Conta criada!", { description: "Faça login para continuar." });
      navigate("/login", { replace: true });
      return;
    }

    toast.success("Conta criada com sucesso!");
    setPendingRedirect(true);
  };

  const busy = loading || pendingRedirect;

  return (
    <AuthShell
      headline={
        <>
          Sua presença digital pronta{" "}
          <span className="bg-[linear-gradient(100deg,#a7f3d0,#67e8f9)] bg-clip-text italic text-transparent">
            em uma tarde
          </span>
          .
        </>
      }
      intro="Crie a conta grátis: em seguida um assistente monta o seu perfil, a sua landing e o tom do seu conteúdo — e o agente já pode assumir o WhatsApp."
      mobileIntro="Agente no WhatsApp que agenda sozinho, conteúdo publicado no automático e tráfego pago com criativos de IA — num painel só."
      title="Criar conta grátis"
      subtitle="Leva menos de dois minutos para começar."
      footer={
        <>
          Já tem conta?{" "}
          <Link
            to={refSlug ? `/login?ref=${refSlug}` : "/login"}
            className="font-semibold text-primary hover:underline"
          >
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSignUp} className="mt-7 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-[13.5px] font-semibold">
            Nome completo
          </Label>
          <div className="relative">
            <User
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="fullName"
              placeholder="Seu nome"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={busy}
              autoComplete="name"
              required
              className="h-12 rounded-xl pl-11 text-[15px]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" className="text-[13.5px] font-semibold">
            WhatsApp
          </Label>
          <div className="relative">
            <Phone
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="phone"
              type="tel"
              placeholder="48 9 9999-9999 (com DDD)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={(e) => setPhone(formatPhone(e.target.value))}
              disabled={busy}
              autoComplete="tel"
              required
              className="h-12 rounded-xl pl-11 text-[15px]"
            />
          </div>
        </div>

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
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              autoComplete="new-password"
              required
              minLength={6}
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

        <div className="space-y-2">
          <Label htmlFor="slug" className="text-[13.5px] font-semibold">
            Endereço da sua página
          </Label>
          <div className="flex h-12 items-center overflow-hidden rounded-xl border border-input bg-background text-[15px] ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <span className="flex h-full shrink-0 items-center border-r border-input bg-muted/60 px-3 text-[13.5px] text-muted-foreground sm:text-[14px]">
              primeiropasso.online/
            </span>
            <input
              id="slug"
              placeholder="seu-nome"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              disabled={busy}
              required
              className="h-full min-w-0 flex-1 bg-transparent px-3 font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
          <p className="text-[12.5px] text-muted-foreground">
            É o link que você manda para o paciente. Dá para trocar depois no painel.
          </p>
        </div>

        <Button
          type="submit"
          disabled={busy}
          className="group h-12 w-full rounded-xl bg-[linear-gradient(100deg,hsl(160_84%_28%),hsl(172_76%_31%)_52%,hsl(187_70%_36%))] text-[15.5px] font-semibold text-white shadow-[0_14px_30px_-12px_hsl(var(--primary)/.85)] transition-[filter,transform] hover:brightness-110 active:translate-y-[1px] disabled:opacity-70"
        >
          {busy ? (
            <>
              <Loader2 aria-hidden className="mr-2 h-[18px] w-[18px] animate-spin" />
              Criando conta…
            </>
          ) : (
            <>
              Criar minha conta
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
