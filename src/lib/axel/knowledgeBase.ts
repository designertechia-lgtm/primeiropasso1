/**
 * Base de Conhecimento do Axel (versão executável)
 * ------------------------------------------------
 * Fonte de verdade documental: src/data/axel/conhecimento.md
 *
 * Centraliza TODO o conteúdo do Axel (intenções, respostas, ações e
 * sugestões de continuidade), separando-o da camada de UI. Isso facilita
 * manutenção, testes e evolução do atendimento.
 *
 * Diretriz de texto: linguagem natural e objetiva, sem marcação Markdown
 * (o chat renderiza texto puro) e com uso comedido de emojis.
 */

import type { MatchableIntent } from "./intentEngine";

export interface KbAction {
  label: string;
  href?: string;
  /** Ação interna disparada no chat (ex.: "open-feedback", "onboarding"). */
  action?: string;
}

export type KbCategory =
  | "greeting"
  | "faq"
  | "smalltalk"
  | "feedback"
  | "onboarding"
  | "content"
  | "support";

export interface KbIntent extends MatchableIntent {
  category: KbCategory;
  answer: string;
  actions?: KbAction[];
  /** Perguntas sugeridas exibidas como "chips" para manter o fluxo. */
  followUps?: string[];
}

/**
 * Intenções dinâmicas: o conteúdo é montado em tempo real pelo chat
 * (ex.: checklist de onboarding com progresso real). Aqui ficam apenas
 * as palavras-chave e a categoria.
 */
export const DYNAMIC_INTENTS: KbIntent[] = [
  {
    id: "onboarding",
    category: "onboarding",
    priority: 2,
    keywords: [
      "onboarding",
      "ambientar",
      "ambientacao",
      "comecar",
      "começar",
      "primeiros passos",
      "iniciar",
      "tour",
      "me ajuda a comecar",
      "por onde comeco",
      "configurar tudo",
    ],
    answer: "", // montado dinamicamente (checklist + progresso)
  },
  {
    id: "content",
    category: "content",
    priority: 2,
    keywords: [
      "criar conteudo",
      "produzir conteudo",
      "conteudo",
      "video",
      "videos",
      "roteiro",
      "marketing",
      "campanha",
      "postar",
      "publicar",
      "artigo",
      "post",
      "reels",
      "estudio viral",
    ],
    answer: "", // montado dinamicamente (menu de conteúdo)
  },
  {
    id: "feedback",
    category: "feedback",
    priority: 2,
    keywords: [
      "feedback",
      "sugestao",
      "sugestão",
      "sugerir",
      "bug",
      "erro",
      "problema",
      "melhoria",
      "reclamar",
      "reclamacao",
      "opiniao",
      "opinião",
      "elogio",
    ],
    answer:
      "Sua opinião vale muito. 💡 Vou abrir o formulário rapidinho: você escolhe o tipo (sugestão, bug, dúvida, elogio), escreve sua mensagem e, se quiser, dá uma nota de 0 a 10.",
    actions: [{ label: "Abrir formulário de feedback", action: "open-feedback" }],
  },
];

/**
 * Saudações (também acessível ao digitar "oi", "bom dia" etc.).
 * O texto base é personalizado no chat com o nome do profissional.
 */
export const GREETING_INTENT: KbIntent = {
  id: "greeting",
  category: "greeting",
  priority: 1,
  keywords: [
    "oi",
    "ola",
    "olá",
    "hey",
    "eai",
    "e ai",
    "bom dia",
    "boa tarde",
    "boa noite",
    "tudo bem",
    "hello",
    "start",
    "menu",
  ],
  answer:
    "Olá! 👋 Eu sou o Axel, seu assistente do PrimeiroPasso.\n\nPosso te ajudar com:\n\n- Ambientação: te guio pela plataforma passo a passo\n- Conteúdo: roteiros de vídeos e materiais de marketing\n- Dúvidas: explico qualquer funcionalidade\n- Feedback: ouço suas sugestões\n\nPor onde quer começar?",
  actions: [
    { label: "Quero me ambientar", action: "onboarding" },
    { label: "Criar conteúdo", action: "content-creation" },
    { label: "Tirar dúvidas", action: "faq" },
    { label: "Dar feedback", action: "open-feedback" },
  ],
};

/**
 * Small talk — conversa natural que reconduz a uma ação útil.
 */
