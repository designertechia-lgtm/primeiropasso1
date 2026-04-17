import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface FieldHintProps {
  text: string;
}

export function FieldHint({ text }: FieldHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center cursor-help text-muted-foreground hover:text-foreground ml-1 align-middle">
          <Info className="h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-sm leading-snug">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
