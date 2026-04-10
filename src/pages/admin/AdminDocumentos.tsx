import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { FileUp, Trash2, RefreshCw, Save, Upload, FileText, Link } from "lucide-react";

export default function AdminDocumentos() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookLoaded, setWebhookLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Fetch webhook URL
  const { data: settings } = useQuery({
    queryKey: ["professional-settings", professional?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_settings")
        .select("*")
        .eq("professional_id", professional!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });

  // Sync webhook URL from settings
  if (settings && !webhookLoaded) {
    setWebhookUrl(settings.webhook_url || "");
    setWebhookLoaded(true);
  }
  if (!settings && professional?.id && !webhookLoaded) {
    setWebhookLoaded(true);
  }

  // Fetch documents
  const { data: documents = [] } = useQuery({
    queryKey: ["professional-documents", professional?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_documents")
        .select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });

  // Save webhook URL
  const saveWebhook = useMutation({
    mutationFn: async (url: string) => {
      const { data: existing } = await supabase
        .from("professional_settings")
        .select("id")
        .eq("professional_id", professional!.id)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("professional_settings")
          .update({ webhook_url: url })
          .eq("professional_id", professional!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("professional_settings")
          .insert({ professional_id: professional!.id, webhook_url: url });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Webhook salvo com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["professional-settings"] });
    },
    onError: () => {
      toast({ title: "Erro ao salvar webhook", variant: "destructive" });
    },
  });

  // Send webhook
  const sendWebhook = async (fileUrl: string, fileName: string, docId: string) => {
    const currentUrl = webhookUrl || settings?.webhook_url;
    if (!currentUrl) return;

    try {
      await fetch(currentUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: fileUrl,
          file_name: fileName,
          professional_id: professional!.id,
          document_id: docId,
        }),
      });
      await supabase
        .from("professional_documents")
        .update({ webhook_status: "sent" })
        .eq("id", docId);
    } catch {
      await supabase
        .from("professional_documents")
        .update({ webhook_status: "error" })
        .eq("id", docId);
    }
    queryClient.invalidateQueries({ queryKey: ["professional-documents"] });
  };

  // Upload file
  const handleUpload = async (file: File) => {
    if (!professional?.id) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Apenas arquivos PDF são aceitos", variant: "destructive" });
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo deve ter no máximo 20MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${user!.id}/pdfs/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("documents")
        .getPublicUrl(path);

      const { data: doc, error: insertError } = await supabase
        .from("professional_documents")
        .insert({
          professional_id: professional.id,
          file_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
          webhook_status: "pending",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      toast({ title: "PDF enviado com sucesso!" });
      queryClient.invalidateQueries({ queryKey: ["professional-documents"] });

      // Send webhook if configured
      const currentUrl = webhookUrl || settings?.webhook_url;
      if (currentUrl && doc) {
        await sendWebhook(publicUrl, file.name, doc.id);
      }
    } catch (err: any) {
      toast({ title: "Erro no upload", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // Delete document
  const deleteDoc = useMutation({
    mutationFn: async (doc: { id: string; file_url: string }) => {
      // Extract path from URL
      const url = new URL(doc.file_url);
      const pathParts = url.pathname.split("/storage/v1/object/public/documents/");
      if (pathParts[1]) {
        await supabase.storage.from("documents").remove([decodeURIComponent(pathParts[1])]);
      }
      const { error } = await supabase
        .from("professional_documents")
        .delete()
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Documento excluído" });
      queryClient.invalidateQueries({ queryKey: ["professional-documents"] });
    },
    onError: () => {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    },
  });

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [professional, webhookUrl, settings]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "sent":
        return <Badge className="bg-green-100 text-green-800">Enviado</Badge>;
      case "error":
        return <Badge variant="destructive">Erro</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Documentos</h1>
        <p className="text-muted-foreground">
          Faça upload de PDFs e envie para processamento via webhook
        </p>
      </div>

      {/* Webhook config */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link className="h-5 w-5" />
            Webhook n8n
          </CardTitle>
          <CardDescription>
            Configure a URL do webhook para enviar os documentos. Use a URL de teste e depois troque pela de produção.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="webhook-url" className="sr-only">URL do Webhook</Label>
              <Input
                id="webhook-url"
                placeholder="https://seu-n8n.app/webhook/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
            <Button
              onClick={() => saveWebhook.mutate(webhookUrl)}
              disabled={saveWebhook.isPending}
            >
              <Save className="h-4 w-4 mr-1" />
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Upload area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5" />
            Upload de PDF
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => document.getElementById("pdf-input")?.click()}
          >
            <FileUp className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {uploading ? "Enviando..." : "Arraste um PDF aqui ou clique para selecionar"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Máximo 20MB • Apenas PDF</p>
            <input
              id="pdf-input"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
              disabled={uploading}
            />
          </div>
        </CardContent>
      </Card>

      {/* Document list */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Documentos enviados ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhum documento enviado ainda
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="h-5 w-5 text-red-500 shrink-0" />
                    <div className="min-w-0">
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium hover:underline truncate block"
                      >
                        {doc.file_name}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {formatSize(doc.file_size)} • {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {statusBadge(doc.webhook_status)}
                    {(doc.webhook_status === "error" || doc.webhook_status === "pending") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => sendWebhook(doc.file_url, doc.file_name, doc.id)}
                        title="Reenviar webhook"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteDoc.mutate({ id: doc.id, file_url: doc.file_url })}
                      disabled={deleteDoc.isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
