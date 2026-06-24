import { Link } from "react-router-dom";
import { ShieldCheck, Lock, Heart } from "lucide-react";

export default function PlatformFooter() {
  return (
    <footer className="bg-pp-forest-deep px-7 pb-8 pt-16 text-pp-bg">
      <div className="mx-auto grid max-w-[1200px] gap-10 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
        {/* Coluna marca */}
        <div className="col-span-1 sm:col-span-2 min-w-[240px] max-w-[380px]">
          <a
            href="#hero"
            className="flex items-center gap-[10px] font-display text-[21px] font-semibold text-pp-bg no-underline"
          >
            <img
              src="/brand/logo-mark.svg"
              alt="Primeiro Passo"
              width={36}
              height={36}
              className="block rounded-[11px]"
            />
            Primeiro Passo
          </a>
          <p className="mb-[18px] mt-4 text-[14px] leading-[1.6] text-pp-bg/60">
            Landing, agente de WhatsApp e central de conteúdo para terapeutas que
            valorizam tempo e conformidade clínica.
          </p>
          <div className="flex flex-wrap gap-[10px]">
            <span className="inline-flex items-center gap-[7px] rounded-full border border-pp-bg/[.12] bg-pp-bg/[.07] px-3 py-[6px] text-[12px] text-pp-bg/75">
              <ShieldCheck
                className="h-[14px] w-[14px] text-pp-sage"
                aria-hidden="true"
              />
              CFP 011/2018
            </span>
            <span className="inline-flex items-center gap-[7px] rounded-full border border-pp-bg/[.12] bg-pp-bg/[.07] px-3 py-[6px] text-[12px] text-pp-bg/75">
              <Lock
                className="h-[14px] w-[14px] text-pp-sage"
                aria-hidden="true"
              />
              LGPD
            </span>
          </div>
        </div>

        {/* Plataforma */}
        <div>
          <h3 className="mb-4 font-inter text-[12px] font-semibold uppercase tracking-[0.12em] text-pp-bg">
            Plataforma
          </h3>
          <div className="flex flex-col gap-[11px]">
            <a
              href="#como-funciona"
              className="text-[14px] text-pp-bg/[.62] no-underline"
            >
              Como funciona
            </a>
            <a href="#conteudo" className="text-[14px] text-pp-bg/[.62] no-underline">
              Conteúdo
            </a>
            <a href="#precos" className="text-[14px] text-pp-bg/[.62] no-underline">
              Preços
            </a>
            <a href="#faq" className="text-[14px] text-pp-bg/[.62] no-underline">
              FAQ
            </a>
          </div>
        </div>

        {/* Conta */}
        <div>
          <h3 className="mb-4 font-inter text-[12px] font-semibold uppercase tracking-[0.12em] text-pp-bg">
            Conta
          </h3>
          <div className="flex flex-col gap-[11px]">
            <Link to="/login" className="text-[14px] text-pp-bg/[.62] no-underline">
              Entrar
            </Link>
            <Link to="/cadastro" className="text-[14px] text-pp-bg/[.62] no-underline">
              Cadastrar
            </Link>
          </div>
        </div>

        {/* Legal */}
        <div>
          <h3 className="mb-4 font-inter text-[12px] font-semibold uppercase tracking-[0.12em] text-pp-bg">
            Legal
          </h3>
          <div className="flex flex-col gap-[11px]">
            <a href="#" className="text-[14px] text-pp-bg/[.62] no-underline">
              Termos de uso
            </a>
            <a href="#" className="text-[14px] text-pp-bg/[.62] no-underline">
              Privacidade
            </a>
            <a href="#" className="text-[14px] text-pp-bg/[.62] no-underline">
              Contato
            </a>
          </div>
        </div>
      </div>

      {/* Barra inferior */}
      <div className="mx-auto mt-12 flex max-w-[1200px] flex-wrap items-center justify-between gap-3 border-t border-pp-bg/10 pt-6">
        <span className="text-[12.5px] text-pp-bg/50">
          © 2026 Primeiro Passo · Todos os direitos reservados
        </span>
        <span className="inline-flex items-center gap-[6px] text-[12.5px] text-pp-bg/50">
          Feito com{" "}
          <Heart
            className="h-[13px] w-[13px] fill-pp-danger text-pp-danger"
            aria-hidden="true"
          />{" "}
          por DesignerTech.io
        </span>
      </div>
    </footer>
  );
}
