import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Leaf, Menu, X } from "lucide-react";
import { useState } from "react";

interface LandingHeaderProps {
  professionalName?: string;
  whatsapp?: string;
  logoUrl?: string;
  slug?: string;
}

export default function LandingHeader({ professionalName, whatsapp, logoUrl, slug }: LandingHeaderProps) {
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const whatsappLink = whatsapp
    ? `https://wa.me/${whatsapp.replace(/\D/g, "")}?text=Olá! Gostaria de agendar uma consulta.`
    : "#";

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to={slug ? `/${slug}` : "/"} className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt={professionalName} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <Leaf className="h-7 w-7 text-primary" />
          )}
          <span className="font-serif text-lg font-semibold text-foreground">
            {professionalName || "Primeiro Passo"}
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
          <button onClick={() => scrollTo("hero")} className="hover:text-foreground transition-colors">Início</button>
          <button onClick={() => scrollTo("about")} className="hover:text-foreground transition-colors">Sobre</button>
          <button onClick={() => scrollTo("content")} className="hover:text-foreground transition-colors">Conteúdos</button>
          <button onClick={() => scrollTo("contact")} className="hover:text-foreground transition-colors">Contato</button>
          {user ? (
            <Link to="/minha-conta">
              <Button variant="outline" size="sm">Minha Conta</Button>
            </Link>
          ) : (
            <Link to="/login">
              <Button variant="outline" size="sm">Entrar</Button>
            </Link>
          )}
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
            <Button size="sm">Agendar Consulta</Button>
          </a>
        </nav>

        {/* Mobile toggle */}
        <button className="md:hidden text-foreground" onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Mobile nav */}
      {menuOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 pb-4 space-y-3">
          <button onClick={() => scrollTo("hero")} className="block w-full text-left py-2 text-sm text-muted-foreground hover:text-foreground">Início</button>
          <button onClick={() => scrollTo("about")} className="block w-full text-left py-2 text-sm text-muted-foreground hover:text-foreground">Sobre</button>
          <button onClick={() => scrollTo("content")} className="block w-full text-left py-2 text-sm text-muted-foreground hover:text-foreground">Conteúdos</button>
          <button onClick={() => scrollTo("contact")} className="block w-full text-left py-2 text-sm text-muted-foreground hover:text-foreground">Contato</button>
          {user ? (
            <Link to="/minha-conta" className="block"><Button variant="outline" size="sm" className="w-full">Minha Conta</Button></Link>
          ) : (
            <Link to="/login" className="block"><Button variant="outline" size="sm" className="w-full">Entrar</Button></Link>
          )}
          <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="block">
            <Button size="sm" className="w-full">Agendar Consulta</Button>
          </a>
        </div>
      )}
    </header>
  );
}
