import { Button } from "@/components/ui/button";
import { Sparkles, Film } from "lucide-react";
import { Link } from "react-router-dom";

export default function AdminVideos() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vídeos</h1>
          <p className="text-muted-foreground mt-1">Crie e gerencie seus vídeos de conteúdo.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild>
            <Link to="/admin/criar-video" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Criar Vídeo
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/criar-video-pro" className="flex items-center gap-2">
              <Film className="h-4 w-4" />
              Criar Vídeo PRO
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Film className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold">Nenhum vídeo criado</h3>
          <p className="text-muted-foreground text-sm mt-1">
            Comece criando seu primeiro vídeo clicando no botão acima.
          </p>
        </div>
      </div>
    </div>
  );
}
