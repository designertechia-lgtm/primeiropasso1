import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface KanbanFiltersProps {
  period: "7d" | "30d" | "all";
  platform: "whatsapp" | "website" | "all";
  onPeriodChange: (v: "7d" | "30d" | "all") => void;
  onPlatformChange: (v: "whatsapp" | "website" | "all") => void;
}

export function KanbanFilters({
  period,
  platform,
  onPeriodChange,
  onPlatformChange,
}: KanbanFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 items-end">
      <div className="space-y-1">
        <Label className="text-xs">Periodo</Label>
        <Select value={period} onValueChange={onPeriodChange as (v: string) => void}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Ultimos 7 dias</SelectItem>
            <SelectItem value="30d">Ultimos 30 dias</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Plataforma</Label>
        <Select value={platform} onValueChange={onPlatformChange as (v: string) => void}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="website">Website</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
