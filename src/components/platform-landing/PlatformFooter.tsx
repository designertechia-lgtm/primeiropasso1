import { Link } from "react-router-dom";
import { ShieldCheck, Lock } from "lucide-react";

const YEAR = new Date().getFullYear();

export default function PlatformFooter() {
  return (
    <footer className="bg-muted/40 border-t border-border">
      <div className="container mx-auto max-w-6xl px-4 py-12 md:py-16">
        <div className="grid md:grid-cols-4 gap-10 md:gap-8">
          <div className="md:col-span-2 max-w-sm">
            <span className="font-serif text-xl font-semibold text-foreground">
              Primeiro Passo
            </span>
            <p className="text-sm text-foreground/70 leading-relaxed mt-3">
              Pipeline de vídeos curtos de TCC com avatar real, voz clonada e
              publicação automática para terapeutas que valorizam tempo e
              conformidade.
            </p>
            <div className="flex flex-wrap gap-3 mt-5">
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground/70 px-2.5 py-1 rounded-full bg-card border border-border">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
                CFP 011/2018
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-foreground/70 px-2.5 py-1 rounded-full bg-card border border-border">
                <Lock className="h-3.5 w-3.5 text-primary" aria-hidden />
                LGPD
              </span>
            </div>
          </div>

          <div>
            <h3 className="font-serif text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
              Plataforma
            </h3>
            <ul className="flex flex-col gap-2.5">
              <li>
                <a
                  href="#como-funciona"
                  className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                >
                  Como funciona
                </a>
              </li>
              <li>
                <a
                  href="#precos"
                  className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                >
                  Preços
                </a>
              </li>
              <li>
                <a
                  href="#faq"
                  className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                >
                  FAQ
                </a>
              </li>
              <li>
                <Link
                  to="/cadastro"
                  className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                >
                  Cadastrar
                </Link>
              </li>
              <li>
                <Link
                  to="/login"
                  className="text-sm text-foreground/70 hover:text-foreground transition-colors"
                >
                  Entrar
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-serif text-sm font-semibold text-foreground mb-4 uppercase tracking-wider">
              Legal
            </h3>
            <ul className="flex flex-col gap-2.5">
              <li>
                <span className="text-sm text-foreground/70">Termos de uso</span>
              </li>
              <li>
                <span className="text-sm text-foreground/70">
                  Política de privacidade
                </span>
              </li>
              <li>
                <span className="text-sm text-foreground/70">
                  Contato
                </span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-foreground/60">
            © {YEAR} Primeiro Passo · Todos os direitos reservados
          </p>
          <p className="text-xs text-foreground/60">
            Feito para terapeutas que valorizam tempo e ética clínica
          </p>
        </div>
      </div>
    </footer>
  );
}
