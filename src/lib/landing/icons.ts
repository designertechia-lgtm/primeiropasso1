// Catálogo de ícones das seções da landing (Dores e Soluções).
//
// Por que existe: antes, cada seção tinha um array fixo e o card pegava o ícone pela POSIÇÃO
// (`ICONS[i % ICONS.length]`), então o texto e o ícone não tinham relação nenhuma — uma landing de
// tecnologia herdava os ícones escolhidos para terapeuta, e reordenar um card trocava o ícone de
// todos os seguintes. Agora cada item carrega o próprio `icon`, e este arquivo é a lista fechada de
// nomes aceitos.
//
// A lista é FECHADA de propósito: o mesmo conjunto de nomes vai como `enum` no structured output das
// edge functions (generate-landing e generate-text), o que impede o modelo de devolver um ícone que
// não existe. Ao mexer aqui, espelhe a lista de nomes nas duas edges — elas rodam em Deno e não
// conseguem importar este módulo. Divergência não quebra nada: nome desconhecido cai no fallback.
//
// Só entram ícones que funcionam dentro do círculo de 48–56px com strokeWidth 1.5: silhueta legível,
// sem detalhe fino que suma no tamanho pequeno.

import {
  // Mente & Emoção
  Brain, Heart, HeartCrack, Cloud, CloudRain, Moon, Sparkles, Frown, Smile,
  // Corpo & Saúde
  Activity, HeartPulse, Stethoscope, Bed, Dumbbell, Leaf, Flower2,
  // Tempo & Rotina
  Clock, Timer, Calendar, CalendarClock, Hourglass, AlarmClock, Repeat, RefreshCw,
  // Pessoas & Relações
  Users, User, UserPlus, MessageCircle, MessageSquare, Handshake, Home, Baby,
  // Trabalho & Tecnologia
  Briefcase, Laptop, Code, Bug, Server, Database, Settings, Wrench, Terminal, GitBranch,
  // Alerta & Dificuldade
  AlertTriangle, CircleAlert, OctagonAlert, XCircle, Ban, Flame, TrendingDown, ThumbsDown, BatteryLow,
  // Solução & Conquista
  Lightbulb, Target, CheckCircle2, Shield, ShieldCheck, Rocket, TrendingUp, Award, Trophy, Key,
  Compass, ThumbsUp, Zap,
  // Aprendizado & Caminho
  BookOpen, GraduationCap, Eye, Search, Map, Footprints,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Nome canônico (kebab-case, igual ao do lucide) → componente. Fonte única da verdade. */
export const ICON_REGISTRY = {
  // Mente & Emoção
  "brain": Brain,
  "heart": Heart,
  "heart-crack": HeartCrack,
  "cloud": Cloud,
  "cloud-rain": CloudRain,
  "moon": Moon,
  "sparkles": Sparkles,
  "frown": Frown,
  "smile": Smile,
  // Corpo & Saúde
  "activity": Activity,
  "heart-pulse": HeartPulse,
  "stethoscope": Stethoscope,
  "bed": Bed,
  "dumbbell": Dumbbell,
  "leaf": Leaf,
  "flower": Flower2,
  // Tempo & Rotina
  "clock": Clock,
  "timer": Timer,
  "calendar": Calendar,
  "calendar-clock": CalendarClock,
  "hourglass": Hourglass,
  "alarm-clock": AlarmClock,
  "repeat": Repeat,
  "refresh": RefreshCw,
  // Pessoas & Relações
  "users": Users,
  "user": User,
  "user-plus": UserPlus,
  "message-circle": MessageCircle,
  "message-square": MessageSquare,
  "handshake": Handshake,
  "home": Home,
  "baby": Baby,
  // Trabalho & Tecnologia
  "briefcase": Briefcase,
  "laptop": Laptop,
  "code": Code,
  "bug": Bug,
  "server": Server,
  "database": Database,
  "settings": Settings,
  "wrench": Wrench,
  "terminal": Terminal,
  "git-branch": GitBranch,
  // Alerta & Dificuldade
  "alert-triangle": AlertTriangle,
  "alert-circle": CircleAlert,
  "alert-octagon": OctagonAlert,
  "x-circle": XCircle,
  "ban": Ban,
  "flame": Flame,
  "trending-down": TrendingDown,
  "thumbs-down": ThumbsDown,
  "battery-low": BatteryLow,
  // Solução & Conquista
  "lightbulb": Lightbulb,
  "target": Target,
  "check-circle": CheckCircle2,
  "shield": Shield,
  "shield-check": ShieldCheck,
  "rocket": Rocket,
  "trending-up": TrendingUp,
  "award": Award,
  "trophy": Trophy,
  "key": Key,
  "compass": Compass,
  "thumbs-up": ThumbsUp,
  "zap": Zap,
  // Aprendizado & Caminho
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  "eye": Eye,
  "search": Search,
  "map": Map,
  "footprints": Footprints,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICON_REGISTRY;

/** Todos os nomes aceitos. É esta lista que vira o `enum` do structured output nas edges. */
export const ICON_NAMES = Object.keys(ICON_REGISTRY) as IconName[];

/** Agrupamento só para a UI do seletor — a ordem aqui é a ordem exibida. */
export const ICON_CATEGORIES: Array<{ label: string; icons: IconName[] }> = [
  {
    label: "Mente e emoção",
    icons: ["brain", "heart", "heart-crack", "cloud", "cloud-rain", "moon", "sparkles", "frown", "smile"],
  },
  {
    label: "Corpo e saúde",
    icons: ["activity", "heart-pulse", "stethoscope", "bed", "dumbbell", "leaf", "flower"],
  },
  {
    label: "Tempo e rotina",
    icons: ["clock", "timer", "calendar", "calendar-clock", "hourglass", "alarm-clock", "repeat", "refresh"],
  },
  {
    label: "Pessoas e relações",
    icons: ["users", "user", "user-plus", "message-circle", "message-square", "handshake", "home", "baby"],
  },
  {
    label: "Trabalho e tecnologia",
    icons: ["briefcase", "laptop", "code", "bug", "server", "database", "settings", "wrench", "terminal", "git-branch"],
  },
  {
    label: "Alerta e dificuldade",
    icons: ["alert-triangle", "alert-circle", "alert-octagon", "x-circle", "ban", "flame", "trending-down", "thumbs-down", "battery-low"],
  },
  {
    label: "Solução e conquista",
    icons: ["lightbulb", "target", "check-circle", "shield", "shield-check", "rocket", "trending-up", "award", "trophy", "key", "compass", "thumbs-up", "zap"],
  },
  {
    label: "Aprendizado e caminho",
    icons: ["book-open", "graduation-cap", "eye", "search", "map", "footprints"],
  },
];

/** Termos de busca em PT por ícone — o profissional digita "insônia", não "moon". */
const SEARCH_TERMS: Partial<Record<IconName, string>> = {
  "brain": "cérebro mente pensamento cabeça racional",
  "heart": "coração amor afeto emoção sentimento",
  "heart-crack": "coração partido luto perda mágoa término",
  "cloud": "nuvem confusão nebuloso incerteza",
  "cloud-rain": "chuva tristeza melancolia choro",
  "moon": "lua noite insônia sono dormir madrugada",
  "sparkles": "brilho magia transformação novo especial",
  "frown": "triste infeliz desânimo carinha",
  "smile": "feliz alegria sorriso bem-estar carinha",
  "activity": "batimento pulso energia atividade movimento",
  "heart-pulse": "batimento cardíaco saúde vital ansiedade taquicardia",
  "stethoscope": "médico saúde consulta clínico diagnóstico",
  "bed": "cama sono descanso dormir repouso",
  "dumbbell": "peso exercício academia força treino",
  "leaf": "folha natureza calma leveza orgânico",
  "flower": "flor florescer crescimento beleza desabrochar",
  "clock": "relógio tempo hora atraso pressa",
  "timer": "cronômetro prazo contagem urgência",
  "calendar": "calendário agenda data compromisso",
  "calendar-clock": "agendamento horário marcado prazo",
  "hourglass": "ampulheta tempo esgotando espera demora",
  "alarm-clock": "despertador acordar alarme manhã",
  "repeat": "repetir ciclo loop de novo repetitivo padrão",
  "refresh": "recomeçar renovar atualizar recomeço mudança",
  "users": "pessoas grupo equipe time relacionamento família",
  "user": "pessoa indivíduo você sozinho perfil",
  "user-plus": "novo cliente adicionar pessoa captar lead",
  "message-circle": "mensagem conversa chat falar diálogo",
  "message-square": "comentário recado mensagem feedback",
  "handshake": "acordo parceria confiança negócio aperto de mão",
  "home": "casa lar família ambiente doméstico",
  "baby": "bebê filho criança maternidade paternidade",
  "briefcase": "trabalho maleta profissional carreira emprego negócio",
  "laptop": "computador notebook trabalho remoto tela",
  "code": "código programação desenvolvimento dev",
  "bug": "bug erro falha defeito problema inseto",
  "server": "servidor infraestrutura hospedagem máquina",
  "database": "banco de dados dados armazenamento",
  "settings": "configuração ajuste engrenagem opções",
  "wrench": "ferramenta chave conserto manutenção reparo",
  "terminal": "terminal console linha de comando shell",
  "git-branch": "git branch versionamento ramificação merge",
  "alert-triangle": "alerta atenção perigo aviso risco",
  "alert-circle": "alerta informação atenção importante",
  "alert-octagon": "pare grave crítico urgente",
  "x-circle": "erro falhou negado recusado não",
  "ban": "proibido bloqueado impedido barrado",
  "flame": "fogo urgência incêndio queimar burnout esgotamento",
  "trending-down": "queda piora perda declínio caindo prejuízo",
  "thumbs-down": "ruim negativo insatisfeito reprovado",
  "battery-low": "bateria fraca sem energia exausto cansaço esgotado",
  "lightbulb": "ideia lâmpada insight solução clareza",
  "target": "alvo meta objetivo foco precisão",
  "check-circle": "certo pronto concluído aprovado ok sucesso",
  "shield": "escudo proteção segurança defesa",
  "shield-check": "protegido seguro garantido verificado sigilo",
  "rocket": "foguete lançamento crescimento acelerar decolar",
  "trending-up": "crescimento alta melhora subindo progresso resultado",
  "award": "prêmio medalha reconhecimento qualidade",
  "trophy": "troféu vitória conquista campeão sucesso",
  "key": "chave acesso solução destravar segredo",
  "compass": "bússola direção rumo orientação norte",
  "thumbs-up": "bom positivo aprovado satisfeito curtir",
  "zap": "raio rápido energia agilidade instantâneo",
  "book-open": "livro conhecimento aprender leitura estudo",
  "graduation-cap": "formação curso educação diploma aprendizado",
  "eye": "olho ver enxergar visão observar perceber clareza",
  "search": "buscar procurar lupa investigar encontrar",
  "map": "mapa caminho plano rota guia",
  "footprints": "passos jornada caminhada primeiro passo trajetória",
};

/**
 * Ícones por POSIÇÃO — o comportamento antigo, hoje só usado como fallback de item sem `icon`
 * (landings salvas antes deste campo existir). Não mexa na ordem: ela é o que essas landings
 * renderizam hoje, e reordenar mudaria a tela de quem já está no ar.
 * Vivem aqui, e não em cada seção, porque o editor precisa mostrar no botão o mesmo ícone que a
 * landing usaria.
 */
export const PAIN_FALLBACK_ICONS: LucideIcon[] = [Brain, Moon, Heart, Users, CircleAlert, AlertTriangle];
export const SOLUTION_FALLBACK_ICONS: LucideIcon[] = [Lightbulb, Target, RefreshCw, Shield, Zap, CheckCircle2];

/**
 * Resolve o nome guardado no item para um componente.
 * `fallback` preserva o comportamento antigo (ícone por posição) para itens salvos antes deste
 * campo existir e para nome que não esteja no catálogo — nunca renderiza vazio.
 */
export function resolveIcon(name: string | undefined | null, fallback: LucideIcon): LucideIcon {
  if (name && name in ICON_REGISTRY) return ICON_REGISTRY[name as IconName];
  return fallback;
}

/** true se o nome existe no catálogo (usado para validar o que vem da IA e do banco). */
export function isValidIconName(name: unknown): name is IconName {
  return typeof name === "string" && name in ICON_REGISTRY;
}

/** Busca por nome ou por termo em PT. Query vazia devolve tudo. */
export function searchIcons(query: string): IconName[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICON_NAMES;
  return ICON_NAMES.filter(
    (n) => n.includes(q) || (SEARCH_TERMS[n] ?? "").includes(q),
  );
}
