export type GenericAssetType = 'XLM' | 'ISSUED';

export interface GenericEscrowFormState {
  agreementType: string;
  agreementReference: string;
  depositor: string;
  beneficiary: string;
  arbiter: string;
  amount: string;
  assetType: GenericAssetType;
  assetCode: string;
  assetIssuer: string;
  tokenContractId: string;
  signers: [string, string, string];
  feeRecipients: Array<{ address: string; basisPoints: string }>;
}

export interface GenericEscrowPayload {
  agreementType: string;
  agreementReference?: string;
  depositor: string;
  beneficiary: string;
  arbiter: string;
  amount: string;
  asset: {
    assetType: GenericAssetType;
    assetCode?: string;
    assetIssuer?: string;
  };
  tokenContractId: string;
  signers: string[];
  requiredSignatures: 2;
  feeSplits: Array<{ address: string; basisPoints: number }>;
}

const PUBLIC_KEY = /^G[A-Z2-7]{55}$/i;
const CONTRACT_ID = /^[CG][A-Z2-7]{55}$/i;
const AMOUNT = /^\d+(\.\d{1,7})?$/;
const ASSET_CODE = /^[a-zA-Z0-9]{1,12}$/;

export const INITIAL_GENERIC_ESCROW_FORM: GenericEscrowFormState = {
  agreementType: 'rental',
  agreementReference: '',
  depositor: '',
  beneficiary: '',
  arbiter: '',
  amount: '',
  assetType: 'XLM',
  assetCode: '',
  assetIssuer: '',
  tokenContractId: '',
  signers: ['', '', ''],
  feeRecipients: [{ address: '', basisPoints: '0' }],
};

/** Validate and convert form strings into the backend DTO shape (#6). */
export function toGenericEscrowPayload(
  form: GenericEscrowFormState,
): GenericEscrowPayload {
  const keyFields: Array<[string, string]> = [
    ['Depositor', form.depositor],
    ['Beneficiary', form.beneficiary],
    ['Arbiter', form.arbiter],
  ];
  for (const [label, value] of keyFields) {
    if (!PUBLIC_KEY.test(value.trim())) {
      throw new Error(`${label} must be a valid Stellar public key`);
    }
  }
  if (!CONTRACT_ID.test(form.tokenContractId.trim())) {
    throw new Error('Token contract id is required');
  }
  if (!AMOUNT.test(form.amount) || Number(form.amount) <= 0) {
    throw new Error('Amount must be positive with up to 7 decimal places');
  }

  const signers = form.signers.map((signer) => signer.trim());
  if (
    signers.length !== 3 ||
    signers.some((signer) => !PUBLIC_KEY.test(signer))
  ) {
    throw new Error('Exactly three valid signers are required for 2-of-3');
  }
  if (new Set(signers).size !== 3) {
    throw new Error('Signers must be unique');
  }

  const asset: GenericEscrowPayload['asset'] = { assetType: form.assetType };
  if (form.assetType === 'ISSUED') {
    if (!ASSET_CODE.test(form.assetCode.trim())) {
      throw new Error('A valid asset code is required');
    }
    if (!PUBLIC_KEY.test(form.assetIssuer.trim())) {
      throw new Error('A valid asset issuer is required');
    }
    asset.assetCode = form.assetCode.trim();
    asset.assetIssuer = form.assetIssuer.trim();
  }

  const feeSplits = form.feeRecipients.map((recipient) => ({
    address: recipient.address.trim(),
    basisPoints: Number(recipient.basisPoints),
  }));
  if (feeSplits.length > 2) {
    throw new Error('At most two fee recipients are supported');
  }
  for (const split of feeSplits) {
    if (!PUBLIC_KEY.test(split.address)) {
      throw new Error('Fee recipient must be a valid Stellar public key');
    }
    if (
      !Number.isInteger(split.basisPoints) ||
      split.basisPoints < 0 ||
      split.basisPoints > 10000
    ) {
      throw new Error('Fee split must be between 0 and 10000 basis points');
    }
  }
  if (feeSplits.reduce((sum, split) => sum + split.basisPoints, 0) > 10000) {
    throw new Error('Fee splits cannot exceed 100%');
  }

  return {
    agreementType: form.agreementType.trim() || 'other',
    agreementReference: form.agreementReference.trim() || undefined,
    depositor: form.depositor.trim(),
    beneficiary: form.beneficiary.trim(),
    arbiter: form.arbiter.trim(),
    amount: form.amount,
    asset,
    tokenContractId: form.tokenContractId.trim(),
    signers,
    requiredSignatures: 2,
    feeSplits,
  };
}
