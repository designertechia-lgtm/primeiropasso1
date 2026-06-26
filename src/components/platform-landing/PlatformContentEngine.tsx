import { useState } from "react";
import { Lightbulb } from "lucide-react";

type Format = { f: string; d: string; tag: string };
type Theme = { tab: string; idea: string; formats: Format[] };

const THEMES: Theme[] = [
  {
    tab: "Ansiedade",
    idea: "“3 sinais de que sua ansiedade está falando por você”",
    formats: [
      { f: "Vídeo curto", d: "Reels de 45s com seu avatar", tag: "Instagram" },
      { f: "Carrossel", d: "7 slides ilustrados", tag: "Facebook" },
      { f: "Artigo", d: "Blog SEO · 800 palavras", tag: "Site" },
      { f: "Post estático", d: "Citação visual", tag: "Feed" },
      { f: "E-book", d: "Lead-magnet em PDF", tag: "WhatsApp" },
    ],
  },
  {
    tab: "Autoestima",
    idea: "“Por que a autocrítica não é a mesma coisa que disciplina”",
    formats: [
      { f: "Vídeo longo", d: "YouTube · 6 min", tag: "YouTube" },
      { f: "Reels", d: "Corte vertical de 30s", tag: "TikTok" },
      { f: "Carrossel", d: "5 slides com exercício", tag: "Instagram" },
      { f: "Artigo", d: "Blog SEO · 1.000 palavras", tag: "Site" },
      { f: "Newsletter", d: "Resumo da semana", tag: "E-mail" },
    ],
  },
  {
    tab: "Relacionamentos",
    idea: "“O ciclo invisível que sabota suas relações”",
    formats: [
      { f: "Reels", d: "Storytelling de 50s", tag: "Instagram" },
      { f: "Carrossel", d: "8 slides com diagrama", tag: "Facebook" },
      { f: "Post estático", d: "Antes / depois visual", tag: "Feed" },
      { f: "Artigo", d: "Blog SEO · 900 palavras", tag: "Site" },
      { f: "E-book", d: "Guia em PDF", tag: "WhatsApp" },
    ],
  },
];

export default function PlatformContentEngine() {
  const [activeTheme, setActiveTheme] = useState(0);
  const active = THEMES[activeTheme];

  return (
    <section className="relative overflow-hidden bg-pp-forest text-pp-bg py-24 px-7">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[680px] w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(135,169,107,.18),transparent_65%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-[1100px]">
        <div className="mx-auto mb-11 max-w-[680px] text-center">
          <p className="mb-3.5 text-[13px] font-semibold uppercase tracking-[0.18em] text-pp-sage-light">
            O motor de conteúdo
          </p>
          <h2 className="font-display text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.01em]">
            Escolha um tema.{" "}
            <span className="italic text-pp-sage-light">
              Receba a semana inteira.
            </span>
          </h2>
        </div>

        <div>
          <div
            role="tablist"
            aria-label="Temas de conteúdo"
            className="mb-[34px] flex flex-wrap justify-center gap-2.5"
          >
            {THEMES.map((theme, i) => {
              const isActive = activeTheme === i;
              return (
                <button
                  key={theme.tab}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  id={`pp-tab-${i}`}
                  aria-controls={`pp-tabpanel-${i}`}
                  onClick={() => setActiveTheme(i)}
                  className={
                    "rounded-full border px-5 py-2.5 text-[14.5px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pp-sage-light focus-visible:ring-offset-2 focus-visible:ring-offset-pp-forest " +
                    (isActive
                      ? "border-pp-sage bg-pp-sage text-pp-forest"
                      : "border-pp-bg/20 bg-transparent text-pp-bg/70")
                  }
                >
                  {theme.tab}
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            id={`pp-tabpanel-${activeTheme}`}
            aria-labelledby={`pp-tab-${activeTheme}`}
            tabIndex={0}
            className="grid items-center gap-[30px] [grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pp-sage-light focus-visible:ring-offset-2 focus-visible:ring-offset-pp-forest"
          >
            <div className="rounded-[22px] border border-pp-sage/30 bg-pp-sage/10 p-8 text-center">
              <div className="mb-3.5 text-[12px] font-semibold uppercase tracking-[0.14em] text-pp-sage-light">
                Sua ideia
              </div>
              <div className="mx-auto mb-[18px] flex h-[60px] w-[60px] items-center justify-center rounded-[16px] bg-pp-sage">
                <Lightbulb className="h-[30px] w-[30px] stroke-pp-forest" aria-hidden />
              </div>
              <p className="m-0 font-display text-[20px] italic leading-[1.35] text-pp-bg">
                {active.idea}
              </p>
            </div>

            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))]">
              {active.formats.map((fmt) => (
                <div
                  key={fmt.f}
                  className="rounded-[14px] border border-pp-bg/10 bg-[#243524] p-4"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[14.5px] font-semibold text-pp-bg">
                      {fmt.f}
                    </span>
                    <span className="rounded-full bg-pp-sage/20 px-2 py-[3px] text-[10.5px] font-semibold text-pp-sage-light">
                      {fmt.tag}
                    </span>
                  </div>
                  <p className="m-0 text-[12.5px] leading-[1.4] text-pp-bg/60">
                    {fmt.d}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
