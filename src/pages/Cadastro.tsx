import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Leaf, Eye, EyeOff } from "lucide-react";
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
    navigate("/admin", { replace: true });
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Leaf className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="font-serif text-2xl">Criar Conta</CardTitle>
          <CardDescription>Junte-se ao Primeiro Passo</CardDescription>
        </CardHeader>
        <form onSubmit={handleSignUp}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome completo</Label>
              <Input
                id="fullName"
                placeholder="Seu nome"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">WhatsApp</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="48 9 9999-9999 (com DDD)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={(e) => setPhone(formatPhone(e.target.value))}
                disabled={loading}
                autoComplete="tel"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="new-password"
                  required
                  minLength={6}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug da sua página</Label>
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <span>primeiropasso.com/</span>
                <Input
                  id="slug"
                  placeholder="seu-nome"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={loading}
                  className="flex-1"
                  required
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading || pendingRedirect}>
              {loading || pendingRedirect ? "Criando conta..." : "Cadastrar"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link to={refSlug ? `/login?ref=${refSlug}` : "/login"} className="text-primary hover:underline font-medium">
                Entrar
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
