import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Horizon } from '@stellar/stellar-sdk';
import { Repository } from 'typeorm';
import { GenericEscrowService } from '../services/generic-escrow.service';
import { EscrowContractService } from '../services/escrow-contract.service';
import { CreateGenericEscrowDto } from '../dto/generic-escrow.dto';
import { StellarEscrow } from '../entities/stellar-escrow.entity';

const TOKEN_CONTRACT = `C${'A'.repeat(55)}`;
const KEY_A = `G${'B'.repeat(55)}`;
const KEY_B = `G${'C'.repeat(55)}`;
const KEY_C = `G${'D'.repeat(55)}`;
const KEY_FEE_1 = `G${'E'.repeat(55)}`;
const KEY_FEE_2 = `G${'F'.repeat(55)}`;

function makeDto(
  overrides: Partial<CreateGenericEscrowDto> = {},
): CreateGenericEscrowDto {
  return {
    agreementType: 'freelance',
    agreementReference: 'invoice-42',
    depositor: KEY_A,
    beneficiary: KEY_B,
    arbiter: KEY_C,
    amount: '100.0000000',
    asset: { assetType: 'XLM' },
    tokenContractId: TOKEN_CONTRACT,
    signers: [KEY_A, KEY_B, KEY_C],
    requiredSignatures: 2,
    feeSplits: [
      { address: KEY_FEE_1, basisPoints: 250 },
      { address: KEY_FEE_2, basisPoints: 150 },
    ],
    ...overrides,
  };
}

describe('GenericEscrowService (#6)', () => {
  let service: GenericEscrowService;
  let contract: { createMultiSigEscrow: jest.Mock };
  let repository: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(() => {
    const config = {
      get: jest.fn(() => 'https://horizon-testnet.stellar.org'),
    } as unknown as ConfigService;
    contract = {
      createMultiSigEscrow: jest.fn().mockResolvedValue('escrow-1'),
    };
    repository = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        escrowMetadata: { existing: true },
      }),
      save: jest.fn().mockResolvedValue(undefined),
    };
    service = new GenericEscrowService(
      config,
      contract as unknown as EscrowContractService,
      repository as unknown as Repository<StellarEscrow>,
    );
  });

  it('builds an agreement-agnostic 2-of-3 plan with fee distributions', () => {
    const plan = service.buildPlan(makeDto(), {
      id: 'native',
      assetType: 'XLM',
      verifiedOnHorizon: true,
    });
    expect(plan.agreementType).toBe('freelance');
    expect(plan.signers).toHaveLength(3);
    expect(plan.requiredSignatures).toBe(2);
    expect(plan.feeSplits.map((split) => split.amount)).toEqual([
      '2.5000000',
      '1.5000000',
    ]);
  });

  it('rejects invalid signer sets and fee splits', () => {
    const asset = {
      id: 'native',
      assetType: 'XLM' as const,
      verifiedOnHorizon: true,
    };
    expect(() =>
      service.buildPlan(makeDto({ signers: [KEY_A, KEY_B] }), asset),
    ).toThrow(BadRequestException);
    expect(() =>
      service.buildPlan(makeDto({ signers: [KEY_A, KEY_A, KEY_B] }), asset),
    ).toThrow(/unique/);
    expect(() =>
      service.buildPlan(
        makeDto({
          feeSplits: [
            { address: KEY_FEE_1, basisPoints: 6000 },
            { address: KEY_FEE_2, basisPoints: 5000 },
          ],
        }),
        asset,
      ),
    ).toThrow(/100%/);
    expect(() =>
      service.buildPlan(makeDto({ tokenContractId: '' }), asset),
    ).toThrow(/token contract id/);
  });

  it('resolves the native asset without a network call', async () => {
    const spy = jest.spyOn(Horizon.Server.prototype, 'assets');
    const asset = await service.describeAsset({ assetType: 'XLM' });
    expect(asset).toEqual({
      id: 'native',
      assetType: 'XLM',
      verifiedOnHorizon: true,
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('verifies issued assets through Horizon', async () => {
    const call = jest
      .fn()
      .mockResolvedValue({ records: [{ asset_code: 'USD' }] });
    const forIssuer = jest.fn(() => ({ call }));
    const forCode = jest.fn(() => ({ forIssuer }));
    const spy = jest
      .spyOn(Horizon.Server.prototype, 'assets')
      .mockReturnValue({ forCode } as never);

    const asset = await service.describeAsset({
      assetType: 'ISSUED',
      assetCode: 'USD',
      assetIssuer: KEY_A,
    });
    expect(asset.id).toBe(`USD:${KEY_A}`);
    expect(asset.verifiedOnHorizon).toBe(true);
    expect(forCode).toHaveBeenCalledWith('USD');
    expect(forIssuer).toHaveBeenCalledWith(KEY_A);
    spy.mockRestore();
  });

  it('reports Horizon lookup failures as unavailable, not as success', async () => {
    const call = jest.fn().mockRejectedValue(new Error('network down'));
    const forIssuer = jest.fn(() => ({ call }));
    const forCode = jest.fn(() => ({ forIssuer }));
    const spy = jest
      .spyOn(Horizon.Server.prototype, 'assets')
      .mockReturnValue({ forCode } as never);

    await expect(
      service.describeAsset({
        assetType: 'ISSUED',
        assetCode: 'USD',
        assetIssuer: KEY_A,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    spy.mockRestore();
  });

  it('delegates creation to the shared multisig contract and persists the plan', async () => {
    const result = await service.create(makeDto());

    expect(contract.createMultiSigEscrow).toHaveBeenCalledWith(
      expect.objectContaining({
        participants: [KEY_A, KEY_B, KEY_C],
        requiredSignatures: 2,
        token: TOKEN_CONTRACT,
        arbiter: KEY_C,
      }),
    );
    expect(result.escrowId).toBe('escrow-1');
    const saved = repository.save.mock.calls[0][0] as StellarEscrow;
    expect(saved.escrowMetadata).toEqual(
      expect.objectContaining({ existing: true }),
    );
    expect(saved.escrowMetadata.genericEscrow.agreementType).toBe('freelance');
  });

  it('still returns the escrow id when no local record exists', async () => {
    repository.findOne.mockResolvedValue(null);
    const result = await service.create(makeDto());
    expect(result.escrowId).toBe('escrow-1');
    expect(repository.save).not.toHaveBeenCalled();
  });
});
