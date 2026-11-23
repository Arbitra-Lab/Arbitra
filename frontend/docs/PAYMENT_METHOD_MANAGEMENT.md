# Payment Method Management UI Implementation Guide

## Overview

This document provides guidelines for implementing a Payment Method Management UI component for the Arbitra platform. This feature allows users to add, update, delete, and manage their payment methods securely.

## Component Architecture

### High-Level Structure

```
PaymentMethodManagement
├── PaymentMethodsList
│   ├── PaymentCard (for each method)
│   │   ├── Payment Type Icon
│   │   ├── Masked Card/Account Details
│   │   ├── Expiry/Status Info
│   │   ├── Action Buttons (Edit, Delete, SetDefault)
│   │   └── Badge (Default/Primary)
│   └── Add New Button
├── PaymentMethodForm
│   ├── Type Selector (Credit Card, Bank Account, Wallet, etc.)
│   ├── Form Fields (Dynamic based on type)
│   ├── Validation Feedback
│   └── Submit/Cancel Actions
└── ManagementPanel
    ├── Settings & Preferences
    ├── Recurring Payment Settings
    └── Payment History (optional)
```

## State Management

### Payment Method Model

```typescript
interface PaymentMethod {
  id: string;
  userId: string;
  type: 'credit_card' | 'debit_card' | 'bank_account' | 'wallet' | 'paypal';
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Credit Card specific
interface CreditCardPaymentMethod extends PaymentMethod {
  type: 'credit_card' | 'debit_card';
  cardholderName: string;
  maskedCardNumber: string; // Last 4 digits visible
  expiryMonth: number;
  expiryYear: number;
  brand: 'visa' | 'mastercard' | 'amex' | 'discover';
  billingAddress: Address;
}

// Bank Account specific
interface BankPaymentMethod extends PaymentMethod {
  type: 'bank_account';
  accountHolderName: string;
  maskedAccountNumber: string;
  bankName: string;
  routingNumber?: string;
  verificationStatus: 'pending' | 'verified' | 'failed';
}

// Digital Wallet specific
interface WalletPaymentMethod extends PaymentMethod {
  type: 'wallet';
  walletAddress: string;
  walletType: 'crypto' | 'paypal' | 'other';
  balance?: number;
  currency?: string;
}

interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}
```

### Component State

```typescript
interface PaymentMethodsState {
  methods: PaymentMethod[];
  loading: boolean;
  error: string | null;
  selectedMethodId: string | null;
  isFormOpen: boolean;
  formMode: 'add' | 'edit';
  validating: boolean;
}
```

## UI Components

### 1. Payment Methods List

```typescript
interface PaymentMethodsListProps {
  methods: PaymentMethod[];
  defaultMethodId?: string;
  loading: boolean;
  onEdit: (methodId: string) => void;
  onDelete: (methodId: string) => void;
  onSetDefault: (methodId: string) => void;
  onAdd: () => void;
}

export function PaymentMethodsList({
  methods,
  defaultMethodId,
  loading,
  onEdit,
  onDelete,
  onSetDefault,
  onAdd
}: PaymentMethodsListProps) {
  if (loading) {
    return <div className="payment-loading">Loading payment methods...</div>;
  }

  return (
    <div className="payment-methods-container" role="region" aria-label="Payment methods">
      <div className="payment-methods-list">
        {methods.length === 0 ? (
          <div className="empty-state">
            <p>No payment methods added yet</p>
            <button onClick={onAdd} className="btn btn-primary">
              Add Payment Method
            </button>
          </div>
        ) : (
          <>
            {methods.map((method) => (
              <PaymentMethodCard
                key={method.id}
                method={method}
                isDefault={method.id === defaultMethodId}
                onEdit={() => onEdit(method.id)}
                onDelete={() => onDelete(method.id)}
                onSetDefault={() => onSetDefault(method.id)}
              />
            ))}
            <button onClick={onAdd} className="btn btn-secondary add-new">
              + Add Another Payment Method
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

### 2. Payment Method Card

```typescript
interface PaymentMethodCardProps {
  method: PaymentMethod;
  isDefault: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
}

