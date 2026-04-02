import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Video, Users, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export default function AdminDashboard() {
  const { data: professional, isLoading } = useProfessional();

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", professional?.id],
    queryFn: async () => {
      const [articles, videos, leads] = await Promise.all([
        supabase.from("articles").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id),
        supabase.from("videos").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("professional_id", professional!.id),
      ]);
      return {
        articles: articles.count ?? 0,
        videos: videos.count ?? 0,
        leads: leads.count ?? 0,
      };
    },
    enabled: !!professional?.id,
  });

  if (isLoading) {
    return <div className="animate-pulse text-muted-foreground">Carregando...</div>;
  }

  if (!professional) {
    return (
      <div className="text-center py-12 space-y-4">
        <h1 className="font-serif text-2xl font-bold text-foreground">Perfil não encontrado</h1>
        <p className="text-muted-foreground">Seu perfil profissional ainda não foi criado.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Painel</h1>
        <Button variant="outline" size="sm" asChild>
          <a href={`/${professional.slug}`} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Ver minha página
          </a>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link to="/admin/artigos">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Artigos</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.articles ?? 0}</div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin/videos">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Vídeos</CardTitle>
              <Video className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.videos ?? 0}</div>
            </CardContent>
          </Card>
        </Link>

        <Link to="/admin/leads">
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Novos Pacientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.leads ?? 0}</div>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