export const SMALLTALK_INTENTS: KbIntent[] = [
  {
    id: "thanks",
    category: "smalltalk",
    keywords: ["obrigado", "obrigada", "valeu", "brigado", "agradeço", "show", "perfeito obrigado"],
    answer: "Por nada! 😊 Tô sempre por aqui. Se precisar de mais alguma coisa, é só chamar.",
    followUps: ["Ver meu progresso de ambientação", "Criar um conteúdo"],
  },
  {
    id: "affirmative",
    category: "smalltalk",
    keywords: ["sim", "quero", "vamos", "bora", "pode ser", "claro", "com certeza"],
    answer:
      "Boa! Me diz o que você quer fazer:\n\n- Ambientação: continuar de onde paramos\n- Conteúdo: vídeos, artigos e posts\n- Dúvidas: sobre qualquer funcionalidade\n- Feedback: sugestões ou problemas",
    actions: [
      { label: "Ambientação", action: "onboarding" },
      { label: "Conteúdo", action: "content-creation" },
    ],
  },
  {
    id: "bye",
    category: "smalltalk",
    keywords: ["tchau", "ate mais", "até mais", "ate logo", "falou", "ja vou", "obrigado tchau"],
    answer: "Até logo! 👋 Qualquer dúvida, é só me chamar aqui. Bom trabalho!",
  },
  {
    id: "who-are-you",
    category: "smalltalk",
    keywords: ["quem e voce", "quem é você", "o que voce faz", "seu nome", "voce e um robo", "voce e uma ia"],
    answer:
      "Eu sou o Axel, seu assistente aqui no PrimeiroPasso. Ajudo você a configurar a plataforma, criar conteúdo de marketing e tirar dúvidas, tudo por aqui mesmo, no chat. Como posso ajudar?",
    followUps: ["Como funciona a Agenda?", "Quero me ambientar"],
  },
];

/**
 * FAQ — explicações sobre cada funcionalidade da plataforma.
 */
export const FAQ_INTENTS: KbIntent[] = [
  {
    id: "agenda",
    category: "faq",
    keywords: ["agenda", "horario", "horarios", "disponibilidade", "consultas", "agendar", "bloquear horario"],
    answer:
      "A Agenda é onde você gerencia seus horários e consultas:\n\n1. Acesse a Agenda no menu\n2. Na aba Disponibilidade, defina seus horários semanais\n3. Os pacientes agendam online nos horários livres\n\nQuer abrir agora?",
    actions: [{ label: "Ir para Agenda", href: "/admin/agenda" }],
    followUps: ["Como ativar a teleconsulta?", "Como bloquear um dia?"],
  },
  {
    id: "clientes",
    category: "faq",
    keywords: ["cliente", "clientes", "paciente", "pacientes", "lead", "leads", "crm", "pipeline", "kanban", "funil"],
    answer:
      "O CRM de Clientes organiza seus pacientes em etapas (Novo, Em Conversa, Proposta, Agendado, Ativo, Inativo).\n\nVocê pode arrastar os cards entre as colunas, abrir um card para ver detalhes e conversas, e ativar ou desativar o Agente IA por lead.\n\nVamos lá?",
    actions: [{ label: "Ir para Clientes", href: "/admin/clientes" }],
    followUps: ["Como conectar o WhatsApp?", "O que faz o Agente IA?"],
  },
  {
    id: "perfil",
    category: "faq",
    keywords: ["perfil", "foto", "crp", "bio", "biografia", "informacoes", "dados profissionais", "abordagem"],
    answer:
      "No Perfil você cadastra suas informações profissionais: nome, CRP, e-mail, telefone, foto, biografia, abordagens terapêuticas e links das redes sociais.\n\nUm perfil completo passa mais confiança aos pacientes. Vamos completar?",
    actions: [{ label: "Ir para Perfil", href: "/admin/perfil" }],
    followUps: ["Como personalizar minha Landing Page?"],
  },
  {
    id: "landing",
    category: "faq",
    keywords: ["landing", "pagina", "página", "site", "publico", "público", "pagina publica", "hero"],
    answer:
      "Sua Landing Page é a página pública que os pacientes veem. Ela traz o destaque com sua foto e chamada, a seção de como você ajuda, sua biografia, preços e o botão de agendamento online.\n\nQue tal personalizar?",
    actions: [{ label: "Ir para Landing Page", href: "/admin/landing" }],
    followUps: ["Como completar meu Perfil?", "Como definir meus preços?"],
  },
  {
    id: "assinatura",
    category: "faq",
    keywords: ["assinatura", "plano", "pagar", "pagamento", "pix", "credito", "creditos", "cobranca", "renovar"],
    answer:
      "Na Assinatura você gerencia seu plano atual, o pagamento via PIX, o saldo de créditos para IA avançada e o histórico de pagamentos.\n\nManter a assinatura ativa garante tudo funcionando.",
    actions: [{ label: "Ir para Assinatura", href: "/admin/assinatura" }],
    followUps: ["Para que servem os créditos?"],
  },
  {
    id: "whatsapp",
    category: "faq",
    keywords: ["whatsapp", "zap", "conectar whatsapp", "evolution", "qr code", "qrcode", "integracao whatsapp"],
    answer:
      "O WhatsApp é integrado à plataforma. Para conectar:\n\n1. Vá em Clientes\n2. Clique em WhatsApp no topo\n3. Escaneie o QR Code com seu celular\n4. Pronto, os leads conversam com você pelo WhatsApp\n\nVamos configurar?",
    actions: [{ label: "Configurar WhatsApp", href: "/admin/clientes" }],
    followUps: ["O que faz o Agente IA?"],
  },
  {
    id: "teleconsulta",
    category: "faq",
    keywords: ["teleconsulta", "videochamada", "online", "remoto", "consulta online", "atendimento online"],
    answer:
      "A Teleconsulta acontece direto na plataforma, com videochamada integrada (sem precisar de Zoom ou Meet) e link gerado automaticamente por consulta, para você e para o paciente. Tudo a partir da Agenda.",
    actions: [{ label: "Ver Agenda", href: "/admin/agenda" }],
    followUps: ["Como configurar minha disponibilidade?"],
  },
  {
    id: "agente-ia",
    category: "faq",
    keywords: ["agente ia", "agente", "ia responde", "responder sozinho", "automatico", "bot whatsapp"],
    answer:
      "O Agente IA responde seus leads no WhatsApp automaticamente, com base nas suas informações e tom de voz. Você ativa ou desativa por lead na tela de Clientes, mantendo o controle total.\n\nQuer ver onde fica?",
    actions: [{ label: "Ir para Clientes", href: "/admin/clientes" }],
    followUps: ["Como conectar o WhatsApp?"],
  },
];

