# Houston Housing API Documentation Standards

This document defines the conventions all backend engineers must follow when adding or modifying API endpoints. Following these standards keeps Swagger/OpenAPI output accurate and consistent.

---

## 1. Swagger/OpenAPI Annotations

Every public endpoint **must** carry the following decorators from `@nestjs/swagger`.

### Controller level

```typescript
@ApiTags('Payments') // groups endpoints in Swagger UI
@ApiBearerAuth('JWT-auth') // shows the padlock icon
@Controller('payments')
export class PaymentsController {}
```

### Method level (minimum required set)

```typescript
@ApiOperation({
  summary: 'Initiate a rent payment',
  description:
    'Creates a pending payment record and returns a Stellar transaction ' +
    'envelope for the client to sign. Idempotent when an `Idempotency-Key` ' +
    'header is provided.',
})
@ApiResponse({ status: 201, description: 'Payment initiated', type: PaymentResponseDto })
@ApiResponse({ status: 400, description: 'Validation error', type: ErrorResponseDto })
@ApiResponse({ status: 401, description: 'Unauthenticated' })
@ApiResponse({ status: 422, description: 'Business rule violation', type: ErrorResponseDto })
@Post()
async initiatePayment(@Body() dto: InitiatePaymentDto): Promise<PaymentResponseDto> {}
```

### DTO level

Every DTO property must have `@ApiProperty` (or `@ApiPropertyOptional` for optional fields):

```typescript
export class InitiatePaymentDto {
  @ApiProperty({
    description: 'Agreement ID this payment is for',
    example: 'agr_01HN7K3P2X',
  })
  @IsString()
  agreementId: string;

  @ApiProperty({
    description: 'Amount in stroops (1 XLM = 10,000,000 stroops)',
    example: 5000000000,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  amountStroops: number;

  @ApiPropertyOptional({
    description: 'Memo to attach to the Stellar transaction',
    maxLength: 28,
    example: 'Rent April 2025',
  })
  @IsOptional()
  @IsString()
  @MaxLength(28)
  memo?: string;
}
```

---

## 2. HTTP Status Codes

| Scenario                          | Status |
| --------------------------------- | ------ |
| Successful GET / list             | 200    |
| Resource created                  | 201    |
| No content (DELETE success)       | 204    |
| Validation / schema error         | 400    |
| Unauthenticated                   | 401    |
| Authenticated but not authorised  | 403    |
| Resource not found                | 404    |
| Conflict (duplicate, state clash) | 409    |
| Business rule violation           | 422    |
| Rate limit exceeded               | 429    |
| Unexpected server error           | 500    |
| Downstream service unavailable    | 503    |

---

## 3. Request / Response Format

### Success response (single resource)

```json
{
  "id": "pay_01HN7K3P2X",
  "status": "PENDING",
  "amountStroops": 5000000000,
  "currency": "XLM",
  "createdAt": "2025-04-01T09:30:00Z"
}
```

### Success response (paginated list)

```json
{
  "data": [{ "id": "pay_01HN7K3P2X", "status": "PENDING" }],
  "meta": {
    "total": 142,
    "page": 1,
    "limit": 20,
    "totalPages": 8
  }
}
```

### Error response

All error responses follow the `ErrorResponseDto` shape:

```json
{
  "statusCode": 422,
  "error": "PAYMENT_AMOUNT_BELOW_MINIMUM",
  "message": "Payment amount must be at least 1 stroop.",
  "timestamp": "2025-04-01T09:30:00Z",
  "path": "/api/payments",
  "requestId": "req_a1b2c3d4"
}
```

The `error` field is a stable machine-readable code. See [ERROR-CODES.md](./ERROR-CODES.md) for the full registry.

---

## 4. Authentication Documentation

Every protected endpoint must include:

1. `@ApiBearerAuth('JWT-auth')` on the controller or individual method.
2. An `@ApiResponse({ status: 401, description: 'Unauthenticated' })`.
3. An `@ApiResponse({ status: 403, description: 'Insufficient permissions' })` if role checks apply.

Public endpoints (e.g. health check, Stellar challenge) must be explicitly marked:

```typescript
@ApiSecurity([])  // overrides controller-level ApiBearerAuth
@Get('challenge')
async getChallenge() {}
```

---

## 5. Pagination

Use `PaginationQueryDto` for all list endpoints:

```typescript
@ApiQuery({ name: 'page', required: false, example: 1 })
@ApiQuery({ name: 'limit', required: false, example: 20 })
@Get()
async list(@Query() query: PaginationQueryDto) {}
```

See [PAGINATION.md](./PAGINATION.md) for cursor-based pagination used on high-throughput resources.

---

## 6. Filtering & Sorting

Document every supported query parameter explicitly:

```typescript
@ApiQuery({ name: 'status', enum: PaymentStatus, required: false })
@ApiQuery({ name: 'from', description: 'ISO 8601 start date', required: false, example: '2025-01-01' })
@ApiQuery({ name: 'to',   description: 'ISO 8601 end date',   required: false, example: '2025-03-31' })
@ApiQuery({ name: 'sort', enum: ['createdAt', '-createdAt', 'amount', '-amount'], required: false })
```

A `-` prefix on a sort field means descending order.

---

## 7. Idempotency

Endpoints that create or mutate resources should support an `Idempotency-Key` header:

```typescript
@ApiHeader({
  name: 'Idempotency-Key',
  description:
    'Client-generated unique key (UUID v4). Repeated requests with the same ' +
    'key within 24 hours return the original response without re-executing.',
  required: false,
  example: '550e8400-e29b-41d4-a716-446655440000',
})
```

---

## 8. Deprecating an Endpoint

1. Add `deprecated: true` to the `@ApiOperation` decorator.
2. Add a `@ApiHeader` noting the replacement.
3. Log a warning in the controller if the deprecated path is hit.
4. Record the deprecation in [API-CHANGELOG.md](./API-CHANGELOG.md) with a sunset date.

For full details on our versioning lifecycle, deprecation notices (including `Sunset` headers), and migration procedures, refer to the [API Versioning Strategy](./API-VERSIONING.md).

```typescript
@ApiOperation({
  summary: '[DEPRECATED] Get payment — use GET /api/payments/:id instead',
  deprecated: true,
})
```

---

## 9. Auto-Generation

The OpenAPI JSON spec is generated at application boot by `SwaggerModule.createDocument`. To export a static copy:

```bash
pnpm run generate:openapi   # writes openapi.json to project root
```

Client SDKs can be generated from this spec — see [SDK-GENERATION.md](./SDK-GENERATION.md).

---

## 10. Reviewing API Documentation

PR reviewers must verify:

- [ ] All new endpoints have `@ApiTags`, `@ApiOperation`, and at least one `@ApiResponse`.
- [ ] All DTO properties have `@ApiProperty` with `description` and `example`.
- [ ] New error codes are added to [ERROR-CODES.md](./ERROR-CODES.md).
- [ ] Breaking changes are recorded in [API-CHANGELOG.md](./API-CHANGELOG.md).
- [ ] Rate-limited endpoints are documented in [RATE-LIMITING.md](./RATE-LIMITING.md).
