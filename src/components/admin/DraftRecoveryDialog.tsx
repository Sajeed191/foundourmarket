import { History, RotateCcw, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function relative(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "moments ago";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

/**
 * Shown when an unsaved draft is detected on load (browser crashed, tab
 * closed, device restarted). Lets the admin restore or discard it.
 */
export function DraftRecoveryDialog({
  open,
  savedAt,
  deviceLabel,
  onRestore,
  onDiscard,
}: {
  open: boolean;
  savedAt: string | null;
  deviceLabel?: string | null;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Recovered draft
          </AlertDialogTitle>
          <AlertDialogDescription>
            Saved {savedAt ? relative(savedAt) : "earlier"}
            {deviceLabel ? ` on ${deviceLabel}` : ""}. Nothing was lost — continue
            where you left off, or start fresh.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onDiscard}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            Discard draft
          </AlertDialogCancel>
          <AlertDialogAction onClick={onRestore}>
            <RotateCcw className="mr-1.5 h-4 w-4" />
            Continue editing
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

