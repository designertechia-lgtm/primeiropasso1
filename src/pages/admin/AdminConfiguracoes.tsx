import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import ImageUpload from "@/components/dashboard/ImageUpload";

export default function AdminConfiguracoes() {
  const { data: professional, isLoading } = useProfessional();
  const queryClient = useQueryClient();

  const [slug, setSlug] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [secondaryColor, setSecondaryColor] = useState("");
  const [backgroundColor, setBackgroundColor] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (professional) {
      setSlug(professional.slug || "");
      setWhatsapp(professional.whatsapp || "");
      setLogoUrl(professional.logo_url || "");
      setPhotoUrl(professional.photo_url || "");
      setPrimaryColor(professional.primary_color || "#87A96B");
      setSecondaryColor(professional.secondary_color || "#C4A882");
      setBackgroundColor((professional as any).background_color || "#F5F0EB");
      setDarkMode((professional as any).dark_mode || false);
    }
  }, [professional]);

  const handleSave = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      slug,
      whatsapp: whatsapp || null,
      logo_url: logoUrl || null,
      photo_url: photoUrl || null,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      background_color: backgroundColor,
      dark_mode: darkMode,
    } as any).eq("id", professional.id);

    setSaving(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Configurações salvas!");
      queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle>Endereço da Página</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slug">Slug (URL)</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">primeiropasso.com/</span>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contato</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input id="whatsapp" placeholder="(11) 99999-9999" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Imagens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Logo</Label>
            <ImageUpload
              currentUrl={logoUrl || null}
              onUploaded={(url) => setLogoUrl(url)}
              folder="logos"
              variant="logo"
            />
          </div>
          <div className="space-y-2">
            <Label>Foto de Perfil</Label>
            <ImageUpload
              currentUrl={photoUrl || null}
              onUploaded={(url) => setPhotoUrl(url)}
              folder="photos"
              variant="avatar"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cores</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Cor Primária</Label>
              <div className="flex gap-2 items-center">
                <input type="color" id="primaryColor" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer border-0" />
                <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondaryColor">Cor Secundária</Label>
              <div className="flex gap-2 items-center">
                <input type="color" id="secondaryColor" value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer border-0" />
                <Input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>
    </div>
  );
}
