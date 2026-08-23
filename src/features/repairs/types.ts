import type { ServiceMode } from "@/features/providers";

export type RepairOrigin = "CUSTOMER_REQUEST" | "PROVIDER_CREATED";

export type RepairStatus =
  | "IN_PROGRESS"
  | "WAITING_FOR_PARTS"
  | "AWAITING_APPROVAL"
  | "READY"
  | "COMPLETED";

const ALLOWED_STATUS_TRANSITIONS: Record<
  RepairStatus,
  readonly RepairStatus[]
> = {
  IN_PROGRESS: ["WAITING_FOR_PARTS", "AWAITING_APPROVAL", "READY"],
  WAITING_FOR_PARTS: ["IN_PROGRESS"],
  AWAITING_APPROVAL: ["IN_PROGRESS"],
  READY: ["COMPLETED"],
  COMPLETED: [],
};

export function getAllowedRepairStatusTransitions(
  status: RepairStatus,
): RepairStatus[] {
  return [...ALLOWED_STATUS_TRANSITIONS[status]];
}

export interface RepairSnapshotInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deviceType: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  colorVariant?: string;
  deviceSpecs?: string;
  physicalCondition?: string;
  accessoriesReceived?: string;
  reportedProblem: string;
  initialObservation?: string;
  diagnosis?: string;
  internalNotes?: string;
  serviceMode?: ServiceMode;
  serviceModeDetails?: string;
}

export type DirectRepairInput = RepairSnapshotInput;
export type RequestOriginRepairInput = RepairSnapshotInput;
export type UpdateRepairDetailsInput = RepairSnapshotInput;

export interface RepairResult {
  repairId: string;
  ticketNumber: string;
  trackingCode: string;
  currentStatus: "IN_PROGRESS";
}

export interface RepairSummary {
  id: string;
  ticketNumber: string;
  origin: RepairOrigin;
  customerName: string;
  deviceType: string;
  brand?: string | null;
  model?: string | null;
  reportedProblem: string;
  currentStatus: RepairStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RepairStatusEvent {
  id: string;
  fromStatus?: RepairStatus | null;
  toStatus: RepairStatus;
  changedByUserId: string;
  createdAt: string;
}

export interface CustomerUpdate {
  id: string;
  message: string;
  createdByUserId: string;
  createdAt: string;
}

export interface RepairDetail extends RepairSummary {
  providerId: string;
  repairRequestId?: string | null;
  trackingCode: string;
  customerPhone: string;
  customerEmail?: string | null;
  serialNumber?: string | null;
  colorVariant?: string | null;
  deviceSpecs?: string | null;
  physicalCondition?: string | null;
  accessoriesReceived?: string | null;
  initialObservation?: string | null;
  diagnosis?: string | null;
  internalNotes?: string | null;
  serviceMode?: ServiceMode | null;
  serviceModeDetails?: string | null;
  createdByUserId: string;
  completedAt?: string | null;
  statusEvents: RepairStatusEvent[];
  customerUpdates: CustomerUpdate[];
}

export interface RepairListOptions {
  status?: RepairStatus;
  query?: string;
  page?: number;
}

export interface RepairPage {
  items: RepairSummary[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface RepairCounts {
  active: number;
  waiting: number;
  ready: number;
  completed: number;
}

export type RepairErrorCode =
  | "REQUEST_NOT_FOUND"
  | "REQUEST_ALREADY_PROCESSED"
  | "REPAIR_NOT_FOUND"
  | "INVALID_STATUS_TRANSITION"
  | "UNSUPPORTED_SERVICE_MODE"
  | "IDENTIFIER_GENERATION_FAILED"
  | "INVALID_INPUT";

export class RepairError extends Error {
  constructor(
    message: string,
    public readonly code: RepairErrorCode,
  ) {
    super(message);
    this.name = "RepairError";
  }
}
