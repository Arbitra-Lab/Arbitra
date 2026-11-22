import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeConfig, FeeAgreementType } from './entities/fee-config.entity';
import {
  FeeCollection,
  FeeCollectionStatus,
} from './entities/fee-collection.entity';
import { CreateFeeConfigDto, CalculateFeeDto } from './dto/fee-config.dto';

function roundMoney(v: number) {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

@Injectable()
export class FeeService {
  private readonly logger = new Logger(FeeService.name);

  constructor(
    @InjectRepository(FeeConfig)
    private readonly feeConfigRepo: Repository<FeeConfig>,
    @InjectRepository(FeeCollection)
    private readonly feeCollectionRepo: Repository<FeeCollection>,
  ) {}

  async upsertConfig(dto: CreateFeeConfigDto): Promise<FeeConfig> {
    const existing = await this.feeConfigRepo.findOne({
      where: { agreementType: dto.agreementType, name: dto.name },
    });
    const entity = this.feeConfigRepo.create({
      ...(existing || {}),
      agreementType: dto.agreementType,
      name: dto.name,
      baseRate: String(dto.baseRate),
      flatFee: String(dto.flatFee ?? 0),
      minFee: dto.minFee == null ? null : String(dto.minFee),
      maxFee: dto.maxFee == null ? null : String(dto.maxFee),
      volumeTiers: (dto.volumeTiers || null) as any,
      isActive: dto.isActive ?? true,
    });
    return this.feeConfigRepo.save(entity);
  }

  async listConfigs(): Promise<FeeConfig[]> {
    return this.feeConfigRepo.find({
      order: { agreementType: 'ASC', createdAt: 'DESC' },
    });
  }

  async resolveConfig(
    agreementType: FeeAgreementType,
  ): Promise<FeeConfig | null> {
    return (
      (await this.feeConfigRepo.findOne({
        where: { agreementType, isActive: true },
        order: { createdAt: 'DESC' },
      })) ||
      (await this.feeConfigRepo.findOne({
        where: { agreementType: FeeAgreementType.DEFAULT, isActive: true },
        order: { createdAt: 'DESC' },
      }))
    );
  }

  async calculateFee(dto: CalculateFeeDto) {
    const agreementType = dto.agreementType ?? FeeAgreementType.DEFAULT;
    const config = await this.resolveConfig(agreementType);
    const baseRate = config ? Number(config.baseRate) : 0.02;
    const flatFee = config ? Number(config.flatFee) : 0;
    let rate = baseRate;
    const tiers = config?.volumeTiers || [];
    const volume = dto.historicalVolume ?? 0;
    for (const tier of tiers) {
      const minOk = volume >= Number(tier.minVolume);
      const maxOk = tier.maxVolume == null || volume <= Number(tier.maxVolume);
      if (minOk && maxOk) rate = Number(tier.rate);
    }
    let feeAmount = roundMoney(dto.amount * rate + flatFee);
    const minFee = config?.minFee == null ? null : Number(config.minFee);
    const maxFee = config?.maxFee == null ? null : Number(config.maxFee);
    if (minFee != null) feeAmount = Math.max(feeAmount, minFee);
    if (maxFee != null) feeAmount = Math.min(feeAmount, maxFee);
    feeAmount = roundMoney(Math.max(0, feeAmount));
    return {
      agreementType,
      amount: dto.amount,
      currency: dto.currency ?? 'NGN',
      rate,
      flatFee,
      feeAmount,
      netAmount: roundMoney(dto.amount - feeAmount),
      configId: config?.id ?? null,
      transparent: true,
    };
  }

  async recordCollection(params: {
    paymentId?: string | null;
    agreementId?: string | null;
    agreementType: string;
    grossAmount: number;
    feeAmount: number;
    currency: string;
    breakdown?: Record<string, unknown>;
  }) {
    const rec = this.feeCollectionRepo.create({
      paymentId: params.paymentId ?? null,
      agreementId: params.agreementId ?? null,
      agreementType: params.agreementType,
      grossAmount: String(params.grossAmount),
      feeAmount: String(params.feeAmount),
      refundedAmount: '0',
      currency: params.currency,
      status: FeeCollectionStatus.COLLECTED,
      breakdown: params.breakdown ?? null,
    });
    return this.feeCollectionRepo.save(rec);
  }

  async markRefunded(paymentId: string, amount: number) {
    const rec = await this.feeCollectionRepo.findOne({ where: { paymentId } });
    if (!rec) return null;
    const refunded = roundMoney(Number(rec.refundedAmount) + amount);
    rec.refundedAmount = String(refunded);
    rec.status =
      refunded >= Number(rec.feeAmount)
        ? FeeCollectionStatus.REFUNDED
        : FeeCollectionStatus.PARTIALLY_REFUNDED;
    return this.feeCollectionRepo.save(rec);
  }

  async analytics() {
    const rows = await this.feeCollectionRepo.find();
    const totalCollected = roundMoney(
      rows.reduce((s, r) => s + Number(r.feeAmount), 0),
    );
    const totalRefunded = roundMoney(
      rows.reduce((s, r) => s + Number(r.refundedAmount), 0),
    );
    const byAgreementType = rows.reduce<
      Record<string, { collected: number; refunded: number; count: number }>
    >((acc, r) => {
      const k = r.agreementType;
      acc[k] ??= { collected: 0, refunded: 0, count: 0 };
      acc[k].collected = roundMoney(acc[k].collected + Number(r.feeAmount));
      acc[k].refunded = roundMoney(acc[k].refunded + Number(r.refundedAmount));
      acc[k].count += 1;
      return acc;
    }, {});
    return {
      totalCollected,
      totalRefunded,
      netRevenue: roundMoney(totalCollected - totalRefunded),
      count: rows.length,
      byAgreementType,
    };
  }
}
