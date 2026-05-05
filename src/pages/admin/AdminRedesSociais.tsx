import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Link2 } from "lucide-react";
import AdminRedesSociaisPosts from "./AdminRedesSociaisPosts";
import { ConnectedAccounts } from "@/components/dashboard/ConnectedAccounts";

const VALID_TABS = ["posts", "contas"] as const;
type TabValue = (typeof VALID_TABS)[number];

export default function AdminRedesSociais() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: TabValue = (VALID_TABS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TabValue)
    : "posts";

  const handleTabChange = (value: string) => {
    if (value === "posts") {
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
          <TabsTrigger value="posts" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Posts</span>
          </TabsTrigger>
          <TabsTrigger value="contas" className="gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">Contas Conectadas</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-4">
          <AdminRedesSociaisPosts />
        </TabsContent>

        <TabsContent value="contas" className="mt-4">
          <ConnectedAccounts />
        </TabsContent>
      </Tabs>
    </div>
  );
}
