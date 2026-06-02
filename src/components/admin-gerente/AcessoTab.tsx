import { useState } from "react";
import { 
  useOwnerAccessList, 
  useGrantAccessByEmail, 
  useRevokeAccess,
  useFeatureFlags,
  SuperAdminAccess 
} from "@/hooks/useOwnerStats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  ShieldCheck, 
  UserPlus, 
  XCircle, 
  Clock, 
  Search,
  Flag
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const AVAILABLE_SCOPES = [
  { id: 'view', label: 'Visualizacao' },
  { id: 'pix_settings', label: 'Configuracoes PIX' },
  { id: 'feedback', label: 'Gerenciar Feedbacks' },
  { id: 'users', label: 'Gerenciar Usuarios' },
  { id: 'admin', label: 'Administrador Total' },
];

export default function AcessoTab() {
  const { data: accessList, isLoading } = useOwnerAccessList();
  const { data: flags } = useFeatureFlags();
  const grantAccess = useGrantAccessByEmail();
  const revokeAccess = useRevokeAccess();
  const qc = useQueryClient();

  const toggleFlag = async (key: string, current: boolean) => {
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ is_enabled: !current, updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      toast.success(`Flag ${key} atualizada!`);
    } catch (e) {
      toast.error("Erro ao atualizar flag.");
    }
  };

  const [newEmail, setNewEmail] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(['view']);
  const [notes, setNotes] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleGrant = async () => {
    if (!newEmail) {
      toast.error("Informe o e-mail do usuario");
      return;
    }
    
    setIsAdding(true);
    try {
      await grantAccess.mutateAsync({
        email: newEmail,
        scopes: selectedScopes,
        notes: notes
      });
      toast.success("Acesso concedido com sucesso!");
      setNewEmail("");
      setSelectedScopes(['view']);
      setNotes("");
    } catch (error: any) {
      toast.error(error.message || "Erro ao conceder acesso.");
    } finally {
      setIsAdding(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (confirm("Tem certeza que deseja revogar o acesso deste usuario?")) {
      try {
        await revokeAccess.mutateAsync(userId);
        toast.success("Acesso revogado!");
      } catch (error) {
        toast.error("Erro ao revogar acesso.");
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 border-border/50 bg-card/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Usuarios com Acesso Super Admin
            </CardTitle>
            <CardDescription>
              Pessoas autorizadas a visualizar e gerenciar o painel do proprietario.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="rounded-md border border-border/40 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Usuario</th>
                      <th className="px-4 py-3 text-left font-medium">Escopos</th>
                      <th className="px-4 py-3 text-left font-medium">Concedido em</th>
                      <th className="px-4 py-3 text-right font-medium">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {accessList?.filter(a => !a.revoked_at).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                          Nenhum usuario adicional com acesso.
                        </td>
                      </tr>
                    ) : (
                      accessList?.filter(a => !a.revoked_at).map((access) => (
                        <tr key={access.user_id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex flex-col">
                              <span className="font-medium">{access.user_name || "Sem nome"}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{access.user_id}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {access.scopes.map(s => (
                                <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(access.granted_at).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                              onClick={() => handleRevoke(access.user_id)}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              Revogar
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/50 bg-card/50 backdrop-blur-sm h-fit">
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <Flag className="h-5 w-5 text-amber-500" />
                Feature Flags
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {flags?.map(flag => (
                  <div key={flag.key} className="flex items-center justify-between p-3 rounded-lg border border-border/40 bg-muted/20">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium font-mono">{flag.key}</p>
                      <p className="text-[10px] text-muted-foreground">{flag.description}</p>
                    </div>
                    <Switch 
                      checked={flag.is_enabled} 
                      onCheckedChange={() => toggleFlag(flag.key, flag.is_enabled)}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card/50 backdrop-blur-sm h-fit">
            <CardHeader>
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-primary" />
                Conceder Acesso
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">E-mail do Usuario</label>
                <div className="relative">
                  <Input 
                    placeholder="exemplo@email.com" 
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="pr-10"
                  />
                  <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground/50" />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-medium text-muted-foreground">Escopos</label>
                <div className="space-y-2">
                  {AVAILABLE_SCOPES.map((scope) => (
                    <div key={scope.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`scope-${scope.id}`} 
                        checked={selectedScopes.includes(scope.id)}
                        onCheckedChange={(checked) => {
                          if (checked) setSelectedScopes([...selectedScopes, scope.id]);
                          else setSelectedScopes(selectedScopes.filter(s => s !== scope.id));
                        }}
                      />
                      <label htmlFor={`scope-${scope.id}`} className="text-sm">{scope.label}</label>
                    </div>
                  ))}
                </div>
              </div>

              <Button 
                className="w-full mt-4" 
                onClick={handleGrant}
                disabled={isAdding}
              >
                {isAdding ? "Processando..." : "Conceder Acesso"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
