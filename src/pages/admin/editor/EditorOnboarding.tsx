/**
 * Boas-vindas do Editor (tour "fase A", pendente desde 10/07).
 *
 * Card de primeira vez que explica o FLUXO em 5 passos. De propósito NÃO é um
 * tour com setas apontando elementos: coach marks presos ao DOM quebram quando
 * o layout muda (e o editor é responsivo e denso). Um guia do fluxo é robusto,
 * leve (sem biblioteca — a máquina do público é fraca) e igualmente útil.
 *
 * Mostrado uma vez (localStorage); reabrível pelo "?" no cabeçalho.
 */
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const VISTO_KEY = "pp-editor-onboarding-visto";

const PASSOS = [
  {
    icone: "🎬",
    titulo: "Bem-vinda ao Editor de Vídeo",
    texto: "Edite seus vídeos aqui, sem instalar nada. Em 5 telas rápidas eu te mostro o essencial — depois é só criar.",
  },
  {
    icone: "📁",
    titulo: "1. Carregue um vídeo",
    texto: "Envie do computador ou escolha um vídeo seu na Biblioteca. Cada edição vira um projeto salvo — você pode sair, voltar e até trocar de computador sem perder nada.",
  },
  {
    icone: "✂️",
    titulo: "2. Corte na linha do tempo",
    texto: "Clique na timeline pra posicionar o cursor, divida e remova os trechos que não quiser. Com pressa? Peça pra IA tirar as pausas e os erros por você.",
  },
  {
    icone: "🎨",
    titulo: "3. Deixe com a sua cara",
    texto: "Legendas automáticas da sua fala (com karaokê!), textos animados, música de fundo, filtros de cor e efeitos. Tudo aparece na tela na hora — o que você vê é o que sai.",
  },
  {
    icone: "📤",
    titulo: "4. Renderize e exporte",
    texto: "Clique em Renderizar e salvar. Depois é só exportar na proporção de cada rede — Reels, Feed ou YouTube — na qualidade e no formato que preferir.",
  },
];

export default function EditorOnboarding({
  aberto, onFechar,
}: { aberto: boolean; onFechar: () => void }) {
  const [i, setI] = useState(0);

  // reinicia no passo 1 sempre que reabrir
  useEffect(() => { if (aberto) setI(0); }, [aberto]);

  const fechar = () => {
    try { localStorage.setItem(VISTO_KEY, "1"); } catch { /* localStorage cheio */ }
    onFechar();
  };
  const ultimo = i === PASSOS.length - 1;
  const p = PASSOS[i];

  return (
    <Dialog open={aberto} onOpenChange={(o) => { if (!o) fechar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="text-4xl mb-1" aria-hidden>{p.icone}</div>
          <DialogTitle>{p.titulo}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed">{p.texto}</p>

        {/* progresso em pontinhos */}
        <div className="flex items-center justify-center gap-1.5 py-1">
          {PASSOS.map((_, j) => (
            <button key={j} type="button" onClick={() => setI(j)}
              aria-label={`Passo ${j + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                j === i ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} />
          ))}
        </div>

        <DialogFooter className="flex-row justify-between gap-2 sm:justify-between">
          <Button variant="ghost" size="sm" onClick={fechar}>
            {ultimo ? "" : "Pular"}
          </Button>
          <div className="flex gap-2">
            {i > 0 && (
              <Button variant="outline" size="sm" onClick={() => setI(i - 1)}>
                Anterior
              </Button>
            )}
            {ultimo ? (
              <Button size="sm" onClick={fechar}>Começar ✨</Button>
            ) : (
              <Button size="sm" onClick={() => setI(i + 1)}>Próximo</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** true se a pessoa ainda não viu o tour (primeira vez no editor). */
export const onboardingPendente = (): boolean => {
  try { return localStorage.getItem(VISTO_KEY) !== "1"; } catch { return false; }
};
