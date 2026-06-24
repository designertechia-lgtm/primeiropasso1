import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function PlatformCTA() {
  return (
    <section id="cta" className="bg-pp-bg pt-10 pb-[100px] px-7">
      <div className="max-w-[980px] mx-auto">
        <div className="relative rounded-[30px] bg-gradient-to-br from-pp-sage to-pp-accent p-[clamp(48px,7vw,80px)_36px] text-center overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 opacity-30 mix-blend-overlay pointer-events-none bg-[radial-gradient(circle_at_28%_22%,rgba(255,255,255,.5),transparent_50%),radial-gradient(circle_at_80%_75%,rgba(255,255,255,.3),transparent_45%)]"
          />
          <div className="relative">
            <h2 className="font-display font-bold text-[clamp(28px,4vw,46px)] leading-[1.12] tracking-[-0.01em] text-pp-cream mx-auto max-w-[640px]">
              Pronto para postar consistente, sem queimar suas tardes editando?
            </h2>
            <p className="text-[17px] leading-[1.6] text-pp-cream/90 max-w-[520px] mx-auto mt-[18px]">
              Cadastro em menos de 2 minutos. Sem cartão. Primeiro vídeo grátis.
            </p>
            <div className="flex flex-wrap gap-[14px] justify-center mt-8">
              <Link
                to="/cadastro"
                className="inline-flex items-center gap-[9px] h-[54px] px-[30px] rounded-[13px] bg-pp-cream text-pp-accent font-semibold text-[16.5px] no-underline shadow-[0_12px_30px_rgba(0,0,0,.18)]"
              >
                Criar conta gratuita
                <ArrowRight className="w-[18px] h-[18px]" strokeWidth={2.2} aria-hidden />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center h-[54px] px-[26px] rounded-[13px] bg-transparent border border-white/50 text-pp-cream font-medium text-[16.5px] no-underline"
              >
                Já tenho conta
              </Link>
            </div>
            <div className="inline-flex items-center gap-2 mt-[26px] text-[13.5px] text-pp-cream/85">
              <ShieldCheck className="w-4 h-4" strokeWidth={2} aria-hidden />
              Em conformidade com o CFP nº 011/2018 e a LGPD
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
