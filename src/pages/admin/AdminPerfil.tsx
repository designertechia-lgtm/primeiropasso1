import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";

export default function AdminPerfil() {
  const { user, profile } = useAuth();
  const { data: professional, isLoading } = useProfessional();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState("");
  const [slug, setSlug] = useState("");
  const [crp, setCrp] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [instagram, setInstagram] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [priceFirstSession, setPriceFirstSession] = useState("");
  const [category, setCategory]             = useState("psicologo");
  const [categoryCustom, setCategoryCustom] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!professional) return;
    setFullName(professional.full_name || profile?.full_name || "");
    // Migra categorias legadas (psicologia/odontologia/nutricao/etc) para "outro"
    // preservando o rótulo original no texto livre.
    const rawCat = (professional as any).category || "psicologo";
    const VALID = ["terapeuta", "psicologo", "psiquiatra", "outro"] as const;
    if (VALID.includes(rawCat as typeof VALID[number])) {
      setCategory(rawCat);
      setCategoryCustom((professional as any).category_custom || "");
    } else {
      setCategory("outro");
      const labels: Record<string, string> = {
        psicologia: "Psicologia clínica",
        plataforma_saas: "Plataforma digital / SaaS",
        odontologia: "Odontologia",
        nutricao: "Nutrição",
        medicina: "Medicina",
        educacao: "Educação / Coaching",
      };
      setCategoryCustom((professional as any).category_custom || labels[rawCat] || rawCat);
    }
    setSlug(professional.slug || "");
    setCrp(professional.crp || "");
    setPhone(professional.phone || (professional as any).whatsapp || "");
    setEmail(professional.email || profile?.email || "");
    setAddress(professional.address || "");
    setInstagram(professional.instagram || "");
    setLinkedin(professional.linkedin || "");
    setPhotoUrl(professional.photo_url || "");
    setLogoUrl(professional.logo_url || "");
    setPriceMin(professional.price_min?.toString() || "");
    setPriceMax(professional.price_max?.toString() || "");
    setPriceFirstSession(professional.price_first_session?.toString() || "");
  }, [professional, profile]);

  const handleSave = async () => {
    if (!professional || !user) return;
    setSaving(true);

    const [profileRes, profRes] = await Promise.all([
      supabase.from("profiles").update({ full_name: fullName }).eq("user_id", user.id),
      supabase.from("professionals").update({
        full_name: fullName,
        slug: slug || null,
        crp,
        phone: phone || null,
        whatsapp: phone || null,
        email: email || null,
        address: address || null,
        instagram: instagram || null,
        linkedin: linkedin || null,
        photo_url: photoUrl || null,
        logo_url: logoUrl || null,
        price_min: priceMin ? parseFloat(priceMin) : null,
        price_max: priceMax ? parseFloat(priceMax) : null,
        price_first_session: priceFirstSession ? parseFloat(priceFirstSession) : null,
        category,
        category_custom: category === "outro" ? (categoryCustom.trim() || null) : null,
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
        <CardHeader><CardTitle>Identidade Visual</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Foto de perfil <FieldHint text="Sua foto principal exibida na sua página pública e no painel." /></Label>
              <ImageUpload currentUrl={photoUrl || null} onUploaded={setPhotoUrl} folder="photos" variant="avatar" />
            </div>
            <div className="space-y-2">
              <Label>Logo / Favicon <FieldHint text="Logo da sua marca exibida na sua página e como ícone no navegador (favicon). Recomendado: PNG com fundo transparente, 200×200px." /></Label>
              <ImageUpload currentUrl={logoUrl || null} onUploaded={setLogoUrl} folder="logos" variant="avatar" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dados Pessoais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome completo</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug (URL personalizada) <FieldHint text="Endereço único da sua página. Ex: 'daia-silva' → primeiropasso.online/daia-silva. Use apenas letras minúsculas, números e hífens." /></Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">primeiropasso.online/</span>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="seu-nome" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="crp">Número do conselho / associação <FieldHint text="Ex: CRP 06/12345, CFP 01/00000, CRM 123456." /></Label>
            <Input id="crp" placeholder="Ex: CRP 06/12345 · CFP 01/00000" value={crp} onChange={(e) => setCrp(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Telefone / WhatsApp</Label>
              <Input id="phone" placeholder="Ex: 11 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail de contato</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Endereço do consultório</Label>
            <Input id="address" placeholder="Ex: Rua das Flores, 123 — São Paulo, SP" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Redes Sociais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instagram">Instagram <FieldHint text="Apenas o @ sem o link completo. Ex: @meuperfil" /></Label>
            <Input id="instagram" placeholder="@seuperfil" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="linkedin">LinkedIn <FieldHint text="URL do seu perfil LinkedIn." /></Label>
            <Input id="linkedin" placeholder="linkedin.com/in/seuperfil" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Valores da Consulta</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priceMin">Valor mínimo (R$) <FieldHint text="Menor valor cobrado por consulta." /></Label>
              <Input id="priceMin" type="number" min="0" step="0.01" placeholder="Ex: 150" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceMax">Valor máximo (R$)</Label>
              <Input id="priceMax" type="number" min="0" step="0.01" placeholder="Ex: 300" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="priceFirstSession">Primeira consulta — Promocional (R$) <FieldHint text="Valor especial para a primeira consulta." /></Label>
            <Input id="priceFirstSession" type="number" min="0" step="0.01" placeholder="Ex: 100" value={priceFirstSession} onChange={(e) => setPriceFirstSession(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Área de Atuação <FieldHint text="Define o vocabulário e o contexto visual dos vídeos gerados pela IA." /></CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category">Categoria profissional</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="terapeuta">Terapeuta</SelectItem>
                <SelectItem value="psicologo">Psicólogo</SelectItem>
                <SelectItem value="psiquiatra">Psiquiatra</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {category === "outro" && (
            <div className="space-y-2">
              <Label htmlFor="categoryCustom">
                Descreva sua área <FieldHint text="A IA usa esse texto para escolher o vocabulário e o tom certos. Ex: Nutricionista esportivo, Coach financeiro, Plataforma digital." />
              </Label>
              <Input
                id="categoryCustom"
                placeholder="Ex: Nutricionista esportivo · Coach financeiro · Plataforma digital"
                value={categoryCustom}
                onChange={(e) => setCategoryCustom(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? "Salvando..." : "Salvar Perfil"}
      </Button>
    </div>
  );
}
