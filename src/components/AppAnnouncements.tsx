import { useAnnouncements } from "@/hooks/useOwnerStats";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, AlertTriangle, CheckCircle2, XCircle, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppAnnouncements() {
  const { data: announcements } = useAnnouncements();
  const [closedIds, setClosedIds] = useState<string[]>([]);

  const activeAnnouncements = announcements?.filter(a => 
    a.is_active && 
    !closedIds.includes(a.id) &&
    (!a.end_date || new Date(a.end_date) > new Date())
  );

  if (!activeAnnouncements || activeAnnouncements.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-full max-w-2xl px-4 space-y-2 pointer-events-none">
      {activeAnnouncements.map((ann) => (
        <Alert 
          key={ann.id} 
          className={`shadow-lg backdrop-blur-md border-opacity-50 pointer-events-auto animate-in slide-in-from-top duration-500 ${
            ann.type === 'info' ? 'bg-blue-500/10 border-blue-500/50 text-blue-700' :
            ann.type === 'warning' ? 'bg-amber-500/10 border-amber-500/50 text-amber-700' :
            ann.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-700' :
            'bg-red-500/10 border-red-500/50 text-red-700'
          }`}
        >
          <div className="flex items-center gap-3">
            {ann.type === 'info' && <Info className="h-4 w-4" />}
            {ann.type === 'warning' && <AlertTriangle className="h-4 w-4" />}
            {ann.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {ann.type === 'error' && <XCircle className="h-4 w-4" />}
            
            <div className="flex-1">
              <AlertDescription className="text-sm font-medium">
                {ann.message}
              </AlertDescription>
            </div>

            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6 rounded-full hover:bg-black/5" 
              onClick={() => setClosedIds([...closedIds, ann.id])}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Alert>
      ))}
    </div>
  );
}
