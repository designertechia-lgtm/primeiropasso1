import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Upload, X, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  currentUrl: string | null;
  onUploaded: (url: string) => void;
  folder: string; // e.g. "logos" or "photos"
  variant?: "logo" | "avatar" | "wide";
  className?: string;
  accept?: string;
  /** Opt-in: clique na imagem (ou na lupa) abre a visualização ampliada num Dialog. */
  expandable?: boolean;
}

export default function ImageUpload({ currentUrl, onUploaded, folder, variant = "logo", className, accept = "image/*", expandable = false }: ImageUploadProps) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);
  // Falha ao CARREGAR a imagem (404/503 transitório). Só mostra aviso — NUNCA
  // zera o campo (onUploaded("")), senão um piscar da rede apagaria a foto do form.
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setPreview(currentUrl);
    setLoadError(false);
  }, [currentUrl]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file || !user) return;

    const isVideo = file.type.startsWith("video/");
    const isImage = file.type.startsWith("image/");
    // Bucket público: aceita só mídia (imagem/vídeo). Bloqueia HTML/SVG/etc. que poderiam
    // ser servidos e explorados a partir do domínio do storage (auditoria §5).
    if (!isVideo && !isImage) {
      toast.error("Formato não suportado", { description: "Envie um arquivo de imagem ou vídeo." });
      input.value = "";
      return;
    }
    const maxSize = isVideo ? 20 * 1024 * 1024 : 5 * 1024 * 1024; // 20MB para vídeo, 5MB para imagem

    if (file.size > maxSize) {
      toast.error("Arquivo muito grande", {
        description: isVideo ? "Máximo de 20MB para vídeos." : "Máximo de 5MB para imagens."
      });
      input.value = ""; // libera reescolher o mesmo arquivo depois de trocá-lo
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${folder}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("images").upload(path, file, { upsert: true });

    if (error) {
      toast.error("Erro no upload", { description: error.message });
      setUploading(false);
      input.value = "";
      return;
    }

    // NÃO deletamos o arquivo antigo aqui. O banco (photo_url etc.) só muda quando o
    // FORMULÁRIO salva; deletar no upload/troca deixaria a URL antiga apontando para um
    // arquivo inexistente se o usuário descartar as alterações → avatar 404 na landing e
    // nas telas do paciente (auditoria B1). O antigo vira órfão no bucket — trade-off aceito.
    const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    setLoadError(false);
    setPreview(publicUrl);
    onUploaded(publicUrl);
    setUploading(false);
    // Reset do input: sem isso, reescolher o MESMO arquivo (após X ou falha) não dispara
    // onChange e nada acontece (padrão de PublishPanel).
    input.value = "";
    toast.success(isVideo ? "Vídeo enviado!" : "Imagem enviada!");
  };

  const isAvatar = variant === "avatar";
  const isWide   = variant === "wide";
  const isPreviewVideo = preview && /\.(mp4|webm|ogg|mov|m4v)($|\?)/i.test(preview);

  return (
    <div className={cn("space-y-3", className)}>
      {preview ? (
        <div className={cn("relative", isAvatar ? "w-fit" : isWide ? "w-full" : "inline-block")}>
          {isPreviewVideo ? (
            <video
              src={preview}
              autoPlay
              loop
              muted
              playsInline
              className={cn(
                "object-cover object-center border",
                isAvatar ? "h-[116px] w-[116px] rounded-full"
                  : isWide ? "h-40 w-full rounded-xl"
                  : "h-16 max-w-[200px] rounded-md"
              )}
            />
          ) : loadError ? (
            // Falha ao carregar (rede/storage). Mostra aviso + tentar de novo, SEM apagar o campo.
            <div
              className={cn(
                "flex flex-col items-center justify-center gap-1 border border-dashed border-destructive/40 bg-destructive/5 text-center text-[10px] text-muted-foreground p-2",
                isAvatar ? "h-[116px] w-[116px] rounded-full"
                  : isWide ? "h-40 w-full rounded-xl"
                  : "h-16 max-w-[200px] rounded-md"
              )}
            >
              <span>Não foi possível carregar a imagem.</span>
              <button
                type="button"
                onClick={() => setLoadError(false)}
                className="font-medium text-primary hover:underline"
              >
                Tentar de novo
              </button>
            </div>
          ) : (
            <img
              src={preview}
              alt="Preview"
              onError={() => setLoadError(true)}
              onClick={expandable ? () => setExpanded(true) : undefined}
              className={cn(
                "object-cover object-center border",
                expandable && "cursor-zoom-in",
                isAvatar ? "h-[116px] w-[116px] rounded-full"
                  : isWide ? "h-40 w-full rounded-xl"
                  : "h-16 max-w-[200px] rounded-md"
              )}
            />
          )}
          {expandable && !loadError && !isPreviewVideo && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title="Expandir imagem"
              className="absolute bottom-2 right-2 rounded-full bg-black/50 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/70"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => { setLoadError(false); setPreview(null); onUploaded(""); }}
            className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:opacity-80"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors text-muted-foreground",
            isAvatar ? "h-[116px] w-[116px] rounded-full"
              : isWide ? "h-40 w-full rounded-xl"
              : "h-20 w-full max-w-[200px]"
          )}
        >
          <Upload className="h-5 w-5" />
        </div>
      )}

      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Enviando..." : preview ? "Trocar arquivo" : "Enviar arquivo"}
      </Button>

      {/* Visualização ampliada (opt-in via `expandable`) */}
      {expandable && (
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent className="max-w-4xl p-2 sm:p-3">
            <DialogTitle className="sr-only">Visualização da imagem</DialogTitle>
            {preview && (
              <img
                src={preview}
                alt="Imagem ampliada"
                className="mx-auto max-h-[80vh] w-auto max-w-full rounded-lg object-contain"
              />
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
