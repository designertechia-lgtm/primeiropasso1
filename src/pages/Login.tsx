import { useEffect, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Leaf, Eye, EyeOff } from "lucide-react";

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-2">
            <Leaf className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="font-heading text-2xl">Entrar</CardTitle>
          <CardDescription>Acesse sua conta no Primeiro Passo</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  autoComplete="current-password"
                  required
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
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading || pendingRedirect}>
              {loading || pendingRedirect ? "Entrando..." : "Entrar"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Não tem conta?{" "}
              <Link to={ref ? `/cadastro?ref=${ref}` : "/cadastro"} className="text-primary hover:underline font-medium">
                Cadastre-se
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
