import { splitHeadline } from "@/lib/landing/sections";

interface VillainSectionProps {
  title?: string;
  // Pode conter múltiplos parágrafos separados por "\n" — cada um vira um <p>.
  body?: string;
  imageUrl?: string;
}

// Default acolhedor: nomeia a causa-raiz sem culpar quem está lendo e aponta que há saída.
const DEFAULT_TITLE = "Por que nada do que você tentou funcionou até agora?";
const DEFAULT_BODY = [
  "Se você já tentou de tudo e nada durou, isso não é falta de esforço nem uma \"falha\" sua. Na maioria das vezes, o que trava a mudança não está à vista: é uma causa mais profunda que ninguém te ajudou a enxergar, então você seguiu tratando os sintomas enquanto a raiz continuava intacta.",
  "A boa notícia é que, quando se olha para a raiz certa, existe caminho. Entender de onde vem o que você sente muda tudo — e é exatamente aí que um acompanhamento cuidadoso faz diferença.",
].join("\n");

export default function VillainSection({ title, body, imageUrl }: VillainSectionProps) {
  const displayTitle = title || DEFAULT_TITLE;
  const displayBody = (body && body.trim() !== "") ? body : DEFAULT_BODY;
  const [titleLead, titleAccent] = splitHeadline(displayTitle);

  // Quebra o corpo em parágrafos por linha, descartando linhas vazias.
  const paragraphs = displayBody
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p !== "");

  const hasImage = !!(imageUrl && imageUrl.trim() !== "");

  const Header = (
    <div className={`flex flex-col gap-5 ${hasImage ? "items-start text-left" : "items-center text-center"}`}>
      <h2 className="font-heading text-3xl md:text-4xl font-bold text-foreground leading-[1.15] tracking-tight text-balance">
        {titleLead}{titleAccent ? <> <span className="text-primary">{titleAccent}</span></> : null}
      </h2>
      <span aria-hidden className="block h-1 w-16 rounded-full bg-gradient-to-r from-primary to-accent opacity-80" />
    </div>
  );

  const Body = (
    <div className={`flex flex-col gap-4 ${hasImage ? "" : "text-center"}`}>
      {paragraphs.map((p, i) => (
        <p key={i} className="text-foreground/80 text-base md:text-lg leading-relaxed text-pretty">
          {p}
        </p>
      ))}
    </div>
  );

  return (
    <>
      {/* Auras decorativas (o fundo base vem do <Section> via zebra) */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] -z-10 opacity-70 animate-pulse" style={{ animationDuration: '8s' }} />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/10 rounded-full blur-[100px] -z-10 opacity-70 animate-pulse" style={{ animationDuration: '10s' }} />

      <div className="container mx-auto px-4 md:px-8 relative z-10">
        {hasImage ? (
          <div className="grid md:grid-cols-2 gap-10 items-center max-w-6xl mx-auto">
            <div className="flex flex-col gap-6">
              {Header}
              {Body}
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/10 to-accent/10 rounded-[2rem] blur-2xl -z-10" />
              <img
                src={imageUrl}
                alt=""
                className="w-full h-auto object-cover rounded-3xl border border-foreground/5 shadow-2xl"
              />
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto flex flex-col items-center gap-8">
            {Header}
            {Body}
          </div>
        )}
      </div>
    </>
  );
}