export function PaymentMethodCard({
  method,
  isDefault,
  onEdit,
  onDelete,
  onSetDefault
}: PaymentMethodCardProps) {
  const getCardDetails = () => {
    if (method.type === 'credit_card' || method.type === 'debit_card') {
      const card = method as CreditCardPaymentMethod;
      return {
        icon: getCardIcon(card.brand),
        display: `${card.brand.toUpperCase()} ending in ${card.maskedCardNumber}`,
        expiry: `Expires ${card.expiryMonth}/${card.expiryYear}`
      };
    }
    if (method.type === 'bank_account') {
      const bank = method as BankPaymentMethod;
      return {
        icon: '🏦',
        display: `${bank.bankName} - ${bank.maskedAccountNumber}`,
        expiry: `Status: ${bank.verificationStatus}`
      };
    }
    if (method.type === 'wallet') {
      const wallet = method as WalletPaymentMethod;
      return {
        icon: '💰',
        display: wallet.walletType === 'paypal' ? 'PayPal' : 'Digital Wallet',
        expiry: wallet.balance ? `Balance: ${wallet.balance} ${wallet.currency}` : ''
      };
    }
  };

  const details = getCardDetails();

  return (
    <div 
      className={`payment-card ${isDefault ? 'default' : ''} ${!method.isActive ? 'inactive' : ''}`}
      role="article"
      aria-label={`Payment method: ${details?.display}`}
    >
      <div className="card-header">
        <span className="payment-icon">{details?.icon}</span>
        <div className="card-info">
          <div className="card-display">{details?.display}</div>
          <div className="card-expiry">{details?.expiry}</div>
        </div>
        {isDefault && (
          <span className="badge badge-default" aria-label="Default payment method">
            DEFAULT
          </span>
        )}
        {!method.isActive && (
          <span className="badge badge-inactive">INACTIVE</span>
        )}
      </div>

      <div className="card-actions">
        <button
          onClick={onEdit}
          className="btn btn-sm btn-secondary"
          aria-label={`Edit ${details?.display}`}
        >
          Edit
        </button>
        {!isDefault && (
          <button
            onClick={onSetDefault}
            className="btn btn-sm btn-secondary"
            aria-label={`Set ${details?.display} as default`}
          >
            Set as Default
          </button>
        )}
        <button
          onClick={onDelete}
          className="btn btn-sm btn-danger"
          aria-label={`Delete ${details?.display}`}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function getCardIcon(brand: string): string {
  const icons: Record<string, string> = {
    visa: '💳',
    mastercard: '💳',
    amex: '💳',
    discover: '💳'
  };
  return icons[brand] || '💳';
}
```

### 3. Payment Method Form

```typescript
interface PaymentMethodFormProps {
  method?: PaymentMethod;
  onSubmit: (data: PaymentMethod) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
}

export function PaymentMethodForm({
  method,
  onSubmit,
  onCancel,
  isLoading
}: PaymentMethodFormProps) {
  const [formData, setFormData] = useState<Partial<PaymentMethod>>(
    method || { type: 'credit_card' }
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleTypeChange = (type: string) => {
    setFormData({ ...formData, type: type as any });
    setErrors({});
  };

  const handleChange = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
    if (errors[field]) {
      setErrors({ ...errors, [field]: '' });
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (formData.type === 'credit_card' || formData.type === 'debit_card') {
      const card = formData as Partial<CreditCardPaymentMethod>;
      if (!card.cardholderName) newErrors.cardholderName = 'Cardholder name is required';
      if (!card.maskedCardNumber) newErrors.maskedCardNumber = 'Card number is required';
      if (!card.expiryMonth || !card.expiryYear) newErrors.expiry = 'Expiry date is required';
    }

    if (formData.type === 'bank_account') {
      const bank = formData as Partial<BankPaymentMethod>;
      if (!bank.accountHolderName) newErrors.accountHolderName = 'Account holder name is required';
      if (!bank.maskedAccountNumber) newErrors.maskedAccountNumber = 'Account number is required';
      if (!bank.bankName) newErrors.bankName = 'Bank name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      await onSubmit(formData as PaymentMethod);
    } catch (err) {
      setErrors({
        submit: err instanceof Error ? err.message : 'Failed to save payment method'
      });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form" role="form">
      <div className="form-section">
        <label htmlFor="payment-type">Payment Type</label>
        <select
          id="payment-type"
          value={formData.type || ''}
          onChange={(e) => handleTypeChange(e.target.value)}
          disabled={isLoading || !!method}
          aria-label="Select payment method type"
        >
          <option value="credit_card">Credit Card</option>
          <option value="debit_card">Debit Card</option>
          <option value="bank_account">Bank Account</option>
          <option value="wallet">Digital Wallet</option>
          <option value="paypal">PayPal</option>
        </select>
      </div>

      {/* Render payment type specific fields */}
      {renderFormFields(formData, handleChange, errors)}

      {errors.submit && (
        <div className="error-message" role="alert">
          {errors.submit}
        </div>
      )}

      <div className="form-actions">
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={isLoading}
        >
          {isLoading ? 'Saving...' : method ? 'Update' : 'Add'}
        </button>
      </div>
    </form>
  );
}

function renderFormFields(
  formData: Partial<PaymentMethod>,
  handleChange: (field: string, value: any) => void,
  errors: Record<string, string>
): React.ReactNode {
  switch (formData.type) {
    case 'credit_card':
    case 'debit_card':
      return (
        <>
          <div className="form-section">
            <label htmlFor="cardholder-name">Cardholder Name</label>
            <input
              id="cardholder-name"
              type="text"
              value={(formData as any).cardholderName || ''}
              onChange={(e) => handleChange('cardholderName', e.target.value)}
              aria-invalid={!!errors.cardholderName}
              aria-describedby={errors.cardholderName ? 'cardholder-error' : undefined}
            />
            {errors.cardholderName && (
              <span id="cardholder-error" className="error-message">
                {errors.cardholderName}
              </span>
            )}
          </div>

          <div className="form-section">
            <label htmlFor="card-number">Card Number</label>
            <input
              id="card-number"
              type="text"
              placeholder="1234 5678 9012 3456"
              value={(formData as any).maskedCardNumber || ''}
              onChange={(e) => handleChange('maskedCardNumber', e.target.value)}
              maxLength={19}
              aria-invalid={!!errors.maskedCardNumber}
            />
            {errors.maskedCardNumber && (
              <span className="error-message">{errors.maskedCardNumber}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-section">
              <label htmlFor="expiry-month">Expiry Month</label>
              <select
                id="expiry-month"
                value={(formData as any).expiryMonth || ''}
                onChange={(e) => handleChange('expiryMonth', parseInt(e.target.value))}
              >
                <option value="">Select month</option>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {String(i + 1).padStart(2, '0')}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-section">
              <label htmlFor="expiry-year">Expiry Year</label>
              <select
                id="expiry-year"
                value={(formData as any).expiryYear || ''}
                onChange={(e) => handleChange('expiryYear', parseInt(e.target.value))}
              >
                <option value="">Select year</option>
                {Array.from({ length: 20 }, (_, i) => {
                  const year = new Date().getFullYear() + i;
                  return (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </>
      );

    case 'bank_account':
      return (
        <>
          <div className="form-section">
            <label htmlFor="account-holder">Account Holder Name</label>
            <input
              id="account-holder"
              type="text"
              value={(formData as any).accountHolderName || ''}
              onChange={(e) => handleChange('accountHolderName', e.target.value)}
            />
          </div>

          <div className="form-section">
            <label htmlFor="bank-name">Bank Name</label>
            <input
              id="bank-name"
              type="text"
              value={(formData as any).bankName || ''}
              onChange={(e) => handleChange('bankName', e.target.value)}
            />
          </div>

          <div className="form-section">
            <label htmlFor="account-number">Account Number</label>
            <input
              id="account-number"
              type="password"
              value={(formData as any).maskedAccountNumber || ''}
              onChange={(e) => handleChange('maskedAccountNumber', e.target.value)}
            />
          </div>
        </>
      );

    default:
      return null;
  }
}
```

## Security Considerations

### PCI Compliance

- Never store full credit card numbers in frontend
- Use PCI-compliant payment gateway (Stripe, PayPal, etc.)
- Implement tokenization for card data
- Use HTTPS only for sensitive data
- Never log sensitive payment information

```typescript
// Example: Using Stripe Elements for secure card input
import { CardElement, useStripe } from '@stripe/react-stripe-js';

export function SecureCardInput({ onToken }: { onToken: (token: string) => void }) {
  const stripe = useStripe();

  const handleSubmit = async () => {
    if (!stripe) return;

    const { token } = await stripe.createToken(CardElement);
    if (token) {
      onToken(token.id);
    }
  };

  return (
    <div>
      <CardElement />
      <button onClick={handleSubmit}>Save Card</button>
    </div>
  );
}
```

### Validation & Error Handling

```typescript
const validateCardNumber = (cardNumber: string): boolean => {
  // Luhn algorithm
  const digits = cardNumber.replace(/\D/g, '');
  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return sum % 10 === 0;
};

const validateExpiry = (month: number, year: number): boolean => {
  const now = new Date();
  const expiryDate = new Date(year, month - 1);
  return expiryDate > now;
};
```

## Accessibility Guidelines

- Use semantic HTML form elements
- Provide clear labels for all inputs
- Implement ARIA attributes for form validation
- Support keyboard navigation
- Provide clear error messages
- Test with screen readers

## Mobile Optimization

- Full-width payment cards
- Touch-friendly buttons (minimum 44x44px)
- Simplified form layout on mobile
- Keyboard-friendly number inputs
- Support for mobile payment methods

## Testing Strategy

```typescript
describe('PaymentMethodsList', () => {
  it('displays payment methods', () => {
    const methods = [createMockPaymentMethod()];
    render(<PaymentMethodsList methods={methods} />);
    
    expect(screen.getByText(/ending in/)).toBeInTheDocument();
  });

  it('calls onDelete when delete is clicked', async () => {
    const onDelete = vi.fn();
    const methods = [createMockPaymentMethod()];
    render(<PaymentMethodsList methods={methods} onDelete={onDelete} />);
    
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalled();
  });

  it('calls onSetDefault when set default is clicked', async () => {
    const onSetDefault = vi.fn();
    const methods = [createMockPaymentMethod()];
    render(<PaymentMethodsList methods={methods} onSetDefault={onSetDefault} />);
    
    await userEvent.click(screen.getByRole('button', { name: /set as default/i }));
    expect(onSetDefault).toHaveBeenCalled();
  });
});

describe('PaymentMethodForm', () => {
  it('validates required fields', async () => {
    render(<PaymentMethodForm onSubmit={vi.fn()} onCancel={vi.fn()} isLoading={false} />);
    
    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    
    expect(screen.getByText(/cardholder name is required/i)).toBeInTheDocument();
  });

  it('calls onSubmit with form data', async () => {
    const onSubmit = vi.fn();
    render(<PaymentMethodForm onSubmit={onSubmit} onCancel={vi.fn()} isLoading={false} />);
    
    await userEvent.type(screen.getByLabelText(/cardholder name/i), 'John Doe');
    await userEvent.type(screen.getByLabelText(/card number/i), '4111111111111111');
    
    await userEvent.click(screen.getByRole('button', { name: /add/i }));
    
    expect(onSubmit).toHaveBeenCalled();
  });
});
```

## Related Documentation

- [Stripe Payment Methods API](https://stripe.com/docs/payments/payment-methods)
- [PCI Compliance Guide](https://www.pcisecuritystandards.org/)
- [Web Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [React Form Patterns](https://react.dev/reference/react/useReducer)

## Future Enhancements

- [ ] Add recurring payment setup
- [ ] Implement payment method verification
- [ ] Add transaction history per method
- [ ] Support more payment types (Apple Pay, Google Pay)
- [ ] Implement fraud detection
- [ ] Add payment method limits/restrictions
- [ ] Create payment method templates
