import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { X } from "lucide-react";
import ImageUpload from "@/components/dashboard/ImageUpload";

export default function AdminPerfil() {
  const { user, profile } = useAuth();
  const { data: professional, isLoading } = useProfessional();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [crp, setCrp] = useState("");
  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [approaches, setApproaches] = useState<string[]>([]);
  const [newApproach, setNewApproach] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [aboutImageUrl, setAboutImageUrl] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [priceFirstSession, setPriceFirstSession] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (professional) {
      setFullName((professional as any).full_name || profile?.full_name || "");
      setBio(professional.bio || "");
      setCrp(professional.crp || "");
      setHeroTitle(professional.hero_title || "");
      setHeroSubtitle(professional.hero_subtitle || "");
      setApproaches(professional.approaches || []);
      setPhotoUrl(professional.photo_url || "");
      setHeroImageUrl((professional as any).hero_image_url || "");
      setAboutImageUrl((professional as any).about_image_url || "");
      setPriceMin((professional as any).price_min?.toString() || "");
      setPriceMax((professional as any).price_max?.toString() || "");
      setPriceFirstSession((professional as any).price_first_session?.toString() || "");
    }
  }, [profile, professional]);

  const addApproach = () => {
    const trimmed = newApproach.trim();
    if (trimmed && !approaches.includes(trimmed)) {
      setApproaches([...approaches, trimmed]);
      setNewApproach("");
    }
  };

  const removeApproach = (a: string) => {
    setApproaches(approaches.filter((x) => x !== a));
  };

  const handleSave = async () => {
    if (!professional || !user) return;
    setSaving(true);

    const [profileRes, profRes] = await Promise.all([
      supabase.from("profiles").update({ full_name: fullName }).eq("user_id", user.id),
      supabase.from("professionals").update({
        full_name: fullName,
        bio,
        crp,
        hero_title: heroTitle,
        hero_subtitle: heroSubtitle,
        approaches,
        photo_url: photoUrl,
        hero_image_url: heroImageUrl || null,
        about_image_url: aboutImageUrl || null,
        price_min: priceMin ? parseFloat(priceMin) : null,
        price_max: priceMax ? parseFloat(priceMax) : null,
        price_first_session: priceFirstSession ? parseFloat(priceFirstSession) : null,
      } as any).eq("id", professional.id),
    ]);

    setSaving(false);

    if (profileRes.error || profRes.error) {
      toast.error("Erro ao salvar");
    } else {
      toast.success("Perfil atualizado!");
      queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Meu Perfil</h1>

      <Card>
        <CardHeader>
          <CardTitle>Dados Pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Foto de perfil</Label>
            <ImageUpload
              currentUrl={photoUrl || null}
              onUploaded={(url) => setPhotoUrl(url)}
              folder="photos"
              variant="avatar"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome completo</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="crp">CRP</Label>
            <Input id="crp" placeholder="CRP 00/00000" value={crp} onChange={(e) => setCrp(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Biografia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bio">Sobre mim</Label>
            <Textarea id="bio" rows={5} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Conte sobre sua formação e experiência..." />
          </div>
          <div className="space-y-2">
            <Label>Imagem da seção Sobre</Label>
            <p className="text-xs text-muted-foreground">Imagem exibida na seção "Sobre" da sua página. Se não definida, usa a foto de perfil.</p>
            <ImageUpload
              currentUrl={aboutImageUrl || null}
              onUploaded={(url) => setAboutImageUrl(url)}
              folder="about"
              variant="logo"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abordagens Terapêuticas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {approaches.map((a) => (
              <Badge key={a} variant="secondary" className="gap-1">
                {a}
                <button onClick={() => removeApproach(a)} className="ml-1 hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Ex: TCC, Psicanálise..."
              value={newApproach}
              onChange={(e) => setNewApproach(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addApproach())}
            />
            <Button type="button" variant="outline" onClick={addApproach}>Adicionar</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Valores da Consulta</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priceMin">Valor mínimo (R$)</Label>
              <Input id="priceMin" type="number" min="0" step="0.01" placeholder="Ex: 150" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceMax">Valor máximo (R$)</Label>
              <Input id="priceMax" type="number" min="0" step="0.01" placeholder="Ex: 300" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="priceFirstSession">Valor primeira consulta - Promocional (R$)</Label>
            <Input id="priceFirstSession" type="number" min="0" step="0.01" placeholder="Ex: 100" value={priceFirstSession} onChange={(e) => setPriceFirstSession(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">Faixa de valores e promoção exibidos na sua página profissional.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Página Inicial (Hero)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Imagem do Hero</Label>
            <p className="text-xs text-muted-foreground">Imagem exibida no topo da sua página. Se não definida, usa a foto de perfil.</p>
            <ImageUpload
              currentUrl={heroImageUrl || null}
              onUploaded={(url) => setHeroImageUrl(url)}
              folder="hero"
              variant="logo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="heroTitle">Título principal</Label>
            <Input id="heroTitle" value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="heroSubtitle">Subtítulo</Label>
            <Input id="heroSubtitle" value={heroSubtitle} onChange={(e) => setHeroSubtitle(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? "Salvando..." : "Salvar Perfil"}
      </Button>
    </div>
  );
}
