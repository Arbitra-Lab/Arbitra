export type DisputeStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'RESOLVED'
  | 'REJECTED'
  | 'WITHDRAWN';
export type DisputeType =
  | 'RENT_PAYMENT'
  | 'SECURITY_DEPOSIT'
  | 'PROPERTY_DAMAGE'
  | 'MAINTENANCE'
  | 'TERMINATION'
  | 'OTHER';

export interface DashboardDispute {
  id: string;
  disputeId: string;
  agreementReference: string;
  propertyName: string;
  counterpartyName: string;
  disputeType: DisputeType;
  description: string;
  status: DisputeStatus;
  requestedAmount?: number;
  resolution?: string;
  evidenceCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

const tenantDisputesMock: DashboardDispute[] = [
  {
    id: 'dis-001',
    disputeId: 'DSP-2026-001',
    agreementReference: 'AGR-2025-014',
    propertyName: 'Sunset Apartments, Unit 4B',
    counterpartyName: 'James Adebayo',
    disputeType: 'MAINTENANCE',
    description:
      'Water damage repairs were delayed for 12 days after the issue was reported.',
    status: 'UNDER_REVIEW',
    requestedAmount: 40000,
    evidenceCount: 3,
    commentCount: 4,
    createdAt: '2026-02-18T10:00:00.000Z',
    updatedAt: '2026-03-06T13:20:00.000Z',
  },
  {
    id: 'dis-002',
    disputeId: 'DSP-2025-019',
    agreementReference: 'AGR-2025-014',
    propertyName: 'Sunset Apartments, Unit 4B',
    counterpartyName: 'James Adebayo',
    disputeType: 'SECURITY_DEPOSIT',
    description:
      'Requesting clarity on deduction applied to the security deposit statement.',
    status: 'RESOLVED',
    requestedAmount: 60000,
    resolution:
      'Landlord provided receipts and issued a partial refund for undocumented charges.',
    evidenceCount: 2,
    commentCount: 6,
    createdAt: '2025-12-20T16:00:00.000Z',
    updatedAt: '2026-01-04T12:10:00.000Z',
  },
];

const landlordDisputesMock: DashboardDispute[] = [
  {
    id: 'dis-101',
    disputeId: 'DSP-2026-004',
    agreementReference: 'AGR-2025-021',
    propertyName: 'Glover Road, Ikoyi',
    counterpartyName: 'Ada Nwosu',
    disputeType: 'RENT_PAYMENT',
    description:
      'Tenant claims rent was debited twice after a manual settlement was also recorded.',
    status: 'OPEN',
    requestedAmount: 180000,
    evidenceCount: 1,
    commentCount: 1,
    createdAt: '2026-03-04T08:45:00.000Z',
    updatedAt: '2026-03-04T08:45:00.000Z',
  },
  {
    id: 'dis-102',
    disputeId: 'DSP-2026-002',
    agreementReference: 'AGR-2025-010',
    propertyName: 'Admiralty Way, Block 4',
    counterpartyName: 'Kunle Bello',
    disputeType: 'PROPERTY_DAMAGE',
    description:
      'Checkout inspection found damage to the kitchen cabinet and broken smoke detectors.',
    status: 'UNDER_REVIEW',
    requestedAmount: 95000,
    evidenceCount: 4,
    commentCount: 5,
    createdAt: '2026-02-09T17:30:00.000Z',
    updatedAt: '2026-03-03T10:00:00.000Z',
  },
];

/** Combined mock disputes for admin dashboard when API is unavailable. */
export function getAdminDisputesMockList(): DashboardDispute[] {
  return [...tenantDisputesMock, ...landlordDisputesMock];
}
