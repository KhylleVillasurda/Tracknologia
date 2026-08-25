import type { ServiceMode } from "@/features/providers";
import type { RepairStatus } from "@/features/repairs";

export interface PublicCustomerUpdate {
  message: string;
  createdAt: string;
}

export interface PublicRepairView {
  providerDisplayName: string;
  deviceSummary: string;
  currentStatus: RepairStatus;
  statusLabel: string;
  statusDescription: string;
  serviceMode: ServiceMode | null;
  serviceModeLabel: string | null;
  handoverMessage: string | null;
  lastUpdatedAt: string;
  customerUpdates: PublicCustomerUpdate[];
}
