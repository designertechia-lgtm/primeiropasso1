import { Shield, Lock, Award, Youtube } from "lucide-react";

export default function PlatformLogoBar() {
  return (
    <section className="bg-pp-surface2 border-b border-pp-border py-[26px] px-7">
      <div className="mx-auto max-w-[1100px]">
        <p className="text-center text-[11.5px] uppercase tracking-[0.18em] text-pp-muted2 font-semibold mb-4">
          Conformidade clínica · Publicação automática
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-[30px] gap-y-[14px]">
          <span className="inline-flex items-center gap-2 text-[14px] font-medium text-[#5a5045]">
            <Shield className="w-[17px] h-[17px] stroke-pp-accent" aria-hidden />
            CFP nº 011/2018
          </span>
          <span className="inline-flex items-center gap-2 text-[14px] font-medium text-[#5a5045]">
            <Lock className="w-[17px] h-[17px] stroke-pp-accent" aria-hidden />
            LGPD
          </span>
          <span className="inline-flex items-center gap-2 text-[14px] font-medium text-[#5a5045]">
            <Award className="w-[17px] h-[17px] stroke-pp-accent" aria-hidden />
            Roteiros validados em TCC
          </span>
          <span className="w-px h-[22px] bg-pp-border" aria-hidden />
          <span className="inline-flex items-center gap-2 text-[14px] font-medium text-pp-muted2">
            <Youtube className="w-[17px] h-[17px] stroke-pp-sand" aria-hidden />
            Instagram · Facebook · TikTok · YouTube · Threads
          </span>
        </div>
      </div>
    </section>
  );
}