/** Direcionamento para suporte humano. */
export const SUPPORT_INTENT: KbIntent = {
  id: "support",
  category: "support",
  keywords: ["suporte", "atendente", "humano", "falar com alguem", "ajuda urgente", "nao resolve", "não resolve"],
  answer:
    "Sem problema. Se precisar de um atendimento humano ou tiver algo mais complexo, registre pelo feedback que a equipe recebe e retorna. Posso abrir pra você?",
  actions: [{ label: "Registrar para o suporte", action: "open-feedback" }],
};

/** Todas as intenções pesquisáveis pelo motor de intenção. */
export const ALL_INTENTS: KbIntent[] = [
  GREETING_INTENT,
  ...DYNAMIC_INTENTS,
  ...SMALLTALK_INTENTS,
  ...FAQ_INTENTS,
  SUPPORT_INTENT,
];

/** Mensagens de fallback (rotacionadas) quando nada é entendido. */
export const FALLBACK_RESPONSES: string[] = [
  "Hmm, ainda não captei isso. 🤔 Mas posso te ajudar com ambientação na plataforma, criação de conteúdo, dúvidas sobre funcionalidades ou feedback. Qual desses faz sentido agora?",
  "Não tenho certeza sobre isso ainda. Que tal um destes caminhos: tour pela plataforma, ajuda para criar conteúdo, dúvidas comuns ou enviar feedback? Se preferir, posso registrar sua dúvida para o suporte.",
];

/** Ações sugeridas junto ao fallback. */
export const FALLBACK_ACTIONS: KbAction[] = [
  { label: "Me ambientar", action: "onboarding" },
  { label: "Criar conteúdo", action: "content-creation" },
  { label: "FAQ", action: "faq" },
  { label: "Falar com suporte", action: "open-feedback" },
];

/** Menu de produção de conteúdo (usado pela intenção dinâmica "content"). */
export const CONTENT_MENU = {
  content:
    "Produção de conteúdo. Como posso ajudar?\n\n- Vídeos: roteiros para vídeos terapêuticos\n- Artigos: posts com carrossel de imagens\n- Redes sociais: estratégia e calendário\n- Estúdio Viral: conteúdo de impacto rápido\n\nO que te interessa mais?",
  actions: [
    { label: "Criar vídeo", href: "/admin/redes-sociais?tab=criar-video" },
    { label: "Escrever artigo", href: "/admin/redes-sociais?tab=artigos" },
    { label: "Redes Sociais", href: "/admin/redes-sociais" },
  ] as KbAction[],
  followUps: ["Ideias de tema para vídeo", "Como criar um carrossel?"],
};

/** Texto do menu de FAQ (usado pela ação "faq"). */
export const FAQ_MENU_TEXT =
  "Dúvidas frequentes. Pode perguntar sobre qualquer funcionalidade:\n\n- Agenda: horários, consultas, bloqueios\n- Clientes: CRM, leads, pipeline\n- Conteúdo: artigos, vídeos, posts\n- Perfil: informações, foto, redes\n- Landing Page: página profissional\n- Assinatura: planos, pagamentos, créditos\n- WhatsApp: conexão e Agente IA\n- Teleconsulta: videochamadas\n\nÉ só perguntar. 😊";

export const FAQ_MENU_FOLLOWUPS = [
  "Como configurar a Agenda?",
  "Como conectar o WhatsApp?",
  "Como personalizar minha Landing?",
];
