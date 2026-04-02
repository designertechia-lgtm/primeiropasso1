import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, User } from "lucide-react";
import { Link } from "react-router-dom";

export default function PatientBuscar() {
  const [search, setSearch] = useState("");

  const { data: professionals = [], isLoading } = useQuery({
    queryKey: ["browse-professionals"],
    queryFn: async () => {
      const { data: profs } = await supabase
        .from("professionals")
        .select("id, slug, bio, approaches, photo_url, user_id, hero_title");

      if (!profs || profs.length === 0) return [];

      const userIds = profs.map((p) => p.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p.full_name]) ?? []);

      return profs.map((p) => ({
        ...p,
        name: profileMap.get(p.user_id) || "Profissional",
      }));
    },
  });

  const filtered = professionals.filter((p) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      (p.bio || "").toLowerCase().includes(q) ||
      (p.approaches || []).some((a: string) => a.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Buscar Profissionais</h1>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nome, abordagem..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhum profissional encontrado.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-3">
                  {p.photo_url ? (
                    <img src={p.photo_url} alt={p.name} className="h-12 w-12 rounded-full object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-6 w-6 text-primary" />
                    </div>
                  )}
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {p.bio && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{p.bio}</p>
                )}
                {p.approaches && p.approaches.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {p.approaches.slice(0, 3).map((a: string) => (
                      <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" asChild className="flex-1">
                    <Link to={`/minha-conta/agendar/${p.slug}`}>Agendar</Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/${p.slug}`} target="_blank" rel="noopener noreferrer">Ver Página</a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
