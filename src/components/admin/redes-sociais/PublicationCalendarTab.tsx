import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";

import { supabase } from "@/integrations/supabase/client";
import { useProfessional } from "@/hooks/useProfessional";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Instagram, Facebook, Linkedin, AtSign, Loader2, Send,
  CheckCircle2, AlertCircle, Calendar as CalendarIcon, Film,
} from "lucide-react";
import { TikTokIcon } from "@/components/icons/TikTokIcon";
import SchedulePostDialog, { type CalendarPost, type Platform, PLATFORM_META } from "./SchedulePostDialog";

const PLATFORM_ICONS = {
  instagram: Instagram,
  facebook:  Facebook,
  threads:   AtSign,
  linkedin:  Linkedin,
  tiktok:    TikTokIcon,
} as const;

const STATUS_LABEL: Record<CalendarPost["status"], string> = {
  pending:   "Agendado",
  published: "Publicado",
  failed:    "Falhou",
  cancelled: "Cancelado",
};

interface VideoLite {
  id: string;
  title: string;
  thumbnail_url: string | null;
}

export default function PublicationCalendarTab() {
  const { data: professional } = useProfessional();
  const queryClient = useQueryClient();

  const [dialogOpen,  setDialogOpen]  = useState(false);
  const [editing,     setEditing]     = useState<CalendarPost | null>(null);
  const [defaultDate, setDefaultDate] = useState<string | null>(null);
  const [hidden,      setHidden]      = useState<Set<Platform>>(new Set());
  const [publishing,  setPublishing]  = useState(false);

  const { data: posts = [], isLoading } = useQuery<CalendarPost[]>({
    queryKey: ["calendar-posts", professional?.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("social_posts")
        .select("id, platform, scheduled_at, description, status, post_type, video_id, article_id, image_url, carousel_image_urls, error_message")
        .eq("professional_id", professional!.id)
        .order("scheduled_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as CalendarPost[];
    },
    enabled: !!professional?.id,
  });

  const { data: videoMap = {} } = useQuery<Record<string, VideoLite>>({
    queryKey: ["videos-thumbs", professional?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, thumbnail_url")
        .eq("professional_id", professional!.id);
      const map: Record<string, VideoLite> = {};
      (data ?? []).forEach((v: any) => { map[v.id] = v; });
      return map;
    },
    enabled: !!professional?.id,
  });

  const events = useMemo(() => {
    return posts
      .filter((p) => !hidden.has(p.platform))
      .map((p) => {
        const meta   = PLATFORM_META[p.platform];
        const isDone = p.status === "published";
        const isFail = p.status === "failed";
        const isCanc = p.status === "cancelled";
        return {
          id:    p.id,
          title: (p.description?.trim() || videoMap[p.video_id ?? ""]?.title || "(sem legenda)").slice(0, 80),
          start: p.scheduled_at,
          backgroundColor: isCanc ? "#9CA3AF" : meta.color,
          borderColor:     isFail ? "#DC2626" : (isCanc ? "#6B7280" : meta.color),
          textColor:       "#ffffff",
          extendedProps:   { post: p },
          classNames: [
            isDone ? "fc-event-published" : "",
            isCanc ? "fc-event-cancelled" : "",
            isFail ? "fc-event-failed"    : "",
          ].filter(Boolean),
        };
      });
  }, [posts, hidden, videoMap]);

  const grouped = useMemo(() => {
    const now = Date.now();
    const upcoming: CalendarPost[] = [];
    const published: CalendarPost[] = [];
    const failed: CalendarPost[] = [];
    for (const p of posts) {
      if (p.status === "pending" && new Date(p.scheduled_at).getTime() >= now) upcoming.push(p);
      else if (p.status === "published") published.push(p);
      else if (p.status === "failed") failed.push(p);
    }
    upcoming.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
    published.sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
    failed.sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));
    return { upcoming, published: published.slice(0, 10), failed };
  }, [posts]);

  function openCreate(date: string | null = null) {
    setEditing(null);
    setDefaultDate(date);
    setDialogOpen(true);
  }

  function openEdit(post: CalendarPost) {
    setEditing(post);
    setDefaultDate(null);
    setDialogOpen(true);
  }

  function handleSelect(arg: { startStr: string }) {
    openCreate(arg.startStr);
  }

  function handleEventClick(arg: any) {
    const post = arg.event.extendedProps?.post as CalendarPost | undefined;
    if (post) openEdit(post);
  }

  async function handleEventDrop(arg: any) {
    const post: CalendarPost | undefined = arg.event.extendedProps?.post;
    const newDate: Date | null = arg.event.start;
    if (!post || !newDate) return;
    if (post.status !== "pending") {
      toast.error("Só dá pra reagendar publicações pendentes.");
      arg.revert();
      return;
    }
    const { error } = await (supabase as any)
      .from("social_posts")
      .update({ scheduled_at: newDate.toISOString() })
      .eq("id", post.id);
    if (error) {
      toast.error("Erro ao reagendar", { description: error.message });
      arg.revert();
    } else {
      toast.success("Reagendado!");
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
    }
  }

  function togglePlatform(p: Platform) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  async function handlePublishPending() {
    setPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("publish-social-posts");
      if (error) throw error;
      const { published: n, failed: f } = (data ?? {}) as { published?: number; failed?: number };
      if ((n ?? 0) > 0) toast.success(`${n} post(s) publicado(s)!`);
      if ((f ?? 0) > 0) toast.error(`${f} post(s) falharam — veja o status na lista.`);
      if (!n && !f) toast.info("Nenhum post pendente vencido pra publicar agora.");
      queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
    } catch (e: any) {
      toast.error("Erro ao publicar", { description: e?.message });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl font-bold text-foreground">
            Calendário de Publicações
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Planeje seus posts. Clique numa data vazia pra agendar, ou arraste pra remarcar.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePublishPending} disabled={publishing}>
            {publishing
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Publicando…</>
              : <><Send className="h-3.5 w-3.5 mr-1.5" />Publicar pendentes</>
            }
          </Button>
          <Button onClick={() => openCreate(null)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova publicação
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-muted-foreground mr-1">Mostrar:</span>
        {(Object.keys(PLATFORM_META) as Platform[]).map((p) => {
          const meta = PLATFORM_META[p];
          const Icon = PLATFORM_ICONS[p];
          const isOff = hidden.has(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border transition ${
                isOff
                  ? "bg-muted text-muted-foreground border-transparent"
                  : "border-current bg-background"
              }`}
              style={!isOff ? { color: meta.color } : undefined}
              aria-pressed={!isOff}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-3 fc-host">
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando publicações…
            </div>
          ) : (
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              locale={ptBrLocale}
              headerToolbar={{
                left:   "prev,next today",
                center: "title",
                right:  "dayGridMonth,timeGridWeek,timeGridDay",
              }}
              buttonText={{ today: "Hoje", month: "Mês", week: "Semana", day: "Dia" }}
              height="auto"
              events={events}
              selectable
              select={handleSelect}
              eventClick={handleEventClick}
              editable
              eventDrop={handleEventDrop}
              eventDisplay="block"
              dayMaxEvents={3}
              nowIndicator
              firstDay={1}
            />
          )}
        </Card>

        <aside className="space-y-5">
          <PostListSection
            title="Próximas"
            icon={<CalendarIcon className="h-4 w-4 text-primary" />}
            posts={grouped.upcoming}
            videoMap={videoMap}
            emptyMsg="Nenhuma publicação agendada."
            onClick={openEdit}
          />
          <PostListSection
            title="Publicadas"
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            posts={grouped.published}
            videoMap={videoMap}
            emptyMsg="Nada publicado ainda."
            onClick={openEdit}
            dimmed
          />
          {grouped.failed.length > 0 && (
            <PostListSection
              title="Falharam"
              icon={<AlertCircle className="h-4 w-4 text-red-600" />}
              posts={grouped.failed}
              videoMap={videoMap}
              emptyMsg=""
              onClick={openEdit}
            />
          )}
        </aside>
      </div>

      <SchedulePostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultDate={defaultDate}
        professionalId={professional?.id ?? null}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["calendar-posts"] });
          setDialogOpen(false);
        }}
      />
    </div>
  );
}

function PostListSection({
  title, icon, posts, videoMap, emptyMsg, onClick, dimmed,
}: {
  title: string;
  icon: React.ReactNode;
  posts: CalendarPost[];
  videoMap: Record<string, VideoLite>;
  emptyMsg: string;
  onClick: (post: CalendarPost) => void;
  dimmed?: boolean;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
        <span className="text-xs font-normal text-muted-foreground">({posts.length})</span>
      </h3>
      {posts.length === 0 ? (
        emptyMsg && <p className="text-xs text-muted-foreground">{emptyMsg}</p>
      ) : (
        <ul className={`space-y-1.5 ${dimmed ? "opacity-80" : ""}`}>
          {posts.map((p) => (
            <PostListItem key={p.id} post={p} videoMap={videoMap} onClick={() => onClick(p)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PostListItem({
  post, videoMap, onClick,
}: {
  post: CalendarPost;
  videoMap: Record<string, VideoLite>;
  onClick: () => void;
}) {
  const meta  = PLATFORM_META[post.platform];
  const Icon  = PLATFORM_ICONS[post.platform];
  const date  = new Date(post.scheduled_at);
  const video = post.video_id ? videoMap[post.video_id] : null;
  const title = post.description?.trim() || video?.title || "(sem legenda)";

  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="w-full text-left rounded-lg border border-border bg-card hover:bg-muted/40 transition p-2.5 flex gap-2.5 items-start"
      >
        {video?.thumbnail_url ? (
          <img
            src={video.thumbnail_url}
            alt=""
            className="w-10 h-10 rounded object-cover shrink-0"
          />
        ) : (
          <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
            <Film className="h-4 w-4 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs">
            <Icon className="h-3 w-3" style={{ color: meta.color }} />
            <span style={{ color: meta.color }} className="font-medium">
              {meta.label}
            </span>
            <span className="text-muted-foreground">•</span>
            <span className="text-muted-foreground capitalize">{post.post_type}</span>
          </div>
          <p className="text-sm font-medium line-clamp-1">{title}</p>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
              {" • "}
              {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {STATUS_LABEL[post.status]}
            </Badge>
          </div>
        </div>
      </button>
    </li>
  );
}
