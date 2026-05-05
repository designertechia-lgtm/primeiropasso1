import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutList, UserPlus } from "lucide-react";
import AdminClientesKanban from "./AdminClientesKanban";
import AdminLeads from "./AdminLeads";

const VALID_TABS = ["pipeline", "novos"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function AdminClientes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabValue)
    : "pipeline";

  const handleTabChange = (value: string) => {
    if (value === "pipeline") {
      searchParams.delete("tab");
    } else {
      searchParams.set("tab", value);
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="pipeline" className="gap-2">
            <LayoutList className="h-4 w-4" />
            <span className="hidden sm:inline">Pipeline</span>
          </TabsTrigger>
          <TabsTrigger value="novos" className="gap-2">
            <UserPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Novos Leads</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pipeline" className="mt-4">
          <AdminClientesKanban />
        </TabsContent>

        <TabsContent value="novos" className="mt-4">
          <AdminLeads />
        </TabsContent>
      </Tabs>
    </div>
  );
}
