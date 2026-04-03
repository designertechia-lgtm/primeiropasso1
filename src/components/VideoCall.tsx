import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoCallProps {
  roomName: string;
  displayName: string;
  onClose: () => void;
}

export default function VideoCall({ roomName, displayName, onClose }: VideoCallProps) {
  const encodedName = encodeURIComponent(displayName);
  const jitsiUrl = `https://meet.jit.si/${roomName}#config.prejoinPageEnabled=false&userInfo.displayName=%22${encodedName}%22`;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-card">
        <span className="font-medium text-sm text-foreground">Videochamada</span>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      <iframe
        src={jitsiUrl}
        className="flex-1 w-full border-0"
        allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
      />
    </div>
  );
}
