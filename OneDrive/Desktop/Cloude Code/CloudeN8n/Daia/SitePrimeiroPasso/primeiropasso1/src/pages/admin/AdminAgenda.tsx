import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, ListChecks, Lock } from "lucide-react";
import AdminAgendaCalendario from "./AdminAgendaCalendario";
import AdminAgendamentos from "./AdminAgendamentos";
import AdminDisponibilidade from "./AdminDisponibilidade";

const VALID_TABS = ["calendario", "agendamentos", "bloqueios"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function AdminAgenda() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabValue)
    : "calendario";

  const handleTabChange = (value: string) => {
    if (value === "calendario") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="calendario" className="gap-2">
            <CalendarDays className="h-4 w-4" />
            <span className="hidden sm:inline">Calendário</span>
          </TabsTrigger>
          <TabsTrigger value="agendamentos" className="gap-2">
            <ListChecks className="h-4 w-4" />
            <span className="hidden sm:inline">Agendamentos</span>
          </TabsTrigger>
          <TabsTrigger value="bloqueios" className="gap-2">
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">Bloqueios</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calendario" className="mt-4">
          <AdminAgendaCalendario />
        </TabsContent>

        <TabsContent value="agendamentos" className="mt-4">
          <AdminAgendamentos />
        </TabsContent>

        <TabsContent value="bloqueios" className="mt-4">
          <AdminDisponibilidade />
        </TabsContent>
      </Tabs>
    </div>
  );
}
