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
            {displayImage ? (
              <img src={displayImage} alt={name} className="rounded-2xl shadow-lg w-full h-auto object-cover" />
            ) : (
              <div className="w-full aspect-square rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
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
                  <span
                    key={a}
                    style={{ animationDelay: `${i * 50}ms` }}
                    className="animate-in fade-in zoom-in-75 duration-300 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 px-3 py-1 text-xs font-medium text-primary shadow-sm"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
