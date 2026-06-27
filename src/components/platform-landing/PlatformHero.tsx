import { Link } from "react-router-dom";
import {
  Leaf,
  ArrowRight,
  CirclePlay,
  Calendar,
  CheckCircle2,
} from "lucide-react";

export default function PlatformHero() {
  return (
    <section
      id="hero"
      className="relative overflow-hidden bg-pp-forest text-pp-bg pt-[150px] pb-24 px-7"
    >
      {/* Vídeo de fundo */}
      <video
        aria-hidden
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        poster="/hero-platform-bg-poster.jpg"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
      >
        <source src="/hero-platform-bg.mp4" type="video/mp4" />
      </video>
      {/* Overlay gradiente escuro p/ legibilidade */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,rgba(18,28,20,.94)_0%,rgba(18,28,20,.82)_50%,rgba(18,28,20,.62)_100%)]"
      />
      {/* Glow radial topo-direita (sage) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[180px] -right-[120px] h-[560px] w-[560px] rounded-full bg-[radial-gradient(circle,rgba(135,169,107,.35),transparent_65%)] pp-anim-glow"
      />
      {/* Glow radial baixo-esquerda (sand) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[220px] -left-[160px] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,rgba(196,168,130,.20),transparent_65%)]"
      />
      {/* Folha decorativa flutuante */}
      <Leaf
        aria-hidden
        strokeWidth={1}
        className="pointer-events-none absolute top-[60px] left-[200px] h-20 w-20 sm:h-[120px] sm:w-[120px] text-pp-bg opacity-[.07] pp-anim-leaf-sway"
      />

      <div className="relative mx-auto grid max-w-[1200px] items-center gap-14 [grid-template-columns:repeat(auto-fit,minmax(min(330px,100%),1fr))]">
        {/* ESQUERDA */}
        <div>
          <h1 className="font-display font-bold text-[clamp(30px,3.8vw,48px)] leading-[1.08] tracking-[-0.02em]">
            A IA que conversa, qualifica e{" "}
            <span className="italic text-pp-sage-light">agenda</span> enquanto
            você atende.
          </h1>
          <p className="mt-6 max-w-[540px] text-[clamp(17px,1.5vw,20px)] leading-[1.6] text-pp-bg/75">
            Axel dá ao seu consultório uma landing personalizada, um
            agente de WhatsApp que marca consultas sozinho e uma central de
            conteúdo que mantém você presente nas redes — tudo em conformidade
            com o CFP.
          </p>

          <div className="mt-[34px] flex flex-wrap gap-[14px]">
            <Link
              to="/cadastro"
              className="inline-flex h-[54px] items-center gap-[9px] rounded-[13px] bg-pp-sage px-[30px] text-[16.5px] font-semibold text-pp-forest shadow-[0_10px_30px_rgba(135,169,107,.4)]"
            >
              Criar conta gratuita
              <ArrowRight aria-hidden strokeWidth={2.2} className="h-[18px] w-[18px]" />
            </Link>
            <a
              href="#como-funciona"
              className="inline-flex h-[54px] items-center gap-[9px] rounded-[13px] border border-pp-bg/30 bg-transparent px-[26px] text-[16.5px] font-medium text-pp-bg"
            >
              <CirclePlay aria-hidden strokeWidth={2} className="h-5 w-5" />
              Ver como funciona
            </a>
          </div>
        </div>

        {/* DIREITA — Mock WhatsApp */}
        <div className="relative justify-self-center">
          {/* Halo radial atrás do card */}
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-[26px] rounded-[38px] bg-[radial-gradient(circle_at_60%_30%,rgba(135,169,107,.35),transparent_70%)] blur-[14px]"
          />

          <div className="relative w-full max-w-[330px] overflow-hidden rounded-[30px] bg-pp-card shadow-[0_40px_80px_-20px_rgba(0,0,0,.55)] pp-anim-float">
            {/* Topbar */}
            <div className="flex items-center gap-[11px] bg-pp-wa-header px-[18px] py-4 text-white">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20">
                <Leaf aria-hidden strokeWidth={2} className="h-[22px] w-[22px] text-white" />
              </div>
              <div className="leading-[1.3]">
                <div className="truncate text-[15px] font-semibold">
                  Axel Seu Assistente Virtual
                </div>
                <div className="flex items-center gap-[5px] text-[11.5px] opacity-85">
                  <span aria-hidden className="h-[6px] w-[6px] rounded-full bg-[#bff2cf]" />
                  online agora
                </div>
              </div>
            </div>

            {/* Corpo do chat */}
            <div className="flex min-h-[300px] flex-col gap-2.5 bg-pp-wa-bg px-4 py-5">
              <div
                className="max-w-[78%] self-start rounded-[4px_14px_14px_14px] bg-white px-[13px] py-[10px] text-[13.5px] leading-[1.45] text-pp-ink shadow-[0_1px_1px_rgba(0,0,0,.06)]"
                style={{ animation: "pp-pop .5s ease both .3s" }}
              >
                Oi! Tenho me sentido muito ansiosa ultimamente e queria marcar uma consulta 🙏
              </div>
              <div
                className="max-w-[80%] self-end rounded-[14px_4px_14px_14px] bg-pp-wa-bubble px-[13px] py-[10px] text-[13.5px] leading-[1.45] text-pp-ink shadow-[0_1px_1px_rgba(0,0,0,.06)]"
                style={{ animation: "pp-pop .5s ease both 1s" }}
              >
                Que bom que você deu esse primeiro passo. A Marina atende online, 50 min. Tenho terça 18h ou quinta 9h. Qual fica melhor?
              </div>
              <div
                className="max-w-[60%] self-start rounded-[4px_14px_14px_14px] bg-white px-[13px] py-[10px] text-[13.5px] leading-[1.45] text-pp-ink shadow-[0_1px_1px_rgba(0,0,0,.06)]"
                style={{ animation: "pp-pop .5s ease both 1.7s" }}
              >
                Quinta 9h 😊
              </div>
              <div
                className="max-w-[82%] self-end rounded-[14px_4px_14px_14px] bg-pp-wa-bubble px-[13px] py-[11px] text-[13.5px] leading-[1.45] text-pp-ink shadow-[0_1px_1px_rgba(0,0,0,.06)]"
                style={{ animation: "pp-pop .5s ease both 2.4s" }}
              >
                Confirmado! ✅ Quinta, 9h. Vou te enviar o link da sala.
                <div className="mt-2 flex items-center gap-[9px] rounded-[10px] bg-white px-[11px] py-[9px]">
                  <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-pp-sage">
                    <Calendar aria-hidden strokeWidth={2} className="h-[18px] w-[18px] text-white" />
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-pp-ink">
                      Consulta agendada
                    </div>
                    <div className="text-[11px] text-pp-muted2">
                      Adicionada à sua agenda
                    </div>
                  </div>
                </div>
              </div>

              {/* Indicador de digitando */}
              <div
                aria-hidden
                className="flex items-center gap-1 self-end rounded-[12px] bg-pp-wa-bubble px-[10px] py-[6px]"
                style={{ animation: "pp-pop .4s ease both 3s" }}
              >
                <span
                  className="h-[6px] w-[6px] rounded-full bg-[#5a7a5e]"
                  style={{ animation: "pp-type 1.2s infinite 0s" }}
                />
                <span
                  className="h-[6px] w-[6px] rounded-full bg-[#5a7a5e]"
                  style={{ animation: "pp-type 1.2s infinite .2s" }}
                />
                <span
                  className="h-[6px] w-[6px] rounded-full bg-[#5a7a5e]"
                  style={{ animation: "pp-type 1.2s infinite .4s" }}
                />
              </div>
            </div>
          </div>

          {/* Cartão flutuante */}
          <div className="absolute -bottom-3 left-2 flex items-center gap-[10px] rounded-[14px] border border-pp-border bg-pp-card px-[15px] py-3 shadow-[0_18px_40px_-12px_rgba(0,0,0,.4)] pp-anim-float2 sm:-bottom-[22px] sm:-left-[34px]">
            <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] bg-pp-sage/15">
              <CheckCircle2 aria-hidden strokeWidth={2} className="h-5 w-5 text-pp-accent" />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-pp-ink">
                Lead já marcado
              </div>
              <div className="text-[11px] text-pp-muted2">sem você intervir</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
