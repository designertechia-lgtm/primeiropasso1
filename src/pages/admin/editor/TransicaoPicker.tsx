/**
 * Seletor de TRANSIÇÃO com miniatura animada por opção.
 *
 * Um select de nomes ("Warp", "Radial") não diz o que a transição faz — cada
 * cartão anima dois retângulos fazendo o movimento, do jeito que os apps de
 * edição mostram. É ILUSTRAÇÃO do movimento, não prévia do vídeo: o player não
 * consegue tocar um xfade (ver `AvisoPrevia`), quem aplica de verdade é o render.
 *
 * Usado em 3 lugares com o MESMO componente: o losango entre blocos da trilha,
 * o cortador de clipe ("entre as partes") e a linha Acabamento.
 */
import { Info } from "lucide-react";
import { TRANSICOES, TRANSICAO_FAMILIAS } from "./filtros";

/**
 * Aviso do que a prévia NÃO mostra.
 *
 * O player toca UMA fonte por vez comandada pelo relógio (previewClock): tocar
 * um crossfade exigiria compor dois vídeos quadro a quadro num canvas, e a
 * máquina do público não aguenta isso ao vivo. Em vez de deixar o usuário achar
 * que a transição não funcionou, a tela DIZ onde ela aparece.
 */
export function AvisoPrevia({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-start gap-2 rounded-lg border border-amber-400/60 bg-amber-50 px-2.5 py-2 text-[11px] leading-snug text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200 ${className}`}>
      <Info className="mt-px h-4 w-4 shrink-0 text-amber-500" />
      <span>
        <b>A prévia não toca a transição.</b> No player você vê os clipes trocando
        em corte seco — a transição escolhida é aplicada na hora de gerar o vídeo
        e aparece no arquivo final (e em "Meus Vídeos").
      </span>
    </div>
  );
}

/** Miniatura animada de uma transição (A azul → B âmbar). */
export function TransicaoDemo({ anim, className = "" }: { anim: string; className?: string }) {
  return (
    <div className={`pp-tr rounded-sm ${className}`} aria-hidden="true">
      <div className={`pp-tr-b pp-tr-a-${anim}`} />
    </div>
  );
}

type Props = {
  value: string;
  onChange: (id: string) => void;
  /** Rótulo da opção "none" — no cortador ela é o padrão e merece nome próprio. */
  labelNone?: string;
  compacto?: boolean;
};

export default function TransicaoPicker({ value, onChange, labelNone, compacto }: Props) {
  return (
    <div className={compacto ? "space-y-2" : "space-y-3"}>
      {TRANSICAO_FAMILIAS.map((fam) => {
        const itens = TRANSICOES.filter((t) => t.familia === fam.id);
        if (!itens.length) return null;
        return (
          <div key={fam.id}>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {fam.label}
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {itens.map((t) => {
                const ativo = t.id === value;
                return (
                  <button key={t.id} type="button"
                    onClick={() => onChange(t.id)}
                    title={t.label}
                    aria-pressed={ativo}
                    className={`group rounded-lg border p-1 text-left transition ${
                      ativo ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:border-primary/50"}`}>
                    <TransicaoDemo anim={t.anim} className="h-8 w-full" />
                    <span className={`mt-1 block truncate text-[9px] leading-tight ${
                      ativo ? "font-medium text-primary" : "text-muted-foreground"}`}>
                      {t.id === "none" && labelNone ? labelNone : t.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
