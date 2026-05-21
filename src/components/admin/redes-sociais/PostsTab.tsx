import PublicationCalendarTab from "./PublicationCalendarTab";
import AutomacoesTab from "./AutomacoesTab";

export default function PostsTab() {
  return (
    <div className="space-y-10">
      <PublicationCalendarTab />
      <div className="border-t pt-8">
        <AutomacoesTab />
      </div>
    </div>
  );
}
