// Formulário de boas-vindas (/bem-vindo) — aparece logo após o cadastro para coletar, de forma
// paginada, tudo que o DNA da Marca e o Axel precisam para trabalhar com contexto.
//
// Por que existe: os campos "de ouro" (público-alvo, transformação, método, diferenciais, serviços,
// tom, anos de experiência) o gerador de DNA JÁ sabe usar, mas o app nunca capturava — a ficha saía
// vazia e o DNA genérico. Aqui a gente pergunta uma vez, no momento certo.
//
// Não é um gate: dá para "Fazer depois" a qualquer momento (quem pula é lembrado pelo card
// "Primeiros passos" do Dashboard). Rascunho salvo em localStorage — fechar não perde o preenchido.
//
// Onde cada resposta é gravada:
//  - colunas próprias: category/category_custom, approaches, attendance_mode, address, price_*,
//    bio, crp, photo_url;
//  - pain_items (jsonb): as dores (bônus — também alimentam a landing);
//  - dna_inputs (jsonb, coluna nova): os campos de ouro + objetivo com a plataforma.

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Leaf, ArrowRight, ArrowLeft, Check, X, Plus, Sparkles } from "lucide-react";
import ApproachesEditor from "@/components/admin/ApproachesEditor";
import ImageUpload from "@/components/dashboard/ImageUpload";

const DRAFT_KEY = "pp_onboarding_draft";

// Formato do rascunho (tudo string/array simples — serializa direto em localStorage).
interface Draft {
  category: string;
  categoryCustom: string;
  anosExperiencia: string;
  approaches: string[];
  publicoAlvo: string;
  dores: string[];
  transformacao: string;
  metodo: string;
  diferenciais: string;
  servicos: string;
  attendanceMode: string;
  address: string;
  priceFirst: string;
  priceAvulsa: string;
  priceAcompanhamento: string;
  bio: string;
  tom: string;
  photoUrl: string;
  crp: string;
  objetivoPlataforma: string;
}

const EMPTY: Draft = {
  category: "outro", categoryCustom: "", anosExperiencia: "", approaches: [],
  publicoAlvo: "", dores: [], transformacao: "",
  metodo: "", diferenciais: "", servicos: "",
  attendanceMode: "online", address: "", priceFirst: "", priceAvulsa: "", priceAcompanhamento: "",
  bio: "", tom: "", photoUrl: "", crp: "", objetivoPlataforma: "",
};

const TOTAL_STEPS = 5;
const STEP_TITLES = ["Sua atuação", "Quem você atende", "Como você trabalha", "Atendimento e valores", "Você e sua voz"];

// O onboarding mostra só um campo de texto livre para a profissão — mas o `category` clínico ainda
// precisa ser preenchido nos bastidores, porque é ele que liga o "limite clínico" do Axel no
// WhatsApp (psicólogo/terapeuta/psiquiatra = "você não faz terapia") e o público=paciente no
// video-api. Derivamos a categoria do próprio texto: quem se identifica como clínico regulamentado
// mantém o guardrail; o resto vira "outro". O texto digitado sempre fica preservado em
// category_custom (é a fonte de verdade da área, usada pelo DNA e pelo Axel). No AdminPerfil o
// dropdown continua existindo para o profissional corrigir, se a detecção não acertar.
function derivarCategoria(textoLivre: string): string {
  const t = (textoLivre || "").toLowerCase();
  if (/psic[oó]log/.test(t)) return "psicologo";
  if (/psiquiatr/.test(t)) return "psiquiatra";
  if (/terapeut|psican[aá]l/.test(t)) return "terapeuta";
  return "outro";
}

// Rótulo legível de uma categoria clínica salva no banco — usado só para pré-preencher o campo de
// texto quando o profissional já tinha uma categoria e ainda não escreveu a área por extenso.
const CATEGORIA_LABEL: Record<string, string> = {
  psicologo: "Psicólogo(a)", terapeuta: "Terapeuta", psiquiatra: "Psiquiatra",
};

