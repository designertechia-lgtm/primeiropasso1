/**
 * Projetos do Editor de Vídeo no banco (tabela editor_projects, RLS
 * user_id = auth.uid() com default auth.uid() no insert).
 * Mata a limitação de 1 rascunho por navegador: a edição sobrevive a troca de
 * máquina e o usuário pode manter vários projetos.
 */
import { supabase } from "@/integrations/supabase/client";

export type EditorProjectRow = { id: number; name: string; updated_at: string };

const sb = supabase as any;

export async function listEditorProjects(): Promise<EditorProjectRow[]> {
  // Filtro explícito por usuário: a policy de SELECT inclui is_super_admin(),
  // então sem o .eq o super-admin veria projetos de TODOS os clientes aqui —
  // e editá-los falharia em silêncio (UPDATE barrado pela RLS afeta 0 linhas).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await sb
    .from("editor_projects")
    .select("id,name,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

export async function fetchEditorProject(id: number): Promise<{ id: number; name: string; doc: unknown; updated_at: string } | null> {
  const { data, error } = await sb
    .from("editor_projects")
    .select("id,name,doc,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function insertEditorProject(name: string, doc: unknown): Promise<number> {
  const { data, error } = await sb
    .from("editor_projects")
    .insert({ name, doc })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as number;
}

export async function updateEditorProject(id: number, name: string, doc: unknown): Promise<void> {
  const { data, error } = await sb
    .from("editor_projects")
    .update({ name, doc, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  // UPDATE que a RLS filtra (projeto de outro usuário / linha excluída em outra
  // máquina) volta 0 linhas SEM erro — não pode passar por "salvo".
  if (!data?.length) throw new Error("O projeto não existe mais (ou não é seu) — nada foi salvo.");
}

export async function deleteEditorProject(id: number): Promise<void> {
  const { error } = await sb.from("editor_projects").delete().eq("id", id);
  if (error) throw error;
}
