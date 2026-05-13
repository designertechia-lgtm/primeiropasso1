import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const FAQS = [
  {
    q: "Como o agente do WhatsApp consegue agendar sozinho?",
    a: "O agente conversa via Evolution API (texto, áudio e imagem), consulta sua agenda real no Supabase, identifica horários disponíveis e cria o agendamento sem você intervir. Você define a faixa de preço (promocional/mínimo/máximo) e ele negocia dentro dela. Casos sensíveis (urgência, conteúdo clínico delicado) escalam para você imediatamente.",
  },
  {
    q: "O que é o RAG personalizado?",
    a: "Você faz upload dos seus PDFs (artigos, livros, transcrições, materiais de estudo). A plataforma converte em embeddings e armazena num vector store privado seu. O agente do WhatsApp consulta essa base antes de responder — então ele fala no seu estilo, baseado nas suas próprias referências. Não é uma IA genérica.",
  },
  {
    q: "Posso usar meu próprio rosto como avatar?",
    a: "Sim. Você grava um vídeo curto de calibração e o HeyGen cria seu avatar fotorrealista. Quem assiste vê e ouve você de verdade, com lip-sync preciso. Para conteúdo cinematográfico sem avatar, use Kling AI, Google Veo ou Sora.",
  },
  {
    q: "Como funciona o multi-formato?",
    a: "A mesma ideia gera vídeo curto (TikTok/Reels/Shorts), vídeo longo (YouTube), carrossel Instagram (5-10 slides), post estático (LinkedIn/feed), artigo de blog SEO e até e-book PDF para lead-magnet. Você escolhe quais formatos quer gerar para cada tema. O calendário editorial distribui pela semana automaticamente.",
  },
  {
    q: "Os roteiros respeitam o CFP?",
    a: "Cada roteiro passa por um system prompt orientado pelas Resoluções CFP nº 011/2018 e correlatas — evita promessas terapêuticas, sensacionalismo e revelação de casos. Você sempre tem o controle final na aprovação. O agente do WhatsApp também tem filtros: nunca dá diagnóstico, nunca substitui consulta.",
  },
  {
    q: "Quanto tempo leva para gerar um vídeo?",
    a: "Do tema à versão final: 8 a 12 minutos com HeyGen. Com Kling/Veo pode levar até 25 minutos pela qualidade superior. A publicação automática nas redes acontece após sua aprovação no WhatsApp.",
  },
  {
    q: "Como funcionam os créditos de vídeo premium?",
    a: "Cada plano inclui uma quantidade de créditos mensais (Pro: 10, Scale: 30). Um crédito = um vídeo premium gerado com Kling, Veo ou Sora. Vídeos com HeyGen padrão não consomem crédito. Quando precisar de mais, compra pacotes avulsos via Pix (10/30/70 créditos) sem mudar de plano.",
  },
  {
    q: "Como cancelo a assinatura?",
    a: "Cancelamento imediato no painel. Sem multa, sem fidelidade. Os vídeos que você já gerou permanecem publicados nas redes — eles são seus, com seu rosto e sua voz.",
  },
];

export default function PlatformFAQ() {
  return (
    <section id="faq" className="py-20 md:py-28 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto max-w-3xl px-4">
        <div className="text-center mb-12 md:mb-14">
          <p className="text-sm uppercase tracking-[0.18em] text-accent font-semibold mb-3">
            FAQ
          </p>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-semibold text-foreground leading-tight tracking-tight">
            Perguntas frequentes
          </h2>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {FAQS.map(({ q, a }, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-border">
              <AccordionTrigger className="text-left text-base md:text-lg font-semibold text-foreground hover:no-underline py-5">
                {q}
              </AccordionTrigger>
              <AccordionContent className="text-base text-foreground/75 leading-relaxed pb-5">
                {a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
