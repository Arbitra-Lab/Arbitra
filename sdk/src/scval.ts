/**
 * Helpers for converting native JS values to/from the Soroban `ScVal` wire
 * format used by contract invocations.
 *
 * Soroban's `#[contracttype]` derive macro encodes:
 *  - structs with named fields  -> `Map<Symbol, Val>`, entries sorted by field name
 *  - fieldless ("unit") enum variants -> a bare `Symbol` of the variant name
 *  - enum variants carrying data -> `Vec<Val>` of `[Symbol(variant), ...fields]`
 *  - `Option<T>`                -> `Void` for `None`, the inner value for `Some`
 *
 * These helpers build/read values that match that encoding so hand-written
 * contract calls interoperate correctly with Arbitra's contracts.
 */
import { Address, nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';

export type Optional<T> = T | null | undefined;

export const scval = {
  address(value: string | Address): xdr.ScVal {
    return (value instanceof Address ? value : new Address(value)).toScVal();
  },

  string(value: string): xdr.ScVal {
    return nativeToScVal(value, { type: 'string' });
  },

  symbol(value: string): xdr.ScVal {
    return nativeToScVal(value, { type: 'symbol' });
  },

  bool(value: boolean): xdr.ScVal {
    return xdr.ScVal.scvBool(value);
  },

  u32(value: number): xdr.ScVal {
    return nativeToScVal(value, { type: 'u32' });
  },

  i32(value: number): xdr.ScVal {
    return nativeToScVal(value, { type: 'i32' });
  },

  u64(value: bigint | number | string): xdr.ScVal {
    return nativeToScVal(BigInt(value), { type: 'u64' });
  },

  i64(value: bigint | number | string): xdr.ScVal {
    return nativeToScVal(BigInt(value), { type: 'i64' });
  },

  u128(value: bigint | number | string): xdr.ScVal {
    return nativeToScVal(BigInt(value), { type: 'u128' });
  },

  i128(value: bigint | number | string): xdr.ScVal {
    return nativeToScVal(BigInt(value), { type: 'i128' });
  },

  bytes(value: Uint8Array | Buffer): xdr.ScVal {
    return xdr.ScVal.scvBytes(Buffer.from(value));
  },

  /** 32-byte fixed buffer (`BytesN<32>`), e.g. escrow/case identifiers. */
  bytesN(value: Uint8Array | Buffer | string): xdr.ScVal {
    const buf =
      typeof value === 'string' ? Buffer.from(value.replace(/^0x/, ''), 'hex') : Buffer.from(value);
    return xdr.ScVal.scvBytes(buf);
  },

  void(): xdr.ScVal {
    return xdr.ScVal.scvVoid();
  },

  /** Encodes `Option<T>`: `null`/`undefined` becomes `Void`, otherwise the encoded value. */
  option<T>(value: Optional<T>, encode: (v: T) => xdr.ScVal): xdr.ScVal {
    return value === null || value === undefined ? xdr.ScVal.scvVoid() : encode(value);
  },

  vec(items: xdr.ScVal[]): xdr.ScVal {
    return xdr.ScVal.scvVec(items);
  },

  /** Encodes a `#[contracttype]` struct with named fields as a sorted `Map<Symbol, Val>`. */
  struct(fields: Record<string, xdr.ScVal>): xdr.ScVal {
    const entries = Object.keys(fields)
      .sort()
      .map(
        (key) =>
          new xdr.ScMapEntry({
            key: nativeToScVal(key, { type: 'symbol' }),
            val: fields[key],
          }),
      );
    return xdr.ScVal.scvMap(entries);
  },

  /** Encodes a fieldless enum variant, e.g. `AgreementStatus::Active`. */
  unitEnum(variant: string): xdr.ScVal {
    return nativeToScVal(variant, { type: 'symbol' });
  },

  /** Encodes a data-carrying enum variant as `Vec[Symbol(variant), ...values]`. */
  dataEnum(variant: string, values: xdr.ScVal[] = []): xdr.ScVal {
    return xdr.ScVal.scvVec([nativeToScVal(variant, { type: 'symbol' }), ...values]);
  },

  /** Decodes any `ScVal` return value back into a plain JS value. */
  toNative<T = unknown>(value: xdr.ScVal): T {
    return scValToNative(value) as T;
  },
};
