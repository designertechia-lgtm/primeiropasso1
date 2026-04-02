import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import ProfessionalLanding from "./ProfessionalLanding";

export default function Index() {
  const { data: professional, isLoading } = useQuery({
    queryKey: ["single-professional"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professionals")
        .select("slug")
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground font-serif text-lg">Carregando...</div>
      </div>
    );
  }

  if (!professional) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="font-serif text-3xl font-bold text-foreground">Nenhum profissional cadastrado</h1>
          <p className="text-muted-foreground">Cadastre-se como profissional para criar sua página.</p>
        </div>
      </div>
    );
  }

  return <ProfessionalLanding slugOverride={professional.slug} />;
}
