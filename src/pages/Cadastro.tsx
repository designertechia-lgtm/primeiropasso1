import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Leaf } from "lucide-react";

export default function Cadastro() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"patient" | "professional">("patient");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role === "professional" && !slug.trim()) {
      toast.error("Informe um slug para sua página profissional");
      return;
    }
    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setLoading(false);
      toast.error("Erro ao cadastrar", { description: error.message });
      return;
    }

    const userId = data.user?.id;
    if (!userId) {
      setLoading(false);
      toast.error("Erro inesperado ao criar conta");
      return;
    }

    // Insert role
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({ user_id: userId, role });

    if (roleError) {
      console.error("Role insert error:", roleError);
    }

    // If professional, create professional profile
    if (role === "professional") {
      const normalizedSlug = slug
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");

      const { error: profError } = await supabase
        .from("professionals")
        .insert({ user_id: userId, slug: normalizedSlug });

      if (profError) {
        toast.error("Erro ao criar perfil profissional", { description: profError.message });
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    toast.success("Conta criada com sucesso!", {
      description: "Verifique seu e-mail para confirmar o cadastro.",
    });
    navigate("/login");
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
              <Input id="fullName" placeholder="Seu nome" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>

            <div className="space-y-3">
              <Label>Tipo de conta</Label>
              <RadioGroup value={role} onValueChange={(v) => setRole(v as "patient" | "professional")} className="flex gap-4">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="patient" id="patient" />
                  <Label htmlFor="patient" className="cursor-pointer">Paciente</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="professional" id="professional" />
                  <Label htmlFor="professional" className="cursor-pointer">Profissional</Label>
                </div>
              </RadioGroup>
            </div>

            {role === "professional" && (
              <div className="space-y-2">
                <Label htmlFor="slug">Slug da sua página</Label>
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <span>primeiropasso.com/</span>
                  <Input
                    id="slug"
                    placeholder="seu-nome"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="flex-1"
                    required
                  />
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Criando conta..." : "Cadastrar"}
            </Button>
            <p className="text-sm text-muted-foreground">
              Já tem conta?{" "}
              <Link to="/login" className="text-primary hover:underline font-medium">
                Entrar
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
