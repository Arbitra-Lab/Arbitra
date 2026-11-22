import { describe, expect, it } from 'vitest';
import {
  INITIAL_GENERIC_ESCROW_FORM,
  toGenericEscrowPayload,
  type GenericEscrowFormState,
} from '@/lib/escrow/generic-escrow';

const key = (letter: string) => `G${letter.repeat(55)}`;
const contract = `C${'A'.repeat(55)}`;

function validForm(): GenericEscrowFormState {
  return {
    ...INITIAL_GENERIC_ESCROW_FORM,
    agreementType: 'freelance',
    agreementReference: 'inv-1',
    depositor: key('A'),
    beneficiary: key('B'),
    arbiter: key('C'),
    amount: '25.5000000',
    tokenContractId: contract,
    signers: [key('A'), key('B'), key('C')],
    feeRecipients: [
      { address: key('D'), basisPoints: '200' },
      { address: key('E'), basisPoints: '100' },
    ],
  };
}

describe('generic escrow form mapping (#6)', () => {
  it('maps XLM forms to a 2-of-3 payload with fee splits', () => {
    const payload = toGenericEscrowPayload(validForm());
    expect(payload.asset).toEqual({ assetType: 'XLM' });
    expect(payload.requiredSignatures).toBe(2);
    expect(payload.signers).toHaveLength(3);
    expect(payload.feeSplits).toEqual([
      { address: key('D'), basisPoints: 200 },
      { address: key('E'), basisPoints: 100 },
    ]);
  });

  it('includes code and issuer for custom assets', () => {
    const payload = toGenericEscrowPayload({
      ...validForm(),
      assetType: 'ISSUED',
      assetCode: 'USD',
      assetIssuer: key('F'),
    });
    expect(payload.asset).toEqual({
      assetType: 'ISSUED',
      assetCode: 'USD',
      assetIssuer: key('F'),
    });
  });

  it('rejects duplicate or missing signers', () => {
    expect(() =>
      toGenericEscrowPayload({
        ...validForm(),
        signers: [key('A'), key('A'), key('B')],
      }),
    ).toThrow(/unique/);
    expect(() =>
      toGenericEscrowPayload({
        ...validForm(),
        signers: [key('A'), '', key('B')],
      }),
    ).toThrow(/three valid signers/);
  });

  it('rejects invalid amounts, asset issuers and excessive fees', () => {
    expect(() =>
      toGenericEscrowPayload({ ...validForm(), amount: '0' }),
    ).toThrow(/Amount/);
    expect(() =>
      toGenericEscrowPayload({
        ...validForm(),
        assetType: 'ISSUED',
        assetCode: 'USD',
        assetIssuer: 'bad',
      }),
    ).toThrow(/issuer/);
    expect(() =>
      toGenericEscrowPayload({
        ...validForm(),
        feeRecipients: [
          { address: key('D'), basisPoints: '9000' },
          { address: key('E'), basisPoints: '2000' },
        ],
      }),
    ).toThrow(/100%/);
  });
});
