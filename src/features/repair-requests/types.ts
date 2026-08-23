import type { ServiceMode } from "@/features/providers";
import type {
  RepairResult,
  RequestOriginRepairInput,
} from "@/features/repairs";

export type RepairRequestStatus = "SUBMITTED" | "ACCEPTED" | "DECLINED";

export interface SubmitRepairRequestInput {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  deviceType: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  colorVariant?: string;
  deviceSpecs?: string;
  reportedProblem: string;
  problemStartedAt?: string;
  precedingEvent?: string;
  troubleshootingAttempted?: string;
  additionalInformation?: string;
  preferredServiceMode?: ServiceMode;
  serviceModeDetails?: string;
}

export interface RepairRequestReceipt {
  referenceCode: string;
  submittedAt: string;
}

export interface RepairRequestSummary {
  id: string;
  referenceCode: string;
  customerName: string;
  customerPhone: string;
  deviceType: string;
  brand?: string | null;
  model?: string | null;
  reportedProblem: string;
  status: RepairRequestStatus;
  submittedAt: string;
}

export interface RepairRequestDetail extends RepairRequestSummary {
  providerId: string;
  customerEmail?: string | null;
  serialNumber?: string | null;
  colorVariant?: string | null;
  deviceSpecs?: string | null;
  problemStartedAt?: string | null;
  precedingEvent?: string | null;
  troubleshootingAttempted?: string | null;
  additionalInformation?: string | null;
  preferredServiceMode?: ServiceMode | null;
  serviceModeDetails?: string | null;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  acceptedByUserId?: string | null;
  declinedByUserId?: string | null;
}

export interface RepairRequestListOptions {
  status?: RepairRequestStatus;
  page?: number;
}

export interface RepairRequestPage {
  items: RepairRequestSummary[];
  page: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export type AcceptedRepairResult = RepairResult;
export type VerifiedRepairRequestInput = RequestOriginRepairInput;

export type RepairRequestErrorCode =
  | "PROVIDER_UNAVAILABLE"
  | "UNSUPPORTED_SERVICE_MODE"
  | "INVALID_INPUT"
  | "REQUEST_NOT_FOUND"
  | "REQUEST_ALREADY_PROCESSED";

export class RepairRequestError extends Error {
  constructor(
    message: string,
    public readonly code: RepairRequestErrorCode,
  ) {
    super(message);
    this.name = "RepairRequestError";
  }
}
