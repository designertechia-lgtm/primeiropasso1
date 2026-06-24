import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Conteúdo", href: "#conteudo" },
  { label: "Preços", href: "#precos" },
  { label: "FAQ", href: "#faq" },
];

export default function PlatformHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 14);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-[background-color,color,box-shadow,border-color] [transition-duration:350ms] ease-out ${
        scrolled
          ? "bg-[rgba(245,240,235,.92)] backdrop-blur-[10px] text-pp-ink border-b border-pp-border shadow-[0_1px_3px_rgba(0,0,0,.06)]"
          : "bg-transparent text-pp-bg border-b border-transparent"
      }`}
    >
      <div className="mx-auto max-w-[1200px] h-[74px] px-7 flex items-center justify-between gap-4">
        <a
          href="#hero"
          className="flex items-center gap-[10px] font-display font-semibold text-[21px] tracking-[-0.01em] text-inherit no-underline"
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

        <nav
          className="hidden md:flex items-center gap-[30px]"
          aria-label="Navegação principal"
        >
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-[14.5px] font-medium text-inherit opacity-[.78] no-underline transition-opacity hover:opacity-100 focus-visible:opacity-100 rounded"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/login"
            className="text-[14.5px] font-medium text-inherit opacity-[.85] no-underline transition-opacity hover:opacity-100 rounded"
          >
            Entrar
          </Link>
          <Link
            to="/cadastro"
            className="inline-flex items-center justify-center h-[42px] px-5 rounded-[10px] bg-pp-sage text-pp-forest text-[14.5px] font-semibold no-underline shadow-[0_4px_14px_rgba(135,169,107,.35)] transition-transform hover:-translate-y-[1px]"
          >
            Cadastrar grátis
          </Link>
        </div>

        <button
          type="button"
          className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-inherit transition-colors hover:bg-pp-sage/15"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? (
            <X className="h-5 w-5" aria-hidden />
          ) : (
            <Menu className="h-5 w-5" aria-hidden />
          )}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-pp-border bg-[rgba(245,240,235,.96)] backdrop-blur-[10px] text-pp-ink">
          <div className="mx-auto max-w-[1200px] px-7 py-4 flex flex-col gap-3">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMobileOpen(false)}
                className="text-base font-medium text-pp-ink/80 hover:text-pp-ink transition-colors py-2 no-underline"
              >
                {l.label}
              </a>
            ))}
            <div className="flex items-center gap-3 pt-2">
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="flex-1 inline-flex items-center justify-center h-[42px] rounded-[10px] border border-pp-border text-pp-ink text-[14.5px] font-medium no-underline"
              >
                Entrar
              </Link>
              <Link
                to="/cadastro"
                onClick={() => setMobileOpen(false)}
                className="flex-1 inline-flex items-center justify-center h-[42px] rounded-[10px] bg-pp-sage text-pp-forest text-[14.5px] font-semibold no-underline shadow-[0_4px_14px_rgba(135,169,107,.35)]"
              >
                Cadastrar grátis
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
