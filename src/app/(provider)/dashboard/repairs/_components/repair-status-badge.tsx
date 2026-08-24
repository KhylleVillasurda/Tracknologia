import type { RepairStatus } from "@/features/repairs";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<RepairStatus, string> = {
  IN_PROGRESS: "border-primary/20 bg-primary/10 text-primary",
  WAITING_FOR_PARTS: "border-amber-700/20 bg-amber-700/10 text-amber-700",
  AWAITING_APPROVAL: "border-orange-700/20 bg-orange-700/10 text-orange-700",
  READY: "border-emerald-700/20 bg-emerald-700/10 text-emerald-700",
  COMPLETED: "border-border bg-muted text-muted-foreground",
};

export function repairStatusLabel(status: RepairStatus) {
  return {
    IN_PROGRESS: "In Progress",
    WAITING_FOR_PARTS: "Waiting for Parts",
    AWAITING_APPROVAL: "Awaiting Approval",
    READY: "Ready",
    COMPLETED: "Completed",
  }[status];
}

export function RepairStatusBadge({ status }: { status: RepairStatus }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit rounded-full border px-2.5 py-1 text-[11px] font-semibold",
        STATUS_STYLES[status],
      )}
    >
      {repairStatusLabel(status)}
    </span>
  );
}
