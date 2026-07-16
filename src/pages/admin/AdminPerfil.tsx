import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
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
import { formatPhone, toWhatsAppNumber, isWhatsappInputValid, normalizeSlug } from "@/lib/utils";
import ApproachesEditor from "@/components/admin/ApproachesEditor";

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
  const [attendanceMode, setAttendanceMode] = useState("online");
  const [photoUrl, setPhotoUrl] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [priceFirstSession, setPriceFirstSession] = useState("");
  const [promoPackages, setPromoPackages] = useState<Array<{ id: string; descricao: string; link: string }>>([]);
  const [category, setCategory]             = useState("psicologo");
  const [categoryCustom, setCategoryCustom] = useState("");
  const [approaches, setApproaches]         = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Detecção de alterações não salvas POR CONTEÚDO: compara o formulário atual
  // com um retrato dos dados carregados. Como `isDirty` é derivado (não um estado
  // setado por efeito), não depende de ordem de efeitos nem dá falso positivo em
  // refetch do react-query que traga os mesmos dados.
  const baselineRef = useRef<string | null>(null);
  // Espelha o `isDirty` do render atual para a reidratação poder consultá-lo sem virar
  // dependência do efeito (que só deve rodar por `professional`/`profile`).
  const isDirtyRef = useRef(false);
  const buildSnapshot = (v: {
    fullName: string; slug: string; crp: string; phone: string; email: string;
    address: string; attendanceMode: string; photoUrl: string; logoUrl: string; priceMin: string;
    priceMax: string; priceFirstSession: string;
    promoPackages: Array<{ descricao: string; link: string }>;
    category: string; categoryCustom: string; approaches: string[];
  }) =>
    JSON.stringify([
      v.fullName, v.slug, v.crp, v.phone, v.email, v.address, v.attendanceMode, v.photoUrl, v.logoUrl,
      v.priceMin, v.priceMax, v.priceFirstSession,
      v.promoPackages.map((p) => [p.descricao, p.link]),
      v.category, v.categoryCustom, v.approaches,
    ]);

  useEffect(() => {
    if (!professional) return;
    // Guarda de dirty: se o usuário tem edições locais não salvas, NÃO repõe os campos
    // quando a linha muda no servidor (outra aba salvando, Axel via atualizar_meu_cadastro).
    // Sem isso, as edições seriam apagadas da tela sem aviso (auditoria B7). No caso comum
    // "refetch com dados iguais", o structural sharing do react-query já evita rodar o efeito.
    if (isDirtyRef.current) return;
    const fullNameV = professional.full_name || profile?.full_name || "";
    // Migra categorias legadas (psicologia/odontologia/nutricao/etc) para "outro"
    // preservando o rótulo original no texto livre.
    const rawCat = (professional as any).category || "psicologo";
    const VALID = ["terapeuta", "psicologo", "psiquiatra", "outro"] as const;
    let categoryV: string;
    let categoryCustomV: string;
    if (VALID.includes(rawCat as typeof VALID[number])) {
      categoryV = rawCat;
      categoryCustomV = (professional as any).category_custom || "";
    } else {
      categoryV = "outro";
      const labels: Record<string, string> = {
        psicologia: "Psicologia clínica",
        plataforma_saas: "Plataforma digital / SaaS",
        odontologia: "Odontologia",
        nutricao: "Nutrição",
        medicina: "Medicina",
        educacao: "Educação / Coaching",
      };
      categoryCustomV = (professional as any).category_custom || labels[rawCat] || rawCat;
    }
    const slugV = professional.slug || "";
    const crpV = professional.crp || "";
    // Prioriza o WhatsApp (canal canônico usado pelo Axel/webhook) sobre `phone`, já que
    // ambos são espelhados no save. Evita reidratar com um telefone fixo que outra tela
    // possa ter gravado em `phone` e, ao salvar, sobrescrever o WhatsApp (auditoria B2).
    const phoneV = (professional as any).whatsapp || professional.phone || "";
    const emailV = professional.email || profile?.email || "";
    const addressV = professional.address || "";
    const attendanceModeV = (professional as any).attendance_mode || "online";
    const photoUrlV = professional.photo_url || "";
    const logoUrlV = professional.logo_url || "";
    const priceMinV = professional.price_min?.toString() || "";
    const priceMaxV = professional.price_max?.toString() || "";
    const priceFirstV = professional.price_first_session?.toString() || "";
    const rawPkgs = (professional as any).promo_packages;
    const promoV = Array.isArray(rawPkgs)
      ? rawPkgs.map((p: any) => ({
          id: typeof p?.id === "string" ? p.id : crypto.randomUUID(),
          descricao: typeof p?.descricao === "string" ? p.descricao : "",
          link: typeof p?.link === "string" ? p.link : "",
        }))
      : [];
    const approachesV = ((professional as any).approaches || []) as string[];

    setFullName(fullNameV);
    setCategory(categoryV);
    setCategoryCustom(categoryCustomV);
    setSlug(slugV);
    setCrp(crpV);
    setPhone(phoneV);
    setEmail(emailV);
    setAddress(addressV);
    setAttendanceMode(attendanceModeV);
    setPhotoUrl(photoUrlV);
    setLogoUrl(logoUrlV);
    setPriceMin(priceMinV);
    setPriceMax(priceMaxV);
    setPriceFirstSession(priceFirstV);
    setPromoPackages(promoV);
    setApproaches(approachesV);

    // Retrato dos dados carregados (mesmos valores que acabaram de ir pros campos).
    baselineRef.current = buildSnapshot({
      fullName: fullNameV, slug: slugV, crp: crpV, phone: phoneV, email: emailV,
      address: addressV, attendanceMode: attendanceModeV, photoUrl: photoUrlV, logoUrl: logoUrlV, priceMin: priceMinV,
      priceMax: priceMaxV, priceFirstSession: priceFirstV, promoPackages: promoV,
      category: categoryV, categoryCustom: categoryCustomV, approaches: approachesV,
    });
  }, [professional, profile]);

  const snapshot = buildSnapshot({
    fullName, slug, crp, phone, email, address, attendanceMode, photoUrl, logoUrl,
    priceMin, priceMax, priceFirstSession, promoPackages, category, categoryCustom, approaches,
  });
  const isDirty = baselineRef.current !== null && snapshot !== baselineRef.current;
  isDirtyRef.current = isDirty;

  const addPromoPackage = () =>
    setPromoPackages((prev) => [...prev, { id: crypto.randomUUID(), descricao: "", link: "" }]);
  const removePromoPackage = (id: string) =>
    setPromoPackages((prev) => prev.filter((p) => p.id !== id));
  const updatePromoPackage = (id: string, field: "descricao" | "link", value: string) =>
    setPromoPackages((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));

  const handleSave = async (): Promise<boolean> => {
    if (!professional || !user) return false;
    // Impede salvar um telefone incompleto (< 10 dígitos): sem isso o toWhatsAppNumber
    // prefixaria "55" e o próximo save prefixaria outro (auditoria B6).
    if (phone && !isWhatsappInputValid(phone)) {
      toast.error("Telefone incompleto", {
        description: "Informe o DDD + número (ex.: 11 99999-9999) ou deixe o campo vazio.",
      });
      return false;
    }
    // Slug é NOT NULL UNIQUE: se vazio, o banco rejeitaria TODO o save (23502) e prendia o usuário
    // na página com um toast genérico (auditoria B3). Bloqueia antes com mensagem clara.
    const cleanSlug = normalizeSlug(slug).replace(/-+$/, "");
    if (!cleanSlug) {
      toast.error("Endereço da página vazio", {
        description: "Defina o endereço (slug) da sua página. Ex.: seu-nome.",
      });
      return false;
    }
    // Pacote com link mas sem descrição seria DESCARTADO em silêncio no save (o filtro exige descrição);
    // link inválido chegaria cru ao lead pelo Axel (auditoria B5). Bloqueia e aponta o campo.
    const isValidUrl = (s: string) => { try { const u = new URL(s); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; } };
    const pkgSemDesc = promoPackages.find((p) => p.link.trim() && !p.descricao.trim());
    if (pkgSemDesc) {
      toast.error("Pacote sem descrição", {
        description: "Um pacote tem link mas está sem descrição. Preencha a descrição ou remova o pacote.",
      });
      return false;
    }
    const pkgLinkRuim = promoPackages.find((p) => p.link.trim() && !isValidUrl(p.link.trim()));
    if (pkgLinkRuim) {
      toast.error("Link inválido em um pacote", {
        description: "Use um endereço completo começando com https:// (ex.: https://wa.me/...).",
      });
      return false;
    }
    setSaving(true);

    const [profileRes, profRes] = await Promise.all([
      supabase.from("profiles").update({ full_name: fullName }).eq("user_id", user.id),
      supabase.from("professionals").update({
        full_name: fullName,
        slug: cleanSlug,
        crp,
        phone: phone ? toWhatsAppNumber(phone) : null,
        whatsapp: phone ? toWhatsAppNumber(phone) : null,
        email: email || null,
        address: address || null,
        attendance_mode: attendanceMode || "online",
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
        approaches,
      } as any).eq("id", professional.id),
    ]);

    setSaving(false);
    if (profileRes.error || profRes.error) {
      const err = (profRes.error || profileRes.error) as any;
      const code = err?.code;
      const description =
        code === "23505" ? "Este endereço (slug) já está em uso. Escolha outro."
        : code === "23502" ? "O endereço da página (slug) não pode ficar vazio."
        : err?.message || "Tente novamente em instantes.";
      toast.error("Erro ao salvar", { description });
      return false;
    }
    toast.success("Perfil atualizado!");
    baselineRef.current = snapshot; // o que está na tela agora é o novo "salvo"
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    return true;
  };

  // Liga o aviso de "alterações não salvas" ao guarda global de navegação.
  useUnsavedChanges(isDirty, handleSave);

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">Meu Perfil</h1>

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
        <CardHeader><CardTitle>Dados Profissionais</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Nome completo</Label>
            <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="slug">Slug (URL personalizada) <FieldHint text="Endereço único da sua página. Ex: 'daia-silva' → primeiropasso.online/daia-silva. Use apenas letras minúsculas, números e hífens." /></Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">primeiropasso.online/</span>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(normalizeSlug(e.target.value))}
                onBlur={() => setSlug((s) => normalizeSlug(s).replace(/-+$/, ""))}
                placeholder="seu-nome"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="crp">
              Número do conselho / associação{" "}
              <FieldHint text="Ex: CRP 06/12345, CFP 01/00000, CRM 123456. Não tem conselho? Deixe vazio — a linha não aparece na sua página." />
            </Label>
            <Input id="crp" placeholder="Ex: CRP 06/12345 · CFP 01/00000" value={crp} onChange={(e) => setCrp(e.target.value)} />
            {!crp?.trim() && (
              <p className="text-xs text-muted-foreground">
                Vazio: nenhuma linha de registro aparece na sua página. É o certo para quem não tem conselho.
              </p>
            )}
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
            <Label htmlFor="attendanceMode">Modalidade de atendimento <FieldHint text="Define o que o Axel oferece ao agendar. Em 'Online' ele nunca oferece presencial nem pede endereço; em 'Presencial' ou 'Ambos' ele informa o endereço cadastrado." /></Label>
            <Select value={attendanceMode} onValueChange={setAttendanceMode}>
              <SelectTrigger id="attendanceMode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Online (por vídeo)</SelectItem>
                <SelectItem value="presencial">Presencial</SelectItem>
                <SelectItem value="ambos">Online e presencial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {attendanceMode !== "online" && (
            <div className="space-y-2">
              <Label htmlFor="address">Endereço do consultório <span className="font-normal text-muted-foreground">(opcional)</span></Label>
              <Input id="address" placeholder="Ex: Rua das Flores, 123 — São Paulo, SP" value={address} onChange={(e) => setAddress(e.target.value)} />
              <p className="text-xs text-muted-foreground">Usado pelo Axel quando o atendimento é presencial. Se ficar vazio, ele confirma o local com você antes de marcar.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Valores da Consulta</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priceMin">Sessão no acompanhamento / pacote (R$) <FieldHint text="Valor por sessão para quem segue o processo contínuo (normalmente menor que a avulsa). Deixe em branco se você não oferece esse formato." /></Label>
              <Input id="priceMin" type="number" min="0" step="0.01" placeholder="Ex: 250" value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="priceMax">Sessão avulsa (R$) <FieldHint text="Valor de uma sessão única, sem pacote." /></Label>
              <Input id="priceMax" type="number" min="0" step="0.01" placeholder="Ex: 300" value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="priceFirstSession">1ª sessão — Descoberta (R$) <FieldHint text="Valor especial/promocional da primeira sessão, pra a pessoa conhecer o trabalho antes de decidir." /></Label>
            <Input id="priceFirstSession" type="number" min="0" step="0.01" placeholder="Ex: 150" value={priceFirstSession} onChange={(e) => setPriceFirstSession(e.target.value)} />
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
          {/* O seletor de categoria só faz sentido para as áreas clínicas regulamentadas, onde a
              categoria liga o "limite clínico" do Axel e o público=paciente. Quem é "outro" (não
              clínico) descreve a área em texto livre — sem escolher categoria. Um link discreto
              reabre o seletor, pra ninguém ficar preso em "outro" (era o que acontecia: category
              só saía de "outro" por aqui). */}
          {category !== "outro" ? (
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
          ) : (
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
              <button
                type="button"
                onClick={() => setCategory("psicologo")}
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                Sou psicólogo(a), terapeuta ou psiquiatra — escolher categoria
              </button>
            </div>
          )}

          <div className="space-y-2 pt-2 border-t border-border">
            <Label>Abordagens profissionais <FieldHint text="Suas linhas de trabalho, técnicas ou especialidades (ex: TCC, Psicanálise). Ficam disponíveis na sua página pública e a IA as usa para gerar textos e artigos personalizados. O que você cadastrar aqui aparece também no editor da Landing (aba Sobre) — e vice-versa." /></Label>
            <ApproachesEditor value={approaches} onChange={setApproaches} />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg">
        {saving ? "Salvando..." : "Salvar Perfil"}
      </Button>
    </div>
  );
}
