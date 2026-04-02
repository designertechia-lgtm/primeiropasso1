import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Trash2, Mail, Phone } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function AdminLeads() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["admin-leads", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!professional?.id,
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lead?")) return;
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else {
      toast.success("Lead excluído");
      queryClient.invalidateQueries({ queryKey: ["admin-leads"] });
    }
  };

  if (isLoading) return <div className="animate-pulse text-muted-foreground">Carregando...</div>;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">Novos Pacientes</h1>

      {leads.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhum novo paciente ainda.</p>
      ) : (
        <div className="grid gap-4">
          {leads.map((lead) => (
            <Card key={lead.id}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">{lead.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(lead.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(lead.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-foreground">
                    <Mail className="h-4 w-4" /> {lead.email}
                  </a>
                )}
                {lead.whatsapp && (
                  <a href={`https://wa.me/55${lead.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-foreground">
                    <Phone className="h-4 w-4" /> {lead.whatsapp}
                  </a>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
