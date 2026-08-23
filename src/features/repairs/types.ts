import type { ServiceMode } from "@/features/providers";

export type RepairStatus =
  | "IN_PROGRESS"
  | "WAITING_FOR_PARTS"
  | "AWAITING_APPROVAL"
  | "READY"
  | "COMPLETED";

export interface RequestOriginRepairInput {
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

export interface RepairResult {
  repairId: string;
  ticketNumber: string;
  trackingCode: string;
  currentStatus: "IN_PROGRESS";
}

export type RepairErrorCode =
  | "REQUEST_NOT_FOUND"
  | "REQUEST_ALREADY_PROCESSED"
  | "UNSUPPORTED_SERVICE_MODE"
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