export default function OnboardingWelcome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: professional } = useProfessional();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [d, setD] = useState<Draft>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  // Nome que já veio do cadastro — usado só na saudação, não é editado aqui.
  const firstName = useMemo(() => (professional?.full_name || "").trim().split(" ")[0] || "", [professional]);

  // Hidrata uma vez: rascunho local tem prioridade (é o que o usuário estava preenchendo);
  // senão, pré-preenche com o que já existe no banco (perfil + dna_inputs).
  useEffect(() => {
    if (hydrated || !professional) return;
    const p = professional as any;
    let base: Draft = {
      ...EMPTY,
      category: p.category || "outro",
      // Campo de texto único: mostra a área por extenso; se ainda não há texto mas há categoria
      // clínica salva, pré-preenche com o rótulo dela para o profissional ver/editar.
      categoryCustom: p.category_custom || CATEGORIA_LABEL[p.category] || "",
      approaches: Array.isArray(p.approaches) ? p.approaches : [],
      dores: Array.isArray(p.pain_items) ? p.pain_items.map((i: any) => (typeof i === "string" ? i : i?.text)).filter(Boolean) : [],
      attendanceMode: p.attendance_mode || "online",
      address: p.address || "",
      priceFirst: p.price_first_session != null ? String(p.price_first_session) : "",
      priceAvulsa: p.price_max != null ? String(p.price_max) : "",
      priceAcompanhamento: p.price_min != null ? String(p.price_min) : "",
      bio: p.bio || "",
      photoUrl: p.photo_url || "",
      crp: p.crp || "",
      ...(p.dna_inputs && typeof p.dna_inputs === "object" ? {
        anosExperiencia: p.dna_inputs.anos_experiencia || "",
        publicoAlvo: p.dna_inputs.publico_alvo || "",
        transformacao: p.dna_inputs.transformacao || "",
        metodo: p.dna_inputs.metodo || "",
        diferenciais: p.dna_inputs.diferenciais || "",
        servicos: p.dna_inputs.servicos || "",
        tom: p.dna_inputs.tom || "",
        objetivoPlataforma: p.dna_inputs.objetivo_plataforma || "",
      } : {}),
    };
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) base = { ...base, ...JSON.parse(raw) };
    } catch { /* rascunho corrompido — ignora e usa o do banco */ }
    setD(base);
    setHydrated(true);
  }, [professional, hydrated]);

  // Salva o rascunho a cada mudança (menos a foto, que já vive no Storage por URL).
  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* quota/priv — ok */ }
  }, [d, hydrated]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const toNumber = (s: string): number | null => {
    const n = parseFloat(String(s).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  // Grava tudo no banco. `finalize` distingue "Concluir" (marca fim + oferece DNA) de um save
  // parcial ao "Fazer depois" (persiste o que já foi preenchido, sem exigir nada).
  const persist = async (): Promise<boolean> => {
    if (!professional) return false;
    const dnaInputs = {
      anos_experiencia: d.anosExperiencia.trim() || null,
      publico_alvo: d.publicoAlvo.trim() || null,
      transformacao: d.transformacao.trim() || null,
      metodo: d.metodo.trim() || null,
      diferenciais: d.diferenciais.trim() || null,
      servicos: d.servicos.trim() || null,
      tom: d.tom.trim() || null,
      objetivo_plataforma: d.objetivoPlataforma.trim() || null,
    };
    const temAlgumOuro = Object.values(dnaInputs).some(Boolean);
    const painItems = d.dores.map((t) => t.trim()).filter(Boolean).map((text) => ({ text }));

    const areaTexto = d.categoryCustom.trim();
    // Categoria derivada do texto (liga/desliga o guardrail clínico do Axel). O texto sempre fica
    // preservado em category_custom — inclusive para clínicos, então "Psicóloga clínica de ansiedade"
    // não perde o "de ansiedade" ao virar category=psicologo.
    const categoriaDerivada = derivarCategoria(areaTexto);
    const patch: Record<string, unknown> = {
      category: categoriaDerivada,
      category_custom: areaTexto || null,
      approaches: d.approaches,
      attendance_mode: d.attendanceMode || "online",
      address: d.address.trim() || null,
      price_first_session: toNumber(d.priceFirst),
      price_max: toNumber(d.priceAvulsa),
      price_min: toNumber(d.priceAcompanhamento),
      bio: d.bio.trim() || null,
      crp: d.crp.trim() || null,
      photo_url: d.photoUrl.trim() || null,
      // Só sobrescreve dores se o usuário preencheu — não zera pain_items já existentes da landing.
      ...(painItems.length > 0 ? { pain_items: painItems } : {}),
      dna_inputs: temAlgumOuro ? dnaInputs : null,
    };

    let { error } = await supabase.from("professionals").update(patch as any).eq("id", professional.id);
    // Deploy-safe: se a coluna dna_inputs ainda não foi migrada, salva TODO o resto (não trava o
    // onboarding). Os campos de ouro passam a persistir sozinhos assim que a coluna existir.
    if (error && /dna_inputs/i.test(error.message || "")) {
      const { dna_inputs: _pendente, ...semOuro } = patch;
      ({ error } = await supabase.from("professionals").update(semOuro as any).eq("id", professional.id));
    }
    if (error) {
      toast.error("Não consegui salvar agora", { description: error.message });
      return false;
    }
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ok */ }
    queryClient.invalidateQueries({ queryKey: ["my-professional"] });
    return true;
  };

  const finish = async () => {
    setSaving(true);
    const ok = await persist();
    setSaving(false);
    if (!ok) return;
    const temAbordagens = d.approaches.length > 0;
    // Oferece gerar o DNA (não dispara sozinho — é operação cara). Só faz sentido se há abordagens,
    // que é o gate real do gerador.
    if (temAbordagens) {
      toast.success("Perfil pronto! Que tal gerar seu DNA da Marca agora?", {
        description: "A IA cria a base da sua marca a partir do que você respondeu.",
        action: { label: "Gerar DNA", onClick: () => navigate("/admin/landing?tab=dna") },
        duration: 12000,
      });
    } else {
      toast.success("Tudo salvo! Bem-vindo(a).");
    }
    navigate("/admin", { replace: true });
  };

  // "Fazer depois": salva o que já tem (sem cobrar nada) e leva ao painel.
  const skip = async () => {
    setSaving(true);
    await persist();
    setSaving(false);
    navigate("/admin", { replace: true });
  };

  const next = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  const back = () => setStep((s) => Math.max(1, s - 1));

  const progress = Math.round((step / TOTAL_STEPS) * 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-accent/5 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Cabeçalho: marca + saudação + progresso */}
        <div className="mb-6 text-center">
          <div className="inline-flex items-center gap-2 text-primary font-heading font-bold text-lg mb-3">
            <Leaf className="h-5 w-5" />
            Primeiro Passo
          </div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">
            {firstName ? `Boas-vindas, ${firstName}!` : "Boas-vindas!"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Responda o essencial para a IA criar seu DNA da Marca e o Axel atender com o seu contexto.
            Leva uns minutos — e dá para completar depois.
          </p>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Passo {step} de {TOTAL_STEPS} · {STEP_TITLES[step - 1]}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="shadow-lg">
          <CardContent className="p-6 space-y-5">
            {step === 1 && (
              <>
                <FieldBlock label="Qual é a sua profissão ou atividade?" hint="Escreva do seu jeito. Ex: Psicóloga clínica, Nutricionista esportivo, Coach financeiro, Engenharia de IA aplicada.">
                  <Input
                    placeholder="Ex: Psicóloga clínica · Nutricionista esportivo · Engenharia de IA aplicada"
                    value={d.categoryCustom}
                    onChange={(e) => set("categoryCustom", e.target.value)}
                  />
                </FieldBlock>

                <FieldBlock label="Há quanto tempo você atua?" hint="Ex: 8 anos · desde 2015 · comecei recentemente">
                  <Input placeholder="Ex: 8 anos" value={d.anosExperiencia} onChange={(e) => set("anosExperiencia", e.target.value)} />
                </FieldBlock>

                <FieldBlock label="Suas abordagens, técnicas ou especialidades" hint="É o que dá personalidade ao seu DNA e aos textos. Ex: TCC, Psicanálise, Mindfulness.">
                  <ApproachesEditor value={d.approaches} onChange={(v) => set("approaches", v)} />
                </FieldBlock>
              </>
            )}

            {step === 2 && (
              <>
                <FieldBlock label="Quem é o seu cliente ideal?" hint="Descreva a pessoa que você mais gosta de atender — idade, momento de vida, o que ela busca.">
                  <Textarea rows={3} placeholder="Ex: Mulheres de 30-45 anos, sobrecarregadas, buscando reequilíbrio entre trabalho e vida pessoal." value={d.publicoAlvo} onChange={(e) => set("publicoAlvo", e.target.value)} />
                </FieldBlock>

                <FieldBlock label="Principais dores ou problemas que você resolve" hint="Uma por linha. Aparecem no seu DNA e também viram cards na sua página.">
                  <ListEditor items={d.dores} onChange={(v) => set("dores", v)} placeholder="Ex: Ansiedade que atrapalha o sono" />
                </FieldBlock>

                <FieldBlock label="Qual transformação você entrega?" hint="Onde a pessoa chega depois de trabalhar com você.">
                  <Textarea rows={3} placeholder="Ex: Sair do piloto automático e recuperar clareza para decidir com tranquilidade." value={d.transformacao} onChange={(e) => set("transformacao", e.target.value)} />
                </FieldBlock>
              </>
            )}

            {step === 3 && (
              <>
                <FieldBlock label="Você tem um método ou passo a passo próprio?" hint="Se sim, descreva as etapas. Se não, deixe em branco.">
                  <Textarea rows={3} placeholder="Ex: 1) Mapeamento inicial · 2) Plano de 12 semanas · 3) Acompanhamento contínuo." value={d.metodo} onChange={(e) => set("metodo", e.target.value)} />
                </FieldBlock>

                <FieldBlock label="O que te diferencia de outros profissionais da sua área?">
                  <Textarea rows={3} placeholder="Ex: Uno técnica baseada em evidências com um acompanhamento próximo por WhatsApp entre sessões." value={d.diferenciais} onChange={(e) => set("diferenciais", e.target.value)} />
                </FieldBlock>

                <FieldBlock label="Quais serviços ou produtos você oferece?">
                  <Textarea rows={3} placeholder="Ex: Sessões individuais, grupo de apoio quinzenal, e-book de exercícios." value={d.servicos} onChange={(e) => set("servicos", e.target.value)} />
                </FieldBlock>
              </>
            )}

            {step === 4 && (
              <>
                <FieldBlock label="Como você atende?">
                  <Select value={d.attendanceMode} onValueChange={(v) => set("attendanceMode", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="online">Online (por vídeo)</SelectItem>
                      <SelectItem value="presencial">Presencial</SelectItem>
                      <SelectItem value="ambos">Online e presencial</SelectItem>
                    </SelectContent>
                  </Select>
                  {d.attendanceMode !== "online" && (
                    <Input className="mt-2" placeholder="Endereço do atendimento (opcional)" value={d.address} onChange={(e) => set("address", e.target.value)} />
                  )}
                </FieldBlock>

                <FieldBlock label="Seus valores" hint="Só números. Deixe em branco o que não se aplica — o Axel usa isso ao conversar sobre preço.">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <PriceInput label="1ª sessão" value={d.priceFirst} onChange={(v) => set("priceFirst", v)} />
                    <PriceInput label="Sessão avulsa" value={d.priceAvulsa} onChange={(v) => set("priceAvulsa", v)} />
                    <PriceInput label="Acompanhamento" value={d.priceAcompanhamento} onChange={(v) => set("priceAcompanhamento", v)} />
                  </div>
                </FieldBlock>
              </>
            )}

            {step === 5 && (
              <>
                <FieldBlock label="Uma bio curta sobre você" hint="Aparece na sua página e ajuda o Axel a te apresentar. 2-4 frases.">
                  <Textarea rows={4} placeholder="Ex: Sou psicóloga há 10 anos, especialista em ansiedade. Acredito num acompanhamento próximo e sem julgamentos…" value={d.bio} onChange={(e) => set("bio", e.target.value)} />
                </FieldBlock>

                <FieldBlock label="Como você quer soar?" hint="O tom da sua comunicação. Ex: acolhedor e caloroso · direto e técnico · leve e bem-humorado.">
                  <Input placeholder="Ex: acolhedor, próximo e sem jargão" value={d.tom} onChange={(e) => set("tom", e.target.value)} />
                </FieldBlock>

                <FieldBlock label="Sua foto" hint="Usada na sua página e no DNA. Pode adicionar depois.">
                  <ImageUpload currentUrl={d.photoUrl || null} onUploaded={(url) => set("photoUrl", url)} folder="photos" variant="avatar" />
                </FieldBlock>

                <FieldBlock label="Número do conselho / registro" hint="Só se você tem um (CRP, CRM, etc). Não tem? Deixe vazio — não aparece na sua página.">
                  <Input placeholder="Ex: CRP 06/12345" value={d.crp} onChange={(e) => set("crp", e.target.value)} />
                </FieldBlock>

                <FieldBlock label="Qual seu objetivo com a plataforma?" hint="Ajuda o Axel a te guiar. Ex: atrair mais pacientes, organizar a agenda, criar conteúdo.">
                  <Textarea rows={2} placeholder="Ex: Quero preencher minha agenda e ter uma presença digital profissional." value={d.objetivoPlataforma} onChange={(e) => set("objetivoPlataforma", e.target.value)} />
                </FieldBlock>
              </>
            )}
          </CardContent>
        </Card>

        {/* Navegação */}
        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            {step > 1 && (
              <Button variant="ghost" onClick={back} disabled={saving}>
                <ArrowLeft className="h-4 w-4 mr-1.5" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={skip} disabled={saving} className="text-muted-foreground">
              Fazer depois
            </Button>
            {step < TOTAL_STEPS ? (
              <Button onClick={next} disabled={saving}>
                Continuar <ArrowRight className="h-4 w-4 ml-1.5" />
              </Button>
            ) : (
              <Button onClick={finish} disabled={saving}>
                {saving ? "Salvando…" : <>Concluir <Check className="h-4 w-4 ml-1.5" /></>}
              </Button>
            )}
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Sparkles className="h-3 w-3" /> Tudo o que você responder aqui pode ser editado depois em Meu Perfil e no editor da Landing.
        </p>
      </div>
    </div>
  );
}

// ── Blocos reutilizados dentro das páginas ──

function FieldBlock({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground -mt-0.5">{hint}</p>}
      <div className="pt-1">{children}</div>
    </div>
  );
}

function PriceInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="relative mt-1">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
        <Input className="pl-9" inputMode="decimal" placeholder="0,00" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}

// Lista simples (dores): input + Enter/botão adiciona, cada item removível. Vira pain_items no save.
function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v || items.includes(v)) { setDraft(""); return; }
    onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <div className="space-y-1.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <span className="flex-1 text-sm">{it}</span>
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remover">
                <X className="h-4 w-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <Input
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
        />
        <Button type="button" variant="outline" size="icon" onClick={add}><Plus className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
