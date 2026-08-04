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

/** Os dois quadros que a miniatura usa: o clipe que SAI e o que ENTRA.
 *  São os frames REAIS do vídeo quando o painel consegue passá-los — é o que
 *  faz o cartão dizer "este quadro vira aquele" em vez de mostrar dois
 *  retângulos coloridos que não explicam nada. */
export type QuadrosDemo = { a?: string; b?: string };

/** Miniatura animada de uma transição: o quadro A é substituído pelo B fazendo
 *  o movimento. ILUSTRAÇÃO do movimento, não prévia do vídeo (ver `AvisoPrevia`).
 *  `atraso` (0-4) escalona o início para os cartões não ficarem todos idênticos. */
export function TransicaoDemo({
  anim, className = "", quadros, atraso = 0,
}: { anim: string; className?: string; quadros?: QuadrosDemo; atraso?: number }) {
  return (
    <div className={`pp-tr rounded-sm ${atraso ? `pp-tr-d${atraso}` : ""} ${className}`}
      aria-hidden="true">
      {quadros?.a && <img src={quadros.a} alt="" draggable={false} />}
      <div className={`pp-tr-b pp-tr-a-${anim}`}>
        {quadros?.b && <img src={quadros.b} alt="" draggable={false} />}
      </div>
    </div>
  );
}

type Props = {
  value: string;
  onChange: (id: string) => void;
  /** Rótulo da opção "none" — no cortador ela é o padrão e merece nome próprio. */
  labelNone?: string;
  compacto?: boolean;
  /** Quadros reais desta emenda (o último do clipe que sai, o 1º do que entra). */
  quadros?: QuadrosDemo;
};

export default function TransicaoPicker({
  value, onChange, labelNone, compacto, quadros,
}: Props) {
  return (
    <div className={compacto ? "space-y-2" : "space-y-3"}>
      <p className="text-[10px] leading-snug text-muted-foreground">
        Cada quadrinho mostra <b>como um clipe vira o outro</b>
        {quadros?.a || quadros?.b
          ? " — com os quadros do seu próprio vídeo."
          : " (o desenho ilustra o movimento)."}
      </p>
      {TRANSICAO_FAMILIAS.map((fam) => {
        const itens = TRANSICOES.filter((t) => t.familia === fam.id);
        if (!itens.length) return null;
        return (
          <div key={fam.id}>
            <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {fam.label}
            </div>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {itens.map((t, i) => {
                const ativo = t.id === value;
                return (
                  <button key={t.id} type="button"
                    onClick={() => onChange(t.id)}
                    title={t.label}
                    aria-pressed={ativo}
                    className={`group rounded-lg border p-1 text-left transition ${
                      ativo ? "border-primary ring-1 ring-primary bg-primary/5" : "hover:border-primary/50"}`}>
                    <TransicaoDemo anim={t.anim} quadros={quadros}
                      atraso={i % 5} className="h-10 w-full" />
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
