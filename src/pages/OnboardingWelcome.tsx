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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Leaf, ArrowRight, ArrowLeft, Check, X, Plus, Sparkles, Wand2, Loader2, Copy } from "lucide-react";
import ApproachesEditor from "@/components/admin/ApproachesEditor";
import ImageUpload from "@/components/dashboard/ImageUpload";
import { formMissing } from "@/lib/onboardingGate";

const DRAFT_KEY = "pp_onboarding_draft";

// Pedido pronto que o profissional copia e manda pra IA que já usa (ChatGPT etc.) — a resposta
// dela é o que o "Importar de outra IA" lê. Pedir os campos na ordem do formulário melhora o parse.
const IMPORT_PROMPT =
  "Resuma tudo o que você sabe sobre mim e o meu trabalho, em texto corrido: minha profissão, " +
  "tempo de atuação, abordagens e técnicas que uso, quem é o meu público, as dores que eu atendo, " +
  "a transformação que entrego, meu método, meus diferenciais, meus serviços e meu tom de comunicação.";

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

// Aplica o perfil importado no rascunho SEM sobrescrever o que o usuário já digitou:
// campo de texto só é preenchido se estava vazio; listas viram união (nada é removido).
// `added` = quantas informações novas entraram (0 = texto não trouxe nada além do que já havia).
function mergeImport(prev: Draft, perfil: any): { next: Draft; added: number } {
  let added = 0;
  const fillStr = (cur: string, val: any): string => {
    const v = String(val ?? "").trim();
    if (!v || cur.trim()) return cur;
    added++;
    return v;
  };
  const mergeList = (cur: string[], vals: any): string[] => {
    const list = Array.isArray(vals) ? vals.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
    const novas = list.filter((x) => !cur.includes(x));
    added += novas.length;
    return novas.length ? [...cur, ...novas] : cur;
  };
  const next: Draft = {
    ...prev,
    categoryCustom: fillStr(prev.categoryCustom, perfil?.profissao),
    anosExperiencia: fillStr(prev.anosExperiencia, perfil?.anos_experiencia),
    approaches: mergeList(prev.approaches, perfil?.abordagens),
    publicoAlvo: fillStr(prev.publicoAlvo, perfil?.publico_alvo),
    dores: mergeList(prev.dores, perfil?.dores),
    transformacao: fillStr(prev.transformacao, perfil?.transformacao),
    metodo: fillStr(prev.metodo, perfil?.metodo),
    diferenciais: fillStr(prev.diferenciais, perfil?.diferenciais),
    servicos: fillStr(prev.servicos, perfil?.servicos),
    bio: fillStr(prev.bio, perfil?.bio),
    tom: fillStr(prev.tom, perfil?.tom),
  };
  return { next, added };
}

