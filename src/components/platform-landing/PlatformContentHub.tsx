import { Link } from "react-router-dom";
import { ArrowRight, Play, Image as ImageIcon } from "lucide-react";

export default function PlatformContentHub() {
  return (
    <section id="conteudo" className="bg-pp-bg py-24 px-7">
      <div className="mx-auto max-w-[1200px]">
        {/* Header */}
        <div className="mb-11 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-[600px]">
            <p className="mb-[14px] text-[13px] font-semibold uppercase tracking-[0.18em] text-pp-accent">
              Central de conteúdo
            </p>
            <h2 className="font-display text-[clamp(30px,4vw,46px)] font-bold leading-[1.08] tracking-[-0.01em] text-pp-ink">
              Vídeos, artigos e notícias{" "}
              <span className="text-pp-accent">publicados por você sem você.</span>
            </h2>
          </div>
          <Link
            to="/cadastro"
            className="inline-flex items-center gap-2 text-[15px] font-semibold text-pp-accent no-underline"
          >
            Ver tudo
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        {/* Cards grid */}
        <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
          {/* Video card */}
          <article className="overflow-hidden rounded-[20px] border border-pp-border bg-pp-card">
            <div className="relative h-[190px] bg-gradient-to-br from-pp-surface to-pp-sage/20">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-14 w-14 text-pp-sage/30" aria-hidden="true" />
              </div>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-[rgba(28,42,30,.55)] backdrop-blur-[2px]">
                  <Play
                    className="h-[26px] w-[26px] fill-white text-white"
                    aria-hidden="true"
                  />
                </div>
              </div>
              <span className="absolute left-3 top-3 rounded-full bg-[rgba(28,42,30,.7)] px-[11px] py-[5px] text-[11.5px] font-semibold text-white backdrop-blur-[4px]">
                Reels · 0:45
              </span>
            </div>
            <div className="p-[22px]">
              <span className="mb-[9px] inline-block text-[11px] font-semibold uppercase tracking-[0.1em] text-pp-accent">
                Vídeo · Ansiedade
              </span>
              <h3 className="mb-2 font-display text-[19px] font-semibold leading-[1.25] text-pp-ink">
                3 sinais de que sua ansiedade está falando por você
              </h3>
              <p className="text-[14px] leading-[1.5] text-pp-muted">
                Gerado com seu avatar e sua voz. Publicado automaticamente no Instagram e
                TikTok.
              </p>
            </div>
          </article>

          {/* Article card */}
          <article className="overflow-hidden rounded-[20px] border border-pp-border bg-pp-card">
            <div className="relative h-[190px] bg-gradient-to-br from-pp-surface to-pp-sage/20">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-14 w-14 text-pp-sage/30" aria-hidden="true" />
              </div>
              <span className="absolute left-3 top-3 rounded-full bg-[rgba(248,244,239,.92)] px-[11px] py-[5px] text-[11.5px] font-semibold text-pp-accent">
                Blog · SEO
              </span>
            </div>
            <div className="p-[22px]">
              <span className="mb-[9px] inline-block text-[11px] font-semibold uppercase tracking-[0.1em] text-pp-accent">
                Artigo · Autoestima
              </span>
              <h3 className="mb-2 font-display text-[19px] font-semibold leading-[1.25] text-pp-ink">
                Por que a autocrítica não é a mesma coisa que disciplina
              </h3>
              <p className="text-[14px] leading-[1.5] text-pp-muted">
                Artigo de 800 palavras otimizado para busca, com a mesma ideia do vídeo da
                semana.
              </p>
            </div>
          </article>

          {/* News / carousel card */}
          <article className="overflow-hidden rounded-[20px] border border-pp-border bg-pp-card">
            <div className="relative h-[190px] bg-gradient-to-br from-pp-surface to-pp-sage/20">
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <ImageIcon className="h-14 w-14 text-pp-sage/30" aria-hidden="true" />
              </div>
              <span className="absolute left-3 top-3 rounded-full bg-[rgba(248,244,239,.92)] px-[11px] py-[5px] text-[11.5px] font-semibold text-pp-accent">
                Carrossel · LinkedIn
              </span>
            </div>
            <div className="p-[22px]">
              <span className="mb-[9px] inline-block text-[11px] font-semibold uppercase tracking-[0.1em] text-pp-accent">
                Notícia · Relacionamentos
              </span>
              <h3 className="mb-2 font-display text-[19px] font-semibold leading-[1.25] text-pp-ink">
                O ciclo invisível que sabota suas relações
              </h3>
              <p className="text-[14px] leading-[1.5] text-pp-muted">
                Carrossel de 7 slides para o feed profissional — distribuído pelo calendário
                editorial.
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
