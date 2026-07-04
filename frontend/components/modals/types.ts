export interface AgreementViewData {
  agreementId: string;
  propertyTitle: string;
  propertyAddress: string;
  landlordName: string;
  tenantName: string;
  monthlyRent: number;
  securityDeposit: number;
  startDate: string;
  endDate: string;
  pdfUrl?: string;
  status?: 'draft' | 'pending' | 'active' | 'expired' | 'signed';
  renewalOption?: boolean | null;
  renewalNoticeDate?: string | null;
  moveInDate?: string | null;
  moveOutDate?: string | null;
  utilitiesIncluded?: boolean | null;
  maintenanceResponsibility?: string | null;
  earlyTerminationFee?: number | null;
  lateFeePercentage?: number | null;
  gracePeriodDays?: number | null;
}

export interface AgreementSigningData {
  agreementId: string;
  signerName: string;
  signature: string;
  acceptedTerms: boolean;
  signedAt?: string;
}
