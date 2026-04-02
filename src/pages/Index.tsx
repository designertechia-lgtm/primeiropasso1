import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Leaf, ArrowRight } from "lucide-react";

export default function Index() {
  const { user, isProfessional, isPatient } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-50">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <Link to="/" className="flex items-center gap-2">
            <Leaf className="h-7 w-7 text-primary" />
            <span className="font-serif text-lg font-semibold text-foreground">Primeiro Passo</span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Link to={isProfessional ? "/admin" : "/minha-conta"}>
                <Button size="sm">Minha Conta</Button>
              </Link>
            ) : (
              <>
                <Link to="/login"><Button variant="outline" size="sm">Entrar</Button></Link>
                <Link to="/cadastro"><Button size="sm">Cadastrar</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-background to-secondary/10" />
        <div className="container mx-auto px-4 py-24 md:py-40 relative text-center">
          <h1 className="font-serif text-4xl md:text-6xl lg:text-7xl font-bold text-foreground mb-6 max-w-4xl mx-auto leading-tight">
            O primeiro passo para o seu bem-estar começa aqui
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Conecte-se com profissionais qualificados em saúde mental. Agende sua consulta de forma prática e segura.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/cadastro">
              <Button size="lg" className="text-base gap-2">
                Comece Agora <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 md:py-24 bg-muted/50">
        <div className="container mx-auto px-4">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground text-center mb-12">
            Como funciona
          </h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: "1", title: "Encontre seu profissional", desc: "Navegue pelos perfis e encontre o profissional que mais se conecta com suas necessidades." },
              { step: "2", title: "Agende sua consulta", desc: "Escolha o horário ideal na agenda do profissional, tudo online e prático." },
              { step: "3", title: "Comece sua jornada", desc: "Inicie o acompanhamento terapêutico e dê o primeiro passo para uma vida com mais equilíbrio." },
            ].map((item) => (
              <div key={item.step} className="text-center p-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground font-bold text-lg mb-4">
                  {item.step}
                </div>
                <h3 className="font-serif text-xl font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA for professionals */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
            É profissional de saúde mental?
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto mb-8">
            Crie sua página personalizada, gerencie sua agenda e receba pacientes de forma organizada.
          </p>
          <Link to="/cadastro">
            <Button size="lg" variant="outline" className="text-base gap-2">
              Criar Minha Página <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground text-background py-10">
        <div className="container mx-auto px-4 text-center text-sm text-background/60">
          <Leaf className="h-8 w-8 mx-auto mb-3 opacity-70" />
          <p>© {new Date().getFullYear()} Primeiro Passo — Todos os direitos reservados</p>
        </div>
      </footer>
    </div>
  );
}
