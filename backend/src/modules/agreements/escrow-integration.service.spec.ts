import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EscrowIntegrationService } from './escrow-integration.service';
import {
  StellarEscrow,
  EscrowStatus,
} from '../stellar/entities/stellar-escrow.entity';
import { EscrowContractService } from '../stellar/services/escrow-contract.service';
import { RentAgreement } from '../rent/entities/rent-contract.entity';

describe('EscrowIntegrationService', () => {
  let service: EscrowIntegrationService;
  let escrowRepository: Repository<StellarEscrow>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscrowIntegrationService,
        {
          provide: getRepositoryToken(StellarEscrow),
          useValue: { findOne: jest.fn(), create: jest.fn(), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(RentAgreement),
          useValue: { findOne: jest.fn() },
        },
        { provide: EscrowContractService, useValue: {} },
        { provide: DataSource, useValue: { createQueryRunner: jest.fn() } },
      ],
    }).compile();

    service = module.get(EscrowIntegrationService);
    escrowRepository = module.get(getRepositoryToken(StellarEscrow));
  });

  describe('getEscrowForAgreement', () => {
    it('returns the escrow linked to the agreement', async () => {
      const escrow = { id: 1, rentAgreementId: 'agr-1' } as StellarEscrow;
      jest.spyOn(escrowRepository, 'findOne').mockResolvedValue(escrow);

      const result = await service.getEscrowForAgreement('agr-1');

      expect(result).toBe(escrow);
      expect(escrowRepository.findOne).toHaveBeenCalledWith({
        where: { rentAgreementId: 'agr-1' },
      });
    });

    it('returns null when no escrow exists', async () => {
      jest.spyOn(escrowRepository, 'findOne').mockResolvedValue(null);

      expect(await service.getEscrowForAgreement('agr-1')).toBeNull();
    });
  });

  describe('cancelEscrowForAgreement', () => {
    it('marks a pending escrow CANCELLED', async () => {
      const escrow = {
        id: 1,
        rentAgreementId: 'agr-1',
        status: EscrowStatus.PENDING,
      } as StellarEscrow;
      jest.spyOn(escrowRepository, 'findOne').mockResolvedValue(escrow);
      jest
        .spyOn(escrowRepository, 'save')
        .mockImplementation(async (e) => e as StellarEscrow);

      await service.cancelEscrowForAgreement('agr-1', 'activation rolled back');

      expect(escrow.status).toBe(EscrowStatus.CANCELLED);
      expect(escrowRepository.save).toHaveBeenCalledWith(escrow);
    });

    it('is a no-op when no escrow exists', async () => {
      jest.spyOn(escrowRepository, 'findOne').mockResolvedValue(null);

      await service.cancelEscrowForAgreement('agr-1', 'reason');

      expect(escrowRepository.save).not.toHaveBeenCalled();
    });

    it('never cancels an already-RELEASED escrow', async () => {
      const escrow = {
        id: 1,
        rentAgreementId: 'agr-1',
        status: EscrowStatus.RELEASED,
      } as StellarEscrow;
      jest.spyOn(escrowRepository, 'findOne').mockResolvedValue(escrow);

      await service.cancelEscrowForAgreement('agr-1', 'reason');

      expect(escrow.status).toBe(EscrowStatus.RELEASED);
      expect(escrowRepository.save).not.toHaveBeenCalled();
    });
  });
});
