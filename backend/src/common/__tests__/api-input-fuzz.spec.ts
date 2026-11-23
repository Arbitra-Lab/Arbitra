import {
  ArgumentMetadata,
  BadRequestException,
  Type,
  ValidationPipe,
} from '@nestjs/common';
import { RegisterDto } from '../../modules/auth/dto/register.dto';
import { LoginDto } from '../../modules/auth/dto/login.dto';
import { RefreshTokenDto } from '../../modules/auth/dto/refresh-token.dto';
import { ForgotPasswordDto } from '../../modules/auth/dto/forgot-password.dto';
import { ResetPasswordDto } from '../../modules/auth/dto/reset-password.dto';
import { CreatePropertyDto } from '../../modules/properties/dto/create-property.dto';
import { UpdatePropertyDto } from '../../modules/properties/dto/update-property.dto';
import { CreateAgreementDto } from '../../modules/agreements/dto/create-agreement.dto';
import { UpdateAgreementDto } from '../../modules/agreements/dto/update-agreement.dto';
import { TerminateAgreementDto } from '../../modules/agreements/dto/terminate-agreement.dto';
import { CreateDisputeDto } from '../../modules/disputes/dto/create-dispute.dto';
import { UpdateDisputeDto } from '../../modules/disputes/dto/update-dispute.dto';
import { AddEvidenceDto } from '../../modules/disputes/dto/add-evidence.dto';
import { CreatePaymentRecordDto } from '../../modules/payments/dto/record-payment.dto';
import { ProcessRefundDto } from '../../modules/payments/dto/process-refund.dto';
import { ProcessStellarRentGatewayDto } from '../../modules/payments/dto/payment-gateway.dto';
import { CreateReviewDto } from '../../modules/reviews/dto/create-review.dto';
import { CreatePropertyInquiryDto } from '../../modules/inquiries/dto/create-property-inquiry.dto';
import { SubmitKycDto } from '../../modules/kyc/kyc.dto';
import { GetUploadUrlDto } from '../../modules/storage/dto/upload-url.dto';
import { SubmitFeedbackDto } from '../../modules/feedback/dto/submit-feedback.dto';
import { CreateTenantScreeningRequestDto } from '../../modules/screening/dto/create-tenant-screening-request.dto';
import { UpdateUserProfileDto } from '../../modules/users/dto/update-user.dto';

const INPUTS_PER_ENDPOINT = 100;

const CRITICAL_ENDPOINTS: Array<{ route: string; dto: Type<unknown> }> = [
  { route: 'POST /api/auth/register', dto: RegisterDto },
  { route: 'POST /api/auth/login', dto: LoginDto },
  { route: 'POST /api/auth/refresh', dto: RefreshTokenDto },
  { route: 'POST /api/auth/forgot-password', dto: ForgotPasswordDto },
  { route: 'POST /api/auth/reset-password', dto: ResetPasswordDto },
  { route: 'POST /api/properties', dto: CreatePropertyDto },
  { route: 'PATCH /api/properties/:id', dto: UpdatePropertyDto },
  { route: 'POST /api/agreements', dto: CreateAgreementDto },
  { route: 'PATCH /api/agreements/:id', dto: UpdateAgreementDto },
  { route: 'DELETE /api/agreements/:id', dto: TerminateAgreementDto },
  { route: 'POST /api/disputes', dto: CreateDisputeDto },
  { route: 'PUT /api/disputes/:id', dto: UpdateDisputeDto },
  { route: 'POST /api/disputes/:id/evidence', dto: AddEvidenceDto },
  { route: 'POST /api/payments', dto: CreatePaymentRecordDto },
  { route: 'POST /api/payments/:id/refund', dto: ProcessRefundDto },
  {
    route: 'POST /api/payments/stellar/rent',
    dto: ProcessStellarRentGatewayDto,
  },
  { route: 'POST /api/reviews', dto: CreateReviewDto },
  { route: 'POST /api/inquiries', dto: CreatePropertyInquiryDto },
  { route: 'POST /api/kyc/submit', dto: SubmitKycDto },
  { route: 'POST /api/storage/upload-url', dto: GetUploadUrlDto },
  { route: 'POST /api/feedback', dto: SubmitFeedbackDto },
  {
    route: 'POST /api/screenings/tenant/request',
    dto: CreateTenantScreeningRequestDto,
  },
  { route: 'PUT /api/users/me', dto: UpdateUserProfileDto },
];

const FUZZ_TARGETS = CRITICAL_ENDPOINTS.map((endpoint, endpointIndex) => ({
  ...endpoint,
  endpointIndex,
}));

const ATTACK_INPUTS = [
  "' OR 1=1; --",
  '<script>alert("xss")</script>',
  'javascript:alert(1)',
  '{"$where":"this.password == this.password"}',
  '<img src=x onerror=alert(1)>',
  'x'.repeat(16_384),
  '\u0000\u202e\u2028\u2029',
];

function createRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function createFuzzPayload(endpointIndex: number, iteration: number) {
  const random = createRandom((endpointIndex + 1) * 0x9e3779b1 + iteration);
  const attack = ATTACK_INPUTS[Math.floor(random() * ATTACK_INPUTS.length)];
  const randomText = Array.from({ length: 32 }, () =>
    String.fromCharCode(32 + Math.floor(random() * 95)),
  ).join('');
  const randomKey = Array.from({ length: 12 }, () =>
    String.fromCharCode(97 + Math.floor(random() * 26)),
  ).join('');

  return {
    email: attack,
    password: randomText,
    description: iteration % 7 === 0 ? 'x'.repeat(16_384) : attack,
    amount: random() < 0.5 ? randomText : attack,
    [`unexpected_${randomKey}`]: {
      input: attack,
      nested: [randomText, { [`key_${randomKey}`]: attack }],
    },
  };
}

describe('API input validation fuzz tests', () => {
  const validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  it.each(FUZZ_TARGETS)(
    'rejects malformed inputs for $route',
    async ({ dto, endpointIndex }) => {
      const metadata: ArgumentMetadata = { type: 'body', metatype: dto };

      for (let iteration = 0; iteration < INPUTS_PER_ENDPOINT; iteration++) {
        let rejection: unknown;
        try {
          await validationPipe.transform(
            createFuzzPayload(endpointIndex, iteration),
            metadata,
          );
        } catch (error) {
          rejection = error;
        }

        expect(rejection).toBeInstanceOf(BadRequestException);
        if (rejection instanceof BadRequestException) {
          expect(rejection.getStatus()).toBe(400);
        }
      }
    },
  );
});
