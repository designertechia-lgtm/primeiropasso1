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

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function deriveColors(hex: string, mode: 'light' | 'dark' = 'light') {
  const { h, s } = hexToHsl(hex);
  const secH = (h + 30) % 360;
  const secS = Math.round(s * 0.6);
  const secL = mode === 'light' ? Math.min(65, 50 + 15) : Math.min(55, 40 + 15);
  const bgS = Math.round(s * 0.15);
  const bgL = mode === 'light' ? 94 : 11;
  return {
    secondary: hslToHex(secH, secS, secL),
    background: hslToHex(h, bgS, bgL),
  };
}

export default function AdminConfiguracoes() {
  const { data: professional, isLoading } = useProfessional();
  const queryClient = useQueryClient();

  const [slug, setSlug] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#87A96B");
  const [darkMode, setDarkMode] = useState(false);
  const [darkPrimaryColor, setDarkPrimaryColor] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (professional) {
      setSlug(professional.slug || "");
      setWhatsapp(professional.whatsapp || "");
      setLogoUrl(professional.logo_url || "");
      setPhotoUrl(professional.photo_url || "");
      setPrimaryColor(professional.primary_color || "#87A96B");
      setDarkMode((professional as any).dark_mode || false);
      setDarkPrimaryColor((professional as any).dark_primary_color || "");
    }
  }, [professional]);

  const lightDerived = deriveColors(primaryColor, 'light');
  const darkDerived = deriveColors(darkPrimaryColor || primaryColor, 'dark');

  const handleSave = async () => {
    if (!professional) return;
    setSaving(true);
    const { error } = await supabase.from("professionals").update({
      slug,
      whatsapp: whatsapp || null,
      logo_url: logoUrl || null,
      photo_url: photoUrl || null,
      primary_color: primaryColor,
      secondary_color: lightDerived.secondary,
      background_color: lightDerived.background,
      dark_mode: darkMode,
      dark_primary_color: darkPrimaryColor || null,
      dark_secondary_color: darkMode ? darkDerived.secondary : null,
      dark_background_color: darkMode ? darkDerived.background : null,
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
          <div className="space-y-2">
            <Label htmlFor="primaryColor">Cor Primária</Label>
            <div className="flex gap-2 items-center">
              <input type="color" id="primaryColor" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer border-0" />
              <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
            </div>
          </div>

          <div className="pt-3">
            <Label className="text-sm text-muted-foreground">Paleta gerada automaticamente</Label>
            <div className="flex gap-3 mt-2">
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-lg border" style={{ backgroundColor: primaryColor }} />
                <span className="text-xs text-muted-foreground">Primária</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-lg border" style={{ backgroundColor: lightDerived.secondary }} />
                <span className="text-xs text-muted-foreground">Secundária</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-12 h-12 rounded-lg border" style={{ backgroundColor: lightDerived.background }} />
                <span className="text-xs text-muted-foreground">Fundo</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="space-y-1">
              <Label htmlFor="darkMode">Modo Escuro</Label>
              <p className="text-sm text-muted-foreground">Ativar tema escuro na landing page</p>
            </div>
            <Switch id="darkMode" checked={darkMode} onCheckedChange={setDarkMode} />
          </div>
        </CardContent>
      </Card>

      {darkMode && (
        <Card>
          <CardHeader>
            <CardTitle>Cores do Modo Escuro</CardTitle>
            <p className="text-sm text-muted-foreground">Opcional — se vazio, usa a cor primária do modo claro.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="darkPrimaryColor">Cor Primária (Escura)</Label>
              <div className="flex gap-2 items-center">
                <input type="color" id="darkPrimaryColor" value={darkPrimaryColor || primaryColor} onChange={(e) => setDarkPrimaryColor(e.target.value)} className="h-10 w-10 rounded cursor-pointer border-0" />
                <Input value={darkPrimaryColor} onChange={(e) => setDarkPrimaryColor(e.target.value)} placeholder="Usar padrão" className="flex-1" />
                {darkPrimaryColor && <Button variant="ghost" size="sm" onClick={() => setDarkPrimaryColor("")}>Limpar</Button>}
              </div>
            </div>

            <div className="pt-3">
              <Label className="text-sm text-muted-foreground">Paleta escura gerada</Label>
              <div className="flex gap-3 mt-2">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg border" style={{ backgroundColor: darkPrimaryColor || primaryColor }} />
                  <span className="text-xs text-muted-foreground">Primária</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg border" style={{ backgroundColor: darkDerived.secondary }} />
                  <span className="text-xs text-muted-foreground">Secundária</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <div className="w-12 h-12 rounded-lg border" style={{ backgroundColor: darkDerived.background }} />
                  <span className="text-xs text-muted-foreground">Fundo</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? "Salvando..." : "Salvar Configurações"}
      </Button>
    </div>
  );
}
