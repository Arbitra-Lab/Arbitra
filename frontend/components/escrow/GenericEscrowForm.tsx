'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';

import {
  INITIAL_GENERIC_ESCROW_FORM,
  toGenericEscrowPayload,
  type GenericEscrowFormState,
} from '@/lib/escrow/generic-escrow';
import {
  useCreateGenericEscrow,
  useResolveGenericAsset,
  type GenericEscrowResult,
} from '@/lib/query/hooks/use-generic-escrow';

const inputClass =
  'mt-1 w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-white';

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-white/70">{label}</span>
      <input
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

/** Agreement-agnostic escrow creation form (#6). */
export function GenericEscrowForm() {
  const [form, setForm] = useState<GenericEscrowFormState>(
    INITIAL_GENERIC_ESCROW_FORM,
  );
  const [result, setResult] = useState<GenericEscrowResult | null>(null);
  const create = useCreateGenericEscrow();
  const resolveAsset = useResolveGenericAsset();

  const update = <K extends keyof GenericEscrowFormState>(
    key: K,
    value: GenericEscrowFormState[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const updateSigner = (index: number, value: string) =>
    setForm((current) => {
      const signers = [...current.signers] as GenericEscrowFormState['signers'];
      signers[index] = value;
      return { ...current, signers };
    });

  const updateFeeRecipient = (
    index: number,
    key: 'address' | 'basisPoints',
    value: string,
  ) =>
    setForm((current) => ({
      ...current,
      feeRecipients: current.feeRecipients.map((recipient, i) =>
        i === index ? { ...recipient, [key]: value } : recipient,
      ),
    }));

  const submit = async () => {
    try {
      const payload = toGenericEscrowPayload(form);
      const created = await create.mutateAsync(payload);
      setResult(created);
      toast.success(`Escrow created: ${created.escrowId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create escrow',
      );
    }
  };

  const verifyAsset = async () => {
    try {
      const payload = toGenericEscrowPayload(form);
      const asset = await resolveAsset.mutateAsync(payload.asset);
      toast.success(
        asset.verifiedOnHorizon
          ? 'Asset verified on Horizon'
          : 'Asset not found on Horizon',
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Asset lookup failed',
      );
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-semibold text-white">Escrow details</h2>
      <p className="mb-4 mt-1 text-sm text-white/60">
        Works for rentals, freelance, trade or any other agreement. 2-of-3
        multisig is required; at most two fee recipients are supported.
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Agreement type"
          value={form.agreementType}
          onChange={(value) => update('agreementType', value)}
        />
        <Field
          label="Agreement reference"
          value={form.agreementReference}
          onChange={(value) => update('agreementReference', value)}
        />
        <Field
          label="Depositor public key"
          value={form.depositor}
          onChange={(value) => update('depositor', value)}
        />
        <Field
          label="Beneficiary public key"
          value={form.beneficiary}
          onChange={(value) => update('beneficiary', value)}
        />
        <Field
          label="Arbiter public key"
          value={form.arbiter}
          onChange={(value) => update('arbiter', value)}
        />
        <Field
          label="Amount"
          value={form.amount}
          onChange={(value) => update('amount', value)}
          placeholder="100.0000000"
        />
        <label className="block text-sm">
          <span className="text-white/70">Asset</span>
          <select
            className={inputClass}
            value={form.assetType}
            onChange={(event) =>
              update(
                'assetType',
                event.target.value as GenericEscrowFormState['assetType'],
              )
            }
          >
            <option value="XLM">XLM (native)</option>
            <option value="ISSUED">Custom Stellar asset</option>
          </select>
        </label>
        {form.assetType === 'ISSUED' && (
          <>
            <Field
              label="Asset code"
              value={form.assetCode}
              onChange={(value) => update('assetCode', value)}
            />
            <Field
              label="Asset issuer"
              value={form.assetIssuer}
              onChange={(value) => update('assetIssuer', value)}
            />
          </>
        )}
        <Field
          label="Token contract id"
          value={form.tokenContractId}
          onChange={(value) => update('tokenContractId', value)}
        />
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-white/80">
        Multisig signers (2 of 3)
      </h3>
      <div className="grid gap-4 md:grid-cols-3">
        {form.signers.map((signer, index) => (
          <Field
            key={index}
            label={`Signer ${index + 1}`}
            value={signer}
            onChange={(value) => updateSigner(index, value)}
          />
        ))}
      </div>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-white/80">
        Fee splits (basis points, 100 = 1%)
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        {form.feeRecipients.map((recipient, index) => (
          <div key={index} className="grid grid-cols-2 gap-2">
            <Field
              label={`Recipient ${index + 1}`}
              value={recipient.address}
              onChange={(value) => updateFeeRecipient(index, 'address', value)}
            />
            <Field
              label="Basis points"
              value={recipient.basisPoints}
              onChange={(value) =>
                updateFeeRecipient(index, 'basisPoints', value)
              }
            />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={create.isPending}
          data-testid="create-generic-escrow"
          className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
        >
          {create.isPending ? 'Creating…' : 'Create escrow'}
        </button>
        {form.assetType === 'ISSUED' && (
          <button
            type="button"
            onClick={verifyAsset}
            disabled={resolveAsset.isPending}
            className="rounded-lg border border-white/20 px-4 py-2 text-sm text-white"
          >
            Verify asset on Horizon
          </button>
        )}
      </div>

      {result && (
        <div className="mt-5 rounded-lg bg-emerald-500/10 p-4 text-sm text-emerald-200">
          Created escrow <strong>{result.escrowId}</strong> for{' '}
          {result.asset.id} with 2-of-3 multisig.
        </div>
      )}
    </section>
  );
}
