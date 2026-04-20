import { useRef, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageUploadProps {
  currentUrl: string | null;
  onUploaded: (url: string) => void;
  folder: string; // e.g. "logos" or "photos"
  variant?: "logo" | "avatar" | "wide";
  className?: string;
}

export default function ImageUpload({ currentUrl, onUploaded, folder, variant = "logo", className }: ImageUploadProps) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(currentUrl);

  useEffect(() => {
    setPreview(currentUrl);
  }, [currentUrl]);

  const deleteFromStorage = async (url: string) => {
    try {
      const withoutQuery = url.split("?")[0];
      const match = withoutQuery.split("/object/public/images/")[1];
      if (match) await supabase.storage.from("images").remove([decodeURIComponent(match)]);
    } catch {
      // silently ignore delete errors
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande", { description: "Máximo de 5MB." });
      return;
    }

    setUploading(true);
    const oldUrl = preview;
    const ext = file.name.split(".").pop();
    const path = `${user.id}/${folder}/${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from("images").upload(path, file, { upsert: true });

    if (error) {
      toast.error("Erro no upload", { description: error.message });
      setUploading(false);
      return;
    }

    // só deleta a antiga após o novo upload ter sucesso
    if (oldUrl) await deleteFromStorage(oldUrl);

    const { data: urlData } = supabase.storage.from("images").getPublicUrl(path);
    const publicUrl = urlData.publicUrl;
    setPreview(publicUrl);
    onUploaded(publicUrl);
    setUploading(false);
    toast.success("Imagem enviada!");
  };

  const isAvatar = variant === "avatar";
  const isWide   = variant === "wide";

  return (
    <div className={cn("space-y-3", className)}>
      {preview ? (
        <div className={cn("relative", isAvatar ? "w-fit" : isWide ? "w-full" : "inline-block")}>
          <img
            src={preview}
            alt="Preview"
            onError={() => { setPreview(null); onUploaded(""); }}
            className={cn(
              "object-cover object-center border",
              isAvatar ? "h-[116px] w-[116px] rounded-full"
                : isWide ? "h-40 w-full rounded-xl"
                : "h-16 max-w-[200px] rounded-md"
            )}
          />
          <button
            type="button"
            onClick={async () => { if (preview) await deleteFromStorage(preview); setPreview(null); onUploaded(""); }}
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

      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? "Enviando..." : preview ? "Trocar imagem" : "Enviar imagem"}
      </Button>
    </div>
  );
}
