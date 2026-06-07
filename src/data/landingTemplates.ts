// ─────────────────────────────────────────────────────────────
// Templates prontos para a Landing Page
// Cada modelo preenche textos + cores + tipografia de uma só vez.
// As imagens, abordagens e contatos do profissional são preservados.
// ─────────────────────────────────────────────────────────────

export interface LandingTemplate {
  id: string;
  name: string;
  description: string;
  /** Cor principal — secundária e fundo são derivadas automaticamente */
  primaryColor: string;
  headingFont: string;
  bodyFont: string;
  fontSize: string;
  hero: { title: string; subtitle: string };
  pain: { title: string; subtitle: string; items: { text: string }[] };
  solution: { title: string; subtitle: string; items: { title: string; desc: string }[] };
  about: { title: string };
  contact: { title: string; subtitle: string };
}

export const LANDING_TEMPLATES: LandingTemplate[] = [
  {
    id: "acolhedor",
    name: "Acolhedor & Humano",
    description: "Tom caloroso e empático. Ideal para criar conexão imediata.",
    primaryColor: "#87A96B",
    headingFont: "playfair",
    bodyFont: "lato",
    fontSize: "md",
    hero: {
      title: "Um espaço seguro para você se reencontrar",
      subtitle: "Acolhimento, escuta e cuidado para atravessar seus momentos mais difíceis.",
    },
    pain: {
      title: "Você não precisa carregar tudo sozinho(a)",
      subtitle: "Reconhecer o que se sente é o primeiro passo. Talvez você se identifique com algumas dessas situações:",
      items: [
        { text: "Ansiedade que aperta o peito sem motivo aparente" },
        { text: "Pensamentos acelerados que não dão trégua" },
        { text: "Dificuldade para dormir e descansar de verdade" },
        { text: "Sensação de estar sempre no limite, exausto(a)" },
        { text: "Vontade de mudar, mas sem saber por onde começar" },
      ],
    },
    solution: {
      title: "Como posso te ajudar nessa jornada",
      subtitle: "Um processo terapêutico humano, no seu ritmo, com técnicas baseadas em evidências.",
      items: [
        { title: "Escuta sem julgamentos", desc: "Um espaço 100% sigiloso onde você pode ser quem realmente é." },
        { title: "Autoconhecimento", desc: "Compreenda seus padrões emocionais e o que está por trás deles." },
        { title: "Ferramentas práticas", desc: "Estratégias concretas para o seu dia a dia, não só teoria." },
        { title: "Caminho no seu tempo", desc: "Respeitamos o seu ritmo, sem pressa e sem cobranças." },
      ],
    },
    about: { title: "Prazer, será um prazer te acompanhar" },
    contact: {
      title: "Dê o primeiro passo hoje",
      subtitle: "Agende uma conversa inicial e descubra como a terapia pode transformar a sua relação consigo mesmo(a).",
    },
  },
  {
    id: "clinico",
    name: "Clínico & Profissional",
    description: "Transmite seriedade e confiança. Ideal para abordagem técnica.",
    primaryColor: "#5B8DB8",
    headingFont: "montserrat",
    bodyFont: "opensans",
    fontSize: "md",
    hero: {
      title: "Cuidado especializado em saúde mental",
      subtitle: "Atendimento psicológico ético, baseado em evidências científicas e centrado em você.",
    },
    pain: {
      title: "Quando os sintomas começam a impactar sua rotina",
      subtitle: "Buscar ajuda profissional é um ato de cuidado. Veja sinais que merecem atenção:",
      items: [
        { text: "Crises de ansiedade ou ataques de pânico recorrentes" },
        { text: "Desânimo persistente e perda de interesse" },
        { text: "Dificuldade de concentração e queda de produtividade" },
        { text: "Conflitos frequentes nos relacionamentos" },
        { text: "Alterações no sono, no apetite ou na energia" },
      ],
    },
    solution: {
      title: "Uma abordagem estruturada e eficaz",
      subtitle: "Conduzo o processo terapêutico com método, clareza de objetivos e acompanhamento contínuo.",
      items: [
        { title: "Avaliação inicial", desc: "Entendimento aprofundado da sua demanda e definição de um plano." },
        { title: "Metas terapêuticas", desc: "Objetivos claros e mensuráveis para o seu processo." },
        { title: "Base científica", desc: "Intervenções fundamentadas em evidências e práticas atualizadas." },
        { title: "Acompanhamento", desc: "Reavaliações periódicas para garantir a evolução do tratamento." },
      ],
    },
    about: { title: "Conheça o profissional que vai te atender" },
    contact: {
      title: "Agende sua avaliação inicial",
      subtitle: "Entre em contato para marcar a primeira sessão e iniciar um acompanhamento profissional.",
    },
  },
  {
    id: "moderno",
    name: "Moderno & Direto",
    description: "Visual contemporâneo e linguagem objetiva. Ideal para público jovem.",
    primaryColor: "#2E7D82",
    headingFont: "poppins",
    bodyFont: "inter",
    fontSize: "md",
    hero: {
      title: "Sua saúde mental em primeiro lugar",
      subtitle: "Terapia descomplicada, online e do seu jeito. Comece quando estiver pronto(a).",
    },
    pain: {
      title: "Bateu aquele cansaço que não passa?",
      subtitle: "Você não está sozinho(a). Muita gente sente o mesmo e não sabe nomear:",
      items: [
        { text: "Ansiedade que atrapalha o foco e o sono" },
        { text: "Sensação de estar travado(a) na vida" },
        { text: "Autocrítica que nunca dá folga" },
        { text: "Dificuldade de impor limites" },
        { text: "Aquela vontade de recomeçar, mas sem direção" },
      ],
    },
    solution: {
      title: "Terapia que cabe na sua vida",
      subtitle: "Um processo prático, acolhedor e sem enrolação para você evoluir de verdade.",
      items: [
        { title: "100% online", desc: "Sessões de onde você estiver, com total privacidade." },
        { title: "Sem julgamentos", desc: "Um espaço leve para falar o que precisar." },
        { title: "Resultados reais", desc: "Ferramentas que você aplica já no dia seguinte." },
        { title: "No seu ritmo", desc: "Sem pressão, sem fórmula pronta. É sobre você." },
      ],
    },
    about: { title: "Oi! Que bom te ver por aqui" },
    contact: {
      title: "Bora começar?",
      subtitle: "Manda uma mensagem e agende sua primeira sessão. O primeiro passo é mais simples do que parece.",
    },
  },
  {
    id: "sereno",
    name: "Sereno & Delicado",
    description: "Atmosfera tranquila e suave. Ideal para mindfulness e bem-estar.",
    primaryColor: "#9B8EC4",
    headingFont: "lora",
    bodyFont: "raleway",
    fontSize: "md",
    hero: {
      title: "Respire fundo. Você chegou ao lugar certo",
      subtitle: "Um convite ao autocuidado, à presença e ao reencontro com o seu equilíbrio interior.",
    },
    pain: {
      title: "Quando a mente não encontra descanso",
      subtitle: "Há sinais sutis de que sua alma pede uma pausa. Talvez você reconheça alguns:",
      items: [
        { text: "Inquietação constante, mesmo nos momentos de pausa" },
        { text: "Dificuldade de estar presente no agora" },
        { text: "Cansaço emocional que o sono não resolve" },
        { text: "Sensação de desconexão consigo mesmo(a)" },
        { text: "Desejo de viver com mais leveza e propósito" },
      ],
    },
    solution: {
      title: "Um caminho de volta para si",
      subtitle: "Através de uma escuta cuidadosa, construímos juntos um espaço de calma e clareza.",
      items: [
        { title: "Presença plena", desc: "Práticas para se reconectar com o momento presente." },
        { title: "Equilíbrio emocional", desc: "Aprenda a acolher e regular suas emoções com gentileza." },
        { title: "Autocompaixão", desc: "Cultive uma relação mais amorosa consigo mesmo(a)." },
        { title: "Serenidade", desc: "Encontre pausas de calma em meio à correria do dia." },
      ],
    },
    about: { title: "Será uma honra caminhar ao seu lado" },
    contact: {
      title: "Comece sua jornada de cuidado",
      subtitle: "Reserve um momento para você. Agende uma conversa e dê o primeiro passo rumo ao seu bem-estar.",
    },
  },
];
