import { CircleAlert, Brain, Heart, Moon, Users } from "lucide-react";

export default function PainSection() {
  const symptoms = [
    { icon: Brain, text: "Pensamentos acelerados que não param" },
    { icon: Moon, text: "Dificuldade para dormir ou descansar de verdade" },
    { icon: Heart, text: "Ansiedade que aperta o peito sem motivo aparente" },
    { icon: Users, text: "Relacionamentos que desgastam ao invés de nutrir" },
    { icon: CircleAlert, text: "Sensação de que algo precisa mudar, mas não sabe por onde começar" },
  ];

  return (
    <section className="py-16 md:py-24 bg-muted/50">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-4">
            Você sente que seus pensamentos estão no controle?
          </h2>
          <p className="text-muted-foreground text-lg">
            Reconhecer o que você sente é o primeiro passo. Se você se identifica com algum desses sinais, saiba que não precisa enfrentar isso sozinho(a).
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {symptoms.map((s, i) => (
            <div key={i} className="flex items-start gap-3 bg-card p-5 rounded-xl border border-border shadow-sm">
              <s.icon className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-foreground text-sm leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
