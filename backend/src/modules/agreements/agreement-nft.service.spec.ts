import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgreementNftService } from './agreement-nft.service';
import { RentObligationNftService } from '../stellar/services/rent-obligation-nft.service';
import { RentObligationNft } from './entities/rent-obligation-nft.entity';

describe('AgreementNftService', () => {
  let service: AgreementNftService;
  let nftRepository: Repository<RentObligationNft>;
  let nftContractService: RentObligationNftService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgreementNftService,
        {
          provide: getRepositoryToken(RentObligationNft),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: RentObligationNftService,
          useValue: {
            mintObligation: jest.fn(),
            transferObligation: jest.fn(),
            getObligationOwner: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AgreementNftService>(AgreementNftService);
    nftRepository = module.get<Repository<RentObligationNft>>(
      getRepositoryToken(RentObligationNft),
    );
    nftContractService = module.get<RentObligationNftService>(
      RentObligationNftService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('mintNftForAgreement', () => {
    it('should mint NFT successfully', async () => {
      const agreementId = 'agreement-123';
      const adminAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

      jest.spyOn(nftRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(nftContractService, 'mintObligation').mockResolvedValue({
        txHash: 'tx-hash-123',
        obligationId: agreementId,
      });
      jest.spyOn(nftRepository, 'create').mockReturnValue({
        agreementId,
        currentOwner: adminAddress,
      } as RentObligationNft);
      jest.spyOn(nftRepository, 'save').mockResolvedValue({
        id: 'nft-id',
        agreementId,
      } as RentObligationNft);

      const result = await service.mintNftForAgreement(
        agreementId,
        adminAddress,
      );

      expect(result).toBeDefined();
      expect(nftContractService.mintObligation).toHaveBeenCalledWith({
        agreementId,
        adminAddress,
      });
    });

    it('should throw error if NFT already exists', async () => {
      const agreementId = 'agreement-123';
      const adminAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

      jest.spyOn(nftRepository, 'findOne').mockResolvedValue({
        id: 'existing-nft',
        agreementId,
      } as RentObligationNft);

      await expect(
        service.mintNftForAgreement(agreementId, adminAddress),
      ).rejects.toThrow('NFT already minted');
    });
  });

  describe('voidNftForAgreement', () => {
    it('marks the NFT voided and inactive', async () => {
      const agreementId = 'agreement-123';
      const nft = {
        id: 'nft-id',
        agreementId,
        status: 'active',
        isActive: true,
      } as RentObligationNft;

      jest.spyOn(nftRepository, 'findOne').mockResolvedValue(nft);
      jest
        .spyOn(nftRepository, 'save')
        .mockImplementation(async (n) => n as RentObligationNft);

      await service.voidNftForAgreement(agreementId, 'activation rolled back');

      expect(nft.status).toBe('voided');
      expect(nft.isActive).toBe(false);
      expect(nftRepository.save).toHaveBeenCalledWith(nft);
    });

    it('is a no-op when no NFT exists for the agreement', async () => {
      jest.spyOn(nftRepository, 'findOne').mockResolvedValue(null);

      await service.voidNftForAgreement('agreement-123', 'reason');

      expect(nftRepository.save).not.toHaveBeenCalled();
    });

    it('is a no-op when the NFT is already voided', async () => {
      const nft = { id: 'nft-id', status: 'voided' } as RentObligationNft;
      jest.spyOn(nftRepository, 'findOne').mockResolvedValue(nft);

      await service.voidNftForAgreement('agreement-123', 'reason');

      expect(nftRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('transferNft', () => {
    it('should transfer NFT successfully', async () => {
      const agreementId = 'agreement-123';
      const fromAddress = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const toAddress = 'GYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';

      const existingNft = {
        id: 'nft-id',
        agreementId,
        currentOwner: fromAddress,
        transferCount: 0,
      } as RentObligationNft;

      jest.spyOn(nftRepository, 'findOne').mockResolvedValue(existingNft);
      jest.spyOn(nftContractService, 'transferObligation').mockResolvedValue({
        txHash: 'transfer-tx-hash',
      });
      jest.spyOn(nftRepository, 'save').mockResolvedValue(existingNft);

      const result = await service.transferNft(
        agreementId,
        fromAddress,
        toAddress,
      );

      expect(result.currentOwner).toBe(toAddress);
      expect(result.transferCount).toBe(1);
    });
  });
});
