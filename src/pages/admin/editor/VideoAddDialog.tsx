/**
 * Diálogo de escolha do 2º vídeo: PiP (sobre o vídeo) ou SEQUÊNCIA (no fim).
 *
 * No modo sequência aceita VÁRIOS arquivos de uma vez — o pai sobe um por vez
 * (fila sequencial: são arquivos de até 200MB e o worker cria um draft por
 * vídeo; paralelo mataria conexão doméstica) e informa o andamento por `fila`.
 *
 * Overlay manual em vez do Dialog do shadcn de propósito: durante a fila o
 * fechamento fica TRAVADO (`ocupado`) — o upload em curso não sobrevive ao
 * desmonte, e o Dialog fecharia no Esc/clique fora.
 */
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Clapperboard, Film, Upload, Loader2, Video as VideoIcon, AlertTriangle,
} from "lucide-react";
import { fmt } from "./types";

/** Andamento do lote: qual arquivo está subindo agora e o que já falhou. */
export type FilaUpload = { atual: number; total: number; nome: string; erros: string[] };

type GaleriaItem = { id: string | number; title?: string; embed_url: string; thumbnail_url?: string };

type Props = {
  modo: "pip" | "seq";
  galeria: GaleriaItem[];
  /** upload/carregamento em curso: trava backdrop, ✕ e entradas */
  ocupado: boolean;
  fila: FilaUpload | null;
  /** posição do cursor (só informativa, no texto do modo PiP) */
  playhead: number;
  onEnviarArquivos: (files: File[]) => void;
  onEscolherGaleria: (v: GaleriaItem) => void;
  onFechar: () => void;
};

export default function VideoAddDialog({
  modo, galeria, ocupado, fila, playhead,
  onEnviarArquivos, onEscolherGaleria, onFechar,
}: Props) {
  const ehPip = modo === "pip";
  // Fechar no backdrop exige um clique DELIBERADO: o gesto tem de começar E
  // terminar no backdrop, e nunca logo após abrir — mouse com defeito dispara
  // um clique fantasma milissegundos depois do clique que abriu o diálogo, e o
  // fantasma caía no backdrop fechando na hora ("não abre nada").
  const abertoEmRef = useRef(Date.now());
  const downNoBackdropRef = useRef(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onMouseDown={(e) => { downNoBackdropRef.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (ocupado) return;
        if (e.target !== e.currentTarget || !downNoBackdropRef.current) return;
        if (Date.now() - abertoEmRef.current < 400) return;
        onFechar();
      }}>
      <div className="w-full max-w-sm rounded-xl border bg-background p-4 space-y-3 shadow-lg"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          {ehPip ? <Clapperboard className="h-4 w-4 text-primary" />
                 : <Film className="h-4 w-4 text-primary" />}
          <span className="font-semibold text-sm">
            {ehPip ? "Vídeo sobre o vídeo (PiP)" : "Emendar vídeos no fim"}
          </span>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 ml-auto"
            disabled={ocupado} onClick={onFechar}>✕</Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          {ehPip
            ? <>Entra no cursor ({fmt(playhead)}) como uma janela sobre o vídeo —
               arraste no player para posicionar; mova/estique na faixa rosa.</>
            : <>Entram DEPOIS do fim da edição atual, emendados na sequência —
               bom para juntar takes ou montar um vídeo maior com vários curtos.
               Pode escolher <b>vários arquivos de uma vez</b>; depois é só clicar
               no <b>✂</b> de cada bloco para cortar antes de montar.</>}
        </p>

        {/* andamento do lote: fica no lugar da lista para o olho não se dividir */}
        {fila && (
          <div className="rounded-lg border bg-muted/40 px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
              <span className="font-medium">Enviando {fila.atual} de {fila.total}</span>
              <span className="truncate text-muted-foreground">— {fila.nome}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all"
                style={{ width: `${(fila.atual / Math.max(1, fila.total)) * 100}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Um de cada vez, para não sobrecarregar o envio. Pode acompanhar aqui —
              só não feche nem recarregue o navegador.
            </p>
          </div>
        )}

        {fila?.erros.length ? (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" /> {fila.erros.length} não subiram
            </div>
            {fila.erros.map((er, i) => (
              <p key={i} className="text-[10px] text-muted-foreground break-words">{er}</p>
            ))}
          </div>
        ) : null}

        <label className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed p-2.5 text-xs cursor-pointer hover:border-primary/60 transition">
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {ehPip ? "Enviar vídeo do computador" : "Enviar vídeos do computador"}
          <input type="file" className="hidden"
            accept="video/mp4,video/quicktime,video/webm,video/x-matroska"
            multiple={!ehPip}
            disabled={ocupado}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) onEnviarArquivos(ehPip ? [files[0]] : files);
              e.target.value = "";
            }} />
        </label>

        <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
          {galeria.length === 0 && (
            <p className="text-xs text-muted-foreground">Sem vídeos na galeria — envie um arquivo acima.</p>
          )}
          {galeria.map((v) => (
            <button key={v.id} type="button" disabled={ocupado}
              onClick={() => onEscolherGaleria(v)}
              className="w-full flex items-center gap-2 rounded-lg border p-1.5 text-left text-xs hover:border-primary/60 transition disabled:opacity-50">
              {v.thumbnail_url
                ? <img src={v.thumbnail_url} className="h-10 w-7 rounded object-cover shrink-0" alt="" />
                : <div className="h-10 w-7 rounded bg-muted flex items-center justify-center shrink-0"><VideoIcon className="h-3.5 w-3.5" /></div>}
              <span className="truncate">{v.title || "Sem título"}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