// Chama a edge onboarding-assist extraindo a mensagem amigável do corpo mesmo em non-2xx —
// FunctionsHttpError esconde o corpo em error.context e o message vira um genérico em inglês
// (mesmo padrão do invokeFn do BrandDnaEditorTab).
async function invokeAssist(body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke("onboarding-assist", { body });
  if (error) {
    const detail = (error as any)?.context
      ? await (error as any).context.json().then((j: any) => j?.mensagem ?? j?.error).catch(() => null)
      : null;
    throw new Error(detail ?? error.message ?? "Erro no assistente.");
  }
  return data;
}

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
      // Rascunho local NÃO sobrepõe o banco: só preenche o que o banco não tem. Um draft de dias
      // atrás (página aberta e abandonada) regravaria bio/preços/foto antigos por cima do que o
      // profissional editou depois em Meu Perfil — e o gating agora traz usuários antigos pra cá.
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Partial<Draft>;
        (Object.keys(EMPTY) as (keyof Draft)[]).forEach((k) => {
          const dv = draft[k];
          if (dv == null) return;
          const bv = base[k];
          const baseVazio = Array.isArray(bv) ? bv.length === 0 : String(bv ?? "").trim() === "";
          if (baseVazio) (base as any)[k] = dv;
        });
        // Campos com default local: banco NULL vira default na base — nesses o rascunho ainda vale.
        if (!p.attendance_mode && typeof draft.attendanceMode === "string") base.attendanceMode = draft.attendanceMode;
      }
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

  // ── Assistente de IA (edge onboarding-assist — grátis, sem débito) ──
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [generatingBio, setGeneratingBio] = useState(false);
  // Sugestões ainda não adotadas (clicar numa chip a adiciona em approaches e ela some daqui).
  const pendingSuggestions = suggestions.filter((s) => !d.approaches.includes(s));

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.info("Não consegui copiar sozinho", { description: "Selecione o texto do pedido e copie manualmente." });
    }
  };

  const handleImport = async () => {
    if (importing) return;
    setImporting(true);
    try {
      const data = await invokeAssist({ action: "parse_persona", texto: importText });
      if (data?.error) {
        toast.error("Não deu para importar", { description: data.mensagem ?? data.error });
        return;
      }
      const { next, added } = mergeImport(d, data?.perfil ?? {});
      if (added === 0) {
        toast.info("Nada novo para preencher", { description: "O texto não trouxe informações além das que você já preencheu." });
        return;
      }
      setD(next);
      setImportOpen(false);
      setImportText("");
      toast.success(`${added} informaç${added > 1 ? "ões preenchidas" : "ão preenchida"}!`, {
        description: "Revise cada passo — só o que estava vazio foi preenchido, e dá pra ajustar tudo.",
        duration: 8000,
      });
    } catch (e: any) {
      toast.error("Erro ao importar", { description: e?.message ?? String(e) });
    } finally {
      setImporting(false);
    }
  };

  const suggestApproaches = async () => {
    if (suggesting) return;
    const profissao = d.categoryCustom.trim();
    if (!profissao) {
      toast.info("Digite sua profissão primeiro", { description: "As sugestões de abordagens partem dela." });
      return;
    }
    setSuggesting(true);
    try {
      const data = await invokeAssist({ action: "suggest_approaches", profissao });
      if (data?.error) {
        toast.error("Não deu para sugerir", { description: data.mensagem ?? data.error });
        return;
      }
      const novas = (data?.abordagens ?? []).filter((a: string) => !d.approaches.includes(a));
      if (novas.length === 0) {
        toast.info("Sem sugestões novas", { description: "Você já adicionou as abordagens comuns dessa área." });
        return;
      }
      setSuggestions(novas);
    } catch (e: any) {
      toast.error("Erro ao sugerir abordagens", { description: e?.message ?? String(e) });
    } finally {
      setSuggesting(false);
    }
  };

  const suggestBio = async () => {
    if (generatingBio) return;
    setGeneratingBio(true);
    try {
      const data = await invokeAssist({
        action: "suggest_bio",
        draft: {
          profissao: d.categoryCustom, anos_experiencia: d.anosExperiencia, abordagens: d.approaches,
          publico_alvo: d.publicoAlvo, dores: d.dores, transformacao: d.transformacao,
          diferenciais: d.diferenciais, servicos: d.servicos, tom: d.tom,
        },
      });
      if (data?.error) {
        toast.error("Não deu para criar a bio", { description: data.mensagem ?? data.error });
        return;
      }
      if (data?.bio) {
        set("bio", data.bio);
        toast.success("Bio criada a partir das suas respostas!", { description: "Edite à vontade — a página é sua." });
      }
    } catch (e: any) {
      toast.error("Erro ao criar a bio", { description: e?.message ?? String(e) });
    } finally {
      setGeneratingBio(false);
    }
  };

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
    // Convite coerente com o gate REAL do gerador (lib/onboardingGate, o mesmo do botão e da
    // edge): só oferece "Gerar DNA" quando o que foi salvo destrava o botão de verdade —
    // convidar para uma porta trancada frustra. Senão, diz exatamente o que falta.
    const faltamProDna = formMissing({
      category: derivarCategoria(d.categoryCustom.trim()),
      category_custom: d.categoryCustom,
      approaches: d.approaches,
      dna_inputs: { publico_alvo: d.publicoAlvo, transformacao: d.transformacao },
    });
    if (faltamProDna.length === 0) {
      toast.success("Perfil pronto! Que tal gerar seu DNA da Marca agora?", {
        description: "A IA cria a base da sua marca a partir do que você respondeu.",
        action: { label: "Gerar DNA", onClick: () => navigate("/admin/landing?tab=dna") },
        duration: 12000,
      });
    } else {
      toast.success("Tudo salvo! Bem-vindo(a).", {
        description: `Para gerar seu DNA da Marca depois, falta preencher: ${faltamProDna.join(", ")}.`,
        duration: 10000,
      });
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
                {/* Quem já usa ChatGPT tem a própria "persona" pronta lá — cola e o formulário
                    se preenche (só campos vazios; nada do que foi digitado é sobrescrito). */}
                <button
                  type="button"
                  onClick={() => setImportOpen(true)}
                  className="w-full flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Já usa ChatGPT ou outra IA?</p>
                    <p className="text-xs text-muted-foreground">Importe o que ela sabe sobre você e o formulário se preenche sozinho. Grátis.</p>
                  </div>
                  <Wand2 className="h-4 w-4 shrink-0 text-primary" />
                </button>

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
                  <div className="mt-2 space-y-2">
                    {/* Sugestões, não afirmação: a IA lista o que é comum na área digitada e o
                        profissional CLICA no que é verdade sobre ele. */}
                    <Button
                      type="button" variant="ghost" size="sm"
                      className="h-8 gap-1.5 px-2 text-primary"
                      onClick={suggestApproaches}
                      disabled={suggesting}
                    >
                      {suggesting
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Buscando…</>
                        : <><Sparkles className="h-3.5 w-3.5" /> Sugerir abordagens comuns da minha área</>}
                    </Button>
                    {pendingSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {pendingSuggestions.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => set("approaches", [...d.approaches, s])}
                            className="inline-flex items-center gap-1 rounded-full border border-dashed border-primary/40 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
                          >
                            <Plus className="h-3 w-3" /> {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
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
                  {/* Aqui a IA TEM matéria-prima (passos 1-4) — diferente da profissão, que é fato. */}
                  <Button
                    type="button" variant="ghost" size="sm"
                    className="mt-1.5 h-8 gap-1.5 px-2 text-primary"
                    onClick={suggestBio}
                    disabled={generatingBio}
                  >
                    {generatingBio
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Criando…</>
                      : <><Wand2 className="h-3.5 w-3.5" /> {d.bio.trim() ? "Refazer com IA" : "Criar com IA"} usando o que você respondeu</>}
                  </Button>
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

        {/* Importar de outra IA: pedido pronto pra copiar + cole da resposta */}
        <Dialog open={importOpen} onOpenChange={(o) => { if (!importing) setImportOpen(o); }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5 text-primary" /> Importar de outra IA
              </DialogTitle>
              <DialogDescription>
                Peça um resumo sobre você à IA que você já usa (ChatGPT, Gemini…), cole a resposta aqui e o
                formulário se preenche. Nada do que você já digitou é sobrescrito.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">1. Copie e envie este pedido para a sua IA:</p>
                <p className="text-sm leading-relaxed">“{IMPORT_PROMPT}”</p>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copyPrompt}>
                  {copied ? <><Check className="h-3.5 w-3.5" /> Copiado!</> : <><Copy className="h-3.5 w-3.5" /> Copiar pedido</>}
                </Button>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">2. Cole a resposta dela aqui:</p>
                <Textarea
                  rows={7}
                  placeholder="Cole aqui o resumo que a IA fez sobre você e o seu trabalho…"
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  disabled={importing}
                />
              </div>
              <Button className="w-full gap-2" onClick={handleImport} disabled={importing || importText.trim().length < 40}>
                {importing
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Lendo e preenchendo…</>
                  : <><Sparkles className="h-4 w-4" /> Preencher formulário</>}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
