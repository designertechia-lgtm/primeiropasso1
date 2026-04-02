import { Badge } from "@/components/ui/badge";

interface AboutSectionProps {
  name?: string;
  bio?: string;
  crp?: string;
  photoUrl?: string;
  aboutImageUrl?: string;
  approaches?: string[];
}

export default function AboutSection({ name, bio, crp, photoUrl, aboutImageUrl, approaches }: AboutSectionProps) {
  const displayImage = aboutImageUrl || photoUrl;
  return (
    <section id="about" className="py-16 md:py-24 bg-muted/50">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 gap-12 items-center max-w-5xl mx-auto">
          <div className="flex justify-center">
            {photoUrl ? (
              <img src={photoUrl} alt={name} className="rounded-2xl shadow-lg max-h-[400px] object-cover" />
            ) : (
              <div className="w-full max-w-xs aspect-square rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <span className="text-muted-foreground text-sm">Foto</span>
              </div>
            )}
          </div>
          <div className="space-y-5">
            <h2 className="font-serif text-3xl md:text-4xl font-bold text-foreground">
              Sobre {name || "o(a) Profissional"}
            </h2>
            {crp && (
              <p className="text-sm text-muted-foreground font-medium">CRP: {crp}</p>
            )}
            <p className="text-foreground leading-relaxed whitespace-pre-line">
              {bio || "Profissional dedicado(a) à saúde mental e ao bem-estar emocional, com experiência em Terapia Cognitivo-Comportamental."}
            </p>
            {approaches && approaches.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {approaches.map((a, i) => (
                  <Badge key={i} variant="secondary" className="text-xs">
                    {a}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
