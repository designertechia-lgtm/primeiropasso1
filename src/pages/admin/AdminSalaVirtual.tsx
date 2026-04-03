import { useState } from "react";
import { useProfessional } from "@/hooks/useProfessional";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Video, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import VideoCall from "@/components/VideoCall";

export default function AdminSalaVirtual() {
  const { data: professional } = useProfessional();
  const { user } = useAuth();
  const [inCall, setInCall] = useState(false);

  const { data: profile } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const roomName = `primeiropasso-${professional?.slug || "sala"}`;
  const jitsiLink = `https://meet.jit.si/${roomName}`;

  const copyLink = () => {
    navigator.clipboard.writeText(jitsiLink);
    toast.success("Link copiado!");
  };

  if (inCall) {
    return (
      <VideoCall
        roomName={roomName}
        displayName={profile?.full_name || "Profissional"}
        onClose={() => setInCall(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Sala Virtual</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Sua sala fixa de videochamada
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta é sua sala permanente. Você pode compartilhar o link abaixo com seus pacientes ou iniciar a chamada diretamente.
          </p>

          <div className="flex items-center gap-2">
            <Input value={jitsiLink} readOnly className="flex-1" />
            <Button variant="outline" size="icon" onClick={copyLink}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" asChild>
              <a href={jitsiLink} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>

          <Button onClick={() => setInCall(true)} className="w-full sm:w-auto">
            <Video className="h-4 w-4 mr-2" />
            Iniciar Videochamada
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
