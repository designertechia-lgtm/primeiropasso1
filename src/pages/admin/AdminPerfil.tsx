import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Phone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { FieldHint } from "@/components/ui/FieldHint";
import { formatPhone, toWhatsAppNumber } from "@/lib/utils";

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
  const [photoUrl, setPhotoUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [priceFirstSession, setPriceFirstSession] = useState("");
  const [promoPackages, setPromoPackages] = useState<Array<{ id: string; descricao: string; link: string }>>([]);
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
    setPhotoUrl(professional.photo_url || "");
    setLogoUrl(professional.logo_url || "");
    setPriceMin(professional.price_min?.toString() || "");
    setPriceMax(professional.price_max?.toString() || "");
    setPriceFirstSession(professional.price_first_session?.toString() || "");
    const rawPkgs = (professional as any).promo_packages;
    if (Array.isArray(rawPkgs)) {
      setPromoPackages(
        rawPkgs.map((p: any) => ({
          id: typeof p?.id === "string" ? p.id : crypto.randomUUID(),
          descricao: typeof p?.descricao === "string" ? p.descricao : "",
          link: typeof p?.link === "string" ? p.link : "",
        })),
      );
    } else {
      setPromoPackages([]);
    }
  }, [professional, profile]);

  const addPromoPackage = () =>
    setPromoPackages((prev) => [...prev, { id: crypto.randomUUID(), descricao: "", link: "" }]);
  const removePromoPackage = (id: string) =>
    setPromoPackages((prev) => prev.filter((p) => p.id !== id));
  const updatePromoPackage = (id: string, field: "descricao" | "link", value: string) =>
    setPromoPackages((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));

  const handleSave = async () => {
    if (!professional || !user) return;
    setSaving(true);

    const [profileRes, profRes] = await Promise.all([
      supabase.from("profiles").update({ full_name: fullName }).eq("user_id", user.id),
      supabase.from("professionals").update({
        full_name: fullName,
        slug: slug || null,
        crp,
        phone: phone ? toWhatsAppNumber(phone) : null,
        whatsapp: phone ? toWhatsAppNumber(phone) : null,
        email: email || null,
        address: address || null,
        photo_url: photoUrl || null,
        logo_url: logoUrl || null,
        price_min: priceMin ? parseFloat(priceMin) : null,
        price_max: priceMax ? parseFloat(priceMax) : null,
        price_first_session: priceFirstSession ? parseFloat(priceFirstSession) : null,
        promo_packages: promoPackages
          .map((p) => ({ id: p.id, descricao: p.descricao.trim(), link: p.link.trim() }))
          .filter((p) => p.descricao.length > 0),
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
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="phone"
                  placeholder="55 11 9 9999-9999"
                  className="pl-9"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={(e) => {
                    const formatted = formatPhone(e.target.value);
                    setPhone(formatted);
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Exibido formatado. Ao salvar, apenas números serão armazenados.</p>
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

          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <Label className="text-base">
                Pacotes Promocionais <FieldHint text="Crie pacotes opcionais que voce oferece. Ex: 'Pacote 4 sessoes por R$ 1.000'. O link e opcional — use se tiver checkout, formulario ou link direto do WhatsApp; se deixar em branco, o paciente combina com voce." />
              </Label>
              <Button type="button" variant="outline" size="sm" onClick={addPromoPackage}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar
              </Button>
            </div>

            {promoPackages.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum pacote cadastrado. Clique em "Adicionar" para criar.</p>
            )}

            {promoPackages.map((pkg, idx) => (
              <div key={pkg.id} className="space-y-2 p-3 rounded-md border border-border bg-muted/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Pacote {idx + 1}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removePromoPackage(pkg.id)}
                    className="h-7 px-2 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`pkg-desc-${pkg.id}`} className="text-sm">Descricao</Label>
                  <Textarea
                    id={`pkg-desc-${pkg.id}`}
                    placeholder="Ex: Pacote 4 sessoes por R$ 1.000 (economia de R$ 200 vs valor unitario)"
                    rows={2}
                    value={pkg.descricao}
                    onChange={(e) => updatePromoPackage(pkg.id, "descricao", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`pkg-link-${pkg.id}`} className="text-sm">Link (opcional)</Label>
                  <Input
                    id={`pkg-link-${pkg.id}`}
                    type="url"
                    placeholder="https://wa.me/... ou checkout/formulario"
                    value={pkg.link}
                    onChange={(e) => updatePromoPackage(pkg.id, "link", e.target.value)}
                  />
                </div>
              </div>
            ))}
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
