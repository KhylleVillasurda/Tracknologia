import type { ServiceMode } from "@/features/providers";
import type { RepairStatus } from "@/features/repairs";

export type TrackingStatus = RepairStatus | "SUBMITTED" | "DECLINED";

export interface PublicCustomerUpdate {
  message: string;
  createdAt: string;
}

export interface PublicRepairView {
  providerDisplayName: string;
  deviceSummary: string;
  currentStatus: TrackingStatus;
  statusLabel: string;
  statusDescription: string;
  serviceMode: ServiceMode | null;
  serviceModeLabel: string | null;
  handoverMessage: string | null;
  lastUpdatedAt: string;
  customerUpdates: PublicCustomerUpdate[];
  trackingType: "REPAIR" | "REQUEST";
  trackingCode: string;
}
