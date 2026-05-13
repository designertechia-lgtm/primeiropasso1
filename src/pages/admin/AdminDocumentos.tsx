import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { FileUp, Trash2, RefreshCw, Upload, FileText, Copy, Check } from "lucide-react";
import { RAG_INGEST_URL } from "@/lib/rag-config";

export default function AdminDocumentos() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; file_url: string; id_vector?: number | null } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: documents = [] } = useQuery({
    queryKey: ["professional-documents", professional?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("professional_documents").select("*")
        .eq("professional_id", professional!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!professional?.id,
  });

  const sendWebhook = async (fileUrl: string, fileName: string, docId: string) => {
    try {
      const response = await fetch(RAG_INGEST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_url: fileUrl,
          file_name: fileName,
          professional_id: professional!.id,
          document_id: docId,
          rag_status: "pending",
        }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await supabase.from("professional_documents").update({ webhook_status: "sent" }).eq("id", docId);
    } catch {
      await supabase.from("professional_documents").update({ webhook_status: "error" }).eq("id", docId);
    }
    queryClient.invalidateQueries({ queryKey: ["professional-documents"] });
  };

  const handleUpload = async (file: File) => {
    if (!professional?.id) return;
    if (file.type !== "application/pdf") { toast.error("Apenas arquivos PDF são aceitos"); return; }
    if (file.size > 20 * 1024 * 1024) { toast.error("Arquivo deve ter no máximo 20MB"); return; }
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${user!.id}/pdfs/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("documents").upload(path, file);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("documents").getPublicUrl(path);
      const { data: doc, error: insertError } = await supabase
        .from("professional_documents")
        .insert({ professional_id: professional.id, file_name: file.name, file_url: publicUrl, file_size: file.size, webhook_status: "pending" })
        .select().single();
      if (insertError) throw insertError;
      toast.success("PDF enviado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["professional-documents"] });
      if (doc) { await sendWebhook(publicUrl, file.name, doc.id); }
    } catch (err: any) {
      toast.error("Erro no upload", { description: err.message });
    } finally { setUploading(false); }
  };

  const deleteDoc = useMutation({
    mutationFn: async (doc: { id: string; file_url: string; id_vector?: number | null }) => {
      if (doc.id_vector) {
        await supabase.from("documents").delete().eq("id_vector", doc.id_vector);
      }
      const url = new URL(doc.file_url);
      const pathParts = url.pathname.split("/storage/v1/object/public/documents/");
      if (pathParts[1]) { await supabase.storage.from("documents").remove([decodeURIComponent(pathParts[1])]); }
      const { error } = await supabase.from("professional_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Documento excluído"); setDeleteTarget(null); queryClient.invalidateQueries({ queryKey: ["professional-documents"] }); },
    onError: () => { toast.error("Erro ao excluir"); },
  });

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("Link copiado!");
  };

  const webhookBadge = (status: string) => {
    switch (status) {
      case "sent": return <Badge className="bg-green-100 text-green-800 border-green-200">Enviado</Badge>;
      case "error": return <Badge variant="destructive">Erro</Badge>;
      default: return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  const ragBadge = (status: string) => {
    switch (status) {
      case "completed": return <Badge className="bg-blue-100 text-blue-800 border-blue-200">Vetorizado</Badge>;
      case "processing": return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Processando</Badge>;
      case "error": return <Badge variant="destructive">Erro RAG</Badge>;
      default: return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">RAG conteúdo criação</h1>
        <p className="text-muted-foreground">Faça upload de PDFs para alimentar a base de conhecimento da sua IA.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Documentos enviados ({documents.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Nenhum documento enviado ainda</p>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div key={doc.id} className="p-4 rounded-lg border bg-card space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-5 w-5 text-red-500 shrink-0" />
                      <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium hover:underline truncate">{doc.file_name}</a>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {(doc.webhook_status === "error" || doc.webhook_status === "pending") && (
                        <Button size="sm" variant="outline" onClick={() => sendWebhook(doc.file_url, doc.file_name, doc.id)} title="Reenviar para processamento">
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ id: doc.id, file_url: doc.file_url, id_vector: doc.id_vector })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 pl-7">
                    <p>{formatSize(doc.file_size)} • {new Date(doc.created_at).toLocaleDateString("pt-BR")}</p>
                    <p className="font-mono text-[11px]">ID: {doc.id}{doc.id_vector ? ` • Vetor: #${doc.id_vector}` : ""}</p>
                    <div className="flex items-center gap-1">
                      <span className="truncate max-w-[400px] font-mono text-[11px]">{doc.file_url}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => copyToClipboard(doc.file_url, doc.id)} title="Copiar link">
                        {copiedId === doc.id ? <Check className="h-3 w-3 text-green-600" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-7">
                    <span className="text-xs text-muted-foreground">Envio:</span>
                    {webhookBadge(doc.webhook_status)}
                    <span className="text-xs text-muted-foreground ml-2">RAG:</span>
                    {ragBadge(doc.rag_status)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

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
            <p className="text-sm text-muted-foreground">{uploading ? "Enviando..." : "Arraste um PDF aqui ou clique para selecionar"}</p>
            <p className="text-xs text-muted-foreground mt-1">Máximo 20MB • Apenas PDF</p>
            <input
              id="pdf-input" type="file" accept="application/pdf" className="hidden"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) handleUpload(file); e.target.value = ""; }}
              disabled={uploading}
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir documento</DialogTitle>
            <DialogDescription>Tem certeza que deseja excluir este documento? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTarget && deleteDoc.mutate(deleteTarget)} disabled={deleteDoc.isPending}>
              {deleteDoc.isPending ? "Excluindo..." : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
