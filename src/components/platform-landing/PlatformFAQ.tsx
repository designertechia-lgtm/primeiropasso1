import { useState } from "react";
import { ChevronDown } from "lucide-react";

type FaqItem = { q: string; a: string };

const FAQS: FaqItem[] = [
  {
    q: "Como o agente do WhatsApp consegue agendar sozinho?",
    a: "O agente conversa por texto, áudio e imagem, consulta sua agenda real, identifica horários disponíveis e cria o agendamento sem você intervir. Você define a faixa de preço (promocional/mínimo/máximo) e ele negocia dentro dela. Casos sensíveis — urgência ou conteúdo clínico delicado — escalam para você imediatamente.",
  },
  {
    q: "O que é o RAG personalizado?",
    a: "Você faz upload dos seus PDFs (artigos, livros, transcrições, materiais de estudo). A plataforma converte em embeddings e armazena num vector store privado seu. O agente consulta essa base antes de responder — então ele fala no seu estilo, baseado nas suas próprias referências. Não é uma IA genérica.",
  },
  {
    q: "Posso usar meu próprio rosto como avatar?",
    a: "Sim. Você grava um vídeo curto de calibração e a plataforma cria seu avatar fotorrealista. Quem assiste vê e ouve você de verdade, com lip-sync preciso. Para conteúdo cinematográfico sem avatar, escolha um dos motores premium disponíveis.",
  },
  {
    q: "Como funciona o multi-formato?",
    a: "A mesma ideia gera vídeo curto (Reels/Shorts/TikTok), vídeo longo (YouTube), carrossel (5–10 slides), post estático, artigo de blog SEO e até e-book PDF para lead-magnet. Você escolhe quais formatos quer gerar para cada tema. O calendário editorial distribui pela semana automaticamente.",
  },
  {
    q: "Os roteiros respeitam o CFP?",
    a: "Cada roteiro passa por um system prompt orientado pelas Resoluções CFP nº 011/2018 e correlatas — evita promessas terapêuticas, sensacionalismo e revelação de casos. Você sempre tem o controle final na aprovação. O agente também tem filtros: nunca dá diagnóstico, nunca substitui consulta.",
  },
  {
    q: "Quanto tempo leva para gerar um vídeo?",
    a: "Do tema à versão final: 8 a 12 minutos no modo padrão. Com motor premium pode levar até 25 minutos pela qualidade superior. A publicação automática nas redes acontece após sua aprovação no WhatsApp.",
  },
  {
    q: "Como funcionam os créditos de vídeo premium?",
    a: "Cada plano inclui uma quantidade de créditos mensais (Pro: 10, Scale: 30). Um crédito = um vídeo gerado com motor premium. Vídeos no modo padrão não consomem crédito. Quando precisar de mais, compra pacotes avulsos via Pix (10/30/70 créditos) sem mudar de plano.",
  },
  {
    q: "Como cancelo a assinatura?",
    a: "Cancelamento imediato no painel. Sem multa, sem fidelidade. Os vídeos que você já gerou permanecem publicados nas redes — eles são seus, com seu rosto e sua voz.",
  },
];

export default function PlatformFAQ() {
  const [openFaq, setOpenFaq] = useState<number>(0);

  return (
    <section id="faq" className="bg-pp-surface py-24 px-7">
      <div className="mx-auto max-w-[760px]">
        <div className="text-center mb-11">
          <p className="text-[13px] uppercase tracking-[0.18em] text-pp-accent font-semibold mb-[14px]">
            FAQ
          </p>
          <h2 className="font-display font-bold text-[clamp(30px,4vw,48px)] leading-[1.08] tracking-[-0.01em] text-pp-ink">
            Perguntas frequentes
          </h2>
        </div>

        <div className="flex flex-col gap-3">
          {FAQS.map((item, i) => {
            const open = openFaq === i;
            return (
              <div
                key={item.q}
                className="bg-pp-card border border-pp-border rounded-[14px] overflow-hidden"
              >
                <button
                  type="button"
                  id={`faq-q-${i}`}
                  onClick={() => setOpenFaq((cur) => (cur === i ? -1 : i))}
                  aria-expanded={open}
                  aria-controls={`faq-a-${i}`}
                  className="w-full flex items-center justify-between gap-4 px-[22px] py-5 bg-transparent border-0 cursor-pointer text-left font-display font-semibold text-[17px] text-pp-ink"
                >
                  {item.q}
                  <ChevronDown
                    aria-hidden="true"
                    className={`w-5 h-5 shrink-0 text-pp-accent transition-transform duration-300 ${
                      open ? "rotate-180" : "rotate-0"
                    }`}
                  />
                </button>
                <div
                  id={`faq-a-${i}`}
                  role="region"
                  aria-labelledby={`faq-q-${i}`}
                  aria-hidden={!open}
                  className="overflow-hidden transition-[max-height,opacity] [transition-duration:400ms] ease-out"
                  style={{
                    maxHeight: open ? "360px" : "0px",
                    opacity: open ? 1 : 0,
                  }}
                >
                  <p className="px-[22px] pb-5 m-0 text-[14.5px] leading-[1.6] text-pp-muted">
                    {item.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
