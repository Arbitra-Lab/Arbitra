# KYC Status Indicator & Verification UI Implementation Guide

## Overview

This document provides guidelines for implementing a Know Your Customer (KYC) Status Indicator and Verification UI component for the Arbitra platform. This feature manages user identity verification and compliance requirements.

## Regulatory Context

KYC (Know Your Customer) is a regulatory requirement that ensures organizations:
- Identify and verify customer identities
- Assess risks associated with users
- Comply with AML (Anti-Money Laundering) regulations
- Prevent fraud and financial crimes

## KYC Status Model

### Status Hierarchy

```typescript
type KYCStatus = 'not_started' | 'pending' | 'in_review' | 'approved' | 'rejected' | 'expired';

interface KYCStatusInfo {
  status: KYCStatus;
  level: 1 | 2 | 3; // Verification levels
  verifiedAt?: Date;
  expiresAt?: Date;
  rejectionReason?: string;
  requiredDocuments: DocumentType[];
  submittedDocuments: Document[];
}

interface Document {
  id: string;
  type: DocumentType;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  uploadedAt: Date;
  expiresAt?: Date;
  rejectionReason?: string;
  dataProofUrl?: string; // Document proof/reference
}

type DocumentType = 
  | 'id_document' 
  | 'proof_of_address' 
  | 'selfie' 
  | 'tax_id'
  | 'business_registration'
  | 'beneficial_ownership';

interface KYCLevel {
  level: number;
  name: string;
  description: string;
  requirements: string[];
  limits?: {
    dailyTransaction?: number;
    monthlyTransaction?: number;
    maxBalance?: number;
  };
  estimatedReviewTime: string;
}
```

### KYC Levels

```typescript
const KYC_LEVELS: Record<number, KYCLevel> = {
  1: {
    level: 1,
    name: 'Basic',
    description: 'Email and phone verification',
    requirements: ['Email verification', 'Phone verification'],
    limits: {
      dailyTransaction: 100,
      monthlyTransaction: 500
    },
    estimatedReviewTime: 'Instant'
  },
  2: {
    level: 2,
    name: 'Standard',
    description: 'Identity document verification',
    requirements: ['ID Document', 'Proof of Address', 'Selfie'],
    limits: {
      dailyTransaction: 5000,
      monthlyTransaction: 50000
    },
    estimatedReviewTime: '24-48 hours'
  },
  3: {
    level: 3,
    name: 'Enhanced',
    description: 'Full KYC with additional verification',
    requirements: ['ID Document', 'Proof of Address', 'Selfie', 'Tax ID', 'Source of Funds'],
    limits: null, // No limits
    estimatedReviewTime: '3-5 business days'
  }
};
```

## UI Components

### 1. KYC Status Indicator

```typescript
interface KYCStatusIndicatorProps {
  status: KYCStatus;
  level: number;
  onUpgrade?: () => void;
  verifiedAt?: Date;
  expiresAt?: Date;
  rejectionReason?: string;
}

export function KYCStatusIndicator({
  status,
  level,
  onUpgrade,
  verifiedAt,
  expiresAt,
  rejectionReason
}: KYCStatusIndicatorProps) {
  const getStatusDisplay = () => {
    const displays: Record<KYCStatus, { label: string; icon: string; color: string; ariaLabel: string }> = {
      not_started: {
        label: 'Not Verified',
        icon: '⭕',
        color: 'neutral',
        ariaLabel: 'KYC verification not started'
      },
      pending: {
        label: 'Pending Review',
        icon: '⏳',
        color: 'warning',
        ariaLabel: 'KYC verification pending'
      },
      in_review: {
        label: 'Under Review',
        icon: '🔍',
        color: 'info',
        ariaLabel: 'KYC verification under review'
      },
      approved: {
        label: 'Verified',
        icon: '✓',
        color: 'success',
        ariaLabel: 'KYC verification approved'
      },
      rejected: {
        label: 'Verification Failed',
        icon: '✗',
        color: 'danger',
        ariaLabel: 'KYC verification rejected'
      },
      expired: {
        label: 'Verification Expired',
        icon: '⏰',
        color: 'warning',
        ariaLabel: 'KYC verification expired'
      }
    };
    return displays[status];
  };

  const display = getStatusDisplay();
  const kycLevel = KYC_LEVELS[level];

  return (
    <div 
      className={`kyc-indicator kyc-${display.color}`}
      role="region"
      aria-label={display.ariaLabel}
      aria-live="polite"
    >
      <div className="indicator-header">
        <span className="status-icon" aria-hidden="true">{display.icon}</span>
        <div className="status-content">
          <h3 className="status-label">{display.label}</h3>
          <p className="level-info">Level {level}: {kycLevel.name}</p>
        </div>
      </div>

      {status === 'approved' && verifiedAt && (
        <div className="verified-info">
          <span className="verified-date">
            Verified on {new Date(verifiedAt).toLocaleDateString()}
          </span>
          {expiresAt && (
            <span className="expiry-date" aria-label={`Verification expires on ${new Date(expiresAt).toLocaleDateString()}`}>
              Expires: {new Date(expiresAt).toLocaleDateString()}
            </span>
          )}
        </div>
      )}

      {status === 'rejected' && rejectionReason && (
        <div className="rejection-info" role="alert">
          <strong>Rejection Reason:</strong>
          <p>{rejectionReason}</p>
          <button onClick={onUpgrade} className="btn btn-sm btn-primary">
            Resubmit Application
          </button>
        </div>
      )}

      {status === 'expired' && onUpgrade && (
        <div className="expiry-notice" role="alert">
          <p>Your KYC verification has expired. Please update your information.</p>
          <button onClick={onUpgrade} className="btn btn-sm btn-primary">
            Update Verification
          </button>
        </div>
      )}

      {status === 'not_started' && onUpgrade && (
        <div className="action-prompt">
          <p>Complete KYC verification to unlock higher transaction limits.</p>
          <button onClick={onUpgrade} className="btn btn-sm btn-primary">
            Start Verification
          </button>
        </div>
      )}

      <div className="transaction-limits">
        <h4>Transaction Limits (Level {level})</h4>
        {kycLevel.limits ? (
          <ul>
            <li>Daily: {formatCurrency(kycLevel.limits.dailyTransaction)}</li>
            <li>Monthly: {formatCurrency(kycLevel.limits.monthlyTransaction)}</li>
          </ul>
        ) : (
          <p>Unlimited</p>
        )}
      </div>
    </div>
  );
}
```

### 2. KYC Verification Wizard

```typescript
interface KYCVerificationWizardProps {
  currentLevel: number;
  targetLevel: number;
  onComplete: (documents: Document[]) => Promise<void>;
  onCancel: () => void;
}

export function KYCVerificationWizard({
  currentLevel,
  targetLevel,
  onComplete,
  onCancel
}: KYCVerificationWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [documents, setDocuments] = useState<Partial<Document>[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetKYCLevel = KYC_LEVELS[targetLevel];
  const steps = targetKYCLevel.requirements;

  const handleDocumentUpload = (documentType: DocumentType, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      setDocuments(prev => [
        ...prev.filter(d => d.type !== documentType),
        {
          type: documentType,
          status: 'pending',
          uploadedAt: new Date(),
          dataProofUrl: e.target?.result as string
        }
      ]);
    };
    reader.readAsDataURL(file);
  };

  const handleNext = () => {
    const currentDocType = getDocumentTypeForStep(currentStep);
    const hasDocument = documents.some(d => d.type === currentDocType);

    if (!hasDocument) {
      setError(`Please upload ${currentDocType.replace(/_/g, ' ')}`);
      return;
    }

    setError(null);
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const allDocuments = documents as Document[];
      
      // Validate all required documents are present
      const requiredTypes = steps.map(getDocumentTypeForStep);
      const hasAllDocs = requiredTypes.every(type =>
        allDocuments.some(d => d.type === type)
      );

      if (!hasAllDocs) {
        setError('Please complete all required documents');
        setIsSubmitting(false);
        return;
      }

      await onComplete(allDocuments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit verification');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="kyc-wizard" role="main">
      <div className="wizard-header">
        <h2>KYC Level {targetLevel} Verification</h2>
        <p>{targetKYCLevel.description}</p>
        <div className="estimated-time" aria-label={`Estimated review time: ${targetKYCLevel.estimatedReviewTime}`}>
          ⏱ {targetKYCLevel.estimatedReviewTime}
        </div>
      </div>

      <div className="wizard-progress">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            role="progressbar"
            aria-valuenow={currentStep + 1}
            aria-valuemin={1}
            aria-valuemax={steps.length}
          />
        </div>
        <p className="progress-text">Step {currentStep + 1} of {steps.length}</p>
      </div>

      <div className="wizard-content">
        <DocumentUploadStep
          documentType={getDocumentTypeForStep(currentStep)}
          onUpload={handleDocumentUpload}
          currentDocument={documents[currentStep]}
        />
      </div>

      {error && (
        <div className="error-message" role="alert">
          {error}
        </div>
      )}

      <div className="wizard-actions">
        <button
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={isSubmitting}
        >
          Cancel
        </button>

        {currentStep > 0 && (
          <button
            onClick={() => setCurrentStep(currentStep - 1)}
            className="btn btn-secondary"
            disabled={isSubmitting}
          >
            Previous
          </button>
        )}

        {currentStep < steps.length - 1 ? (
          <button
            onClick={handleNext}
            className="btn btn-primary"
            disabled={isSubmitting}
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="btn btn-primary"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Complete Verification'}
          </button>
        )}
      </div>
    </div>
  );
}

function getDocumentTypeForStep(step: number): DocumentType {
  const types: DocumentType[] = ['id_document', 'proof_of_address', 'selfie'];
  return types[step] || 'id_document';
}
```

### 3. Document Upload Component

```typescript
interface DocumentUploadStepProps {
  documentType: DocumentType;
  onUpload: (type: DocumentType, file: File) => void;
  currentDocument?: Partial<Document>;
}

export function DocumentUploadStep({
  documentType,
  onUpload,
  currentDocument
}: DocumentUploadStepProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    (currentDocument?.dataProofUrl as string) || null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getDocumentInfo = () => {
    const info: Record<DocumentType, { title: string; description: string; formats: string[] }> = {
      id_document: {
        title: 'Government ID',
        description: 'Upload a clear photo of your government-issued ID (passport, driver\'s license, national ID)',
        formats: ['JPG', 'PNG', 'PDF']
      },
      proof_of_address: {
        title: 'Proof of Address',
        description: 'Upload a document showing your current address (utility bill, bank statement, lease)',
        formats: ['JPG', 'PNG', 'PDF']
      },
      selfie: {
        title: 'Selfie with ID',
        description: 'Take a selfie holding your ID document for verification',
        formats: ['JPG', 'PNG']
      },
      tax_id: {
        title: 'Tax ID Document',
        description: 'Upload your tax identification document',
        formats: ['JPG', 'PNG', 'PDF']
      },
      business_registration: {
        title: 'Business Registration',
        description: 'Upload your business registration certificate',
        formats: ['JPG', 'PNG', 'PDF']
      },
      beneficial_ownership: {
        title: 'Beneficial Ownership Form',
        description: 'Upload the beneficial ownership declaration',
        formats: ['JPG', 'PNG', 'PDF']
      }
    };
    return info[documentType];
  };

  const docInfo = getDocumentInfo();

  const handleFileSelect = (file: File) => {
    if (!validateFile(file)) {
      alert('Invalid file format or size');
      return;
    }

    onUpload(documentType, file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  return (
    <div className="document-upload">
      <div className="document-info">
        <h3>{docInfo.title}</h3>
        <p>{docInfo.description}</p>
        <div className="file-formats">
          Accepted formats: {docInfo.formats.join(', ')}
        </div>
      </div>

      {previewUrl && (
        <div className="document-preview">
          <img src={previewUrl} alt="Uploaded document" />
          <p className="preview-label">Document Preview</p>
        </div>
      )}

      <div
        className={`drop-zone ${isDragging ? 'dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        role="region"
        aria-label="Document upload area"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={`.${docInfo.formats.join(',.')}`}
          onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
          hidden
          aria-label={`Upload ${docInfo.title}`}
        />

        <div className="drop-content">
          <span className="upload-icon" aria-hidden="true">📄</span>
          <p className="primary-text">Drag and drop your {docInfo.title.toLowerCase()}</p>
          <p className="secondary-text">or</p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary"
          >
            Browse Files
          </button>
        </div>
      </div>

      {currentDocument?.status === 'rejected' && currentDocument?.rejectionReason && (
        <div className="rejection-notice" role="alert">
          <p><strong>Document Rejected:</strong> {currentDocument.rejectionReason}</p>
          <p>Please reupload a clearer or different document.</p>
        </div>
      )}
    </div>
  );
}

function validateFile(file: File): boolean {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];

  return file.size <= maxSize && allowedTypes.includes(file.type);
}
```

### 4. KYC Status Dashboard

```typescript
interface KYCStatusDashboardProps {
  kycStatus: KYCStatusInfo;
  onUpgradeKYC: (targetLevel: number) => void;
  onRetryVerification: () => void;
}

export function KYCStatusDashboard({
  kycStatus,
  onUpgradeKYC,
  onRetryVerification
}: KYCStatusDashboardProps) {
  return (
    <div className="kyc-dashboard" role="region" aria-label="KYC Status Dashboard">
      <KYCStatusIndicator
        status={kycStatus.status}
        level={kycStatus.level}
        verifiedAt={kycStatus.verifiedAt}
        expiresAt={kycStatus.expiresAt}
        rejectionReason={kycStatus.rejectionReason}
        onUpgrade={() => onUpgradeKYC(kycStatus.level + 1)}
      />

      <div className="document-status-section">
        <h3>Submitted Documents</h3>
        {kycStatus.submittedDocuments.length === 0 ? (
          <p className="no-documents">No documents submitted yet</p>
        ) : (
          <div className="document-list">
            {kycStatus.submittedDocuments.map((doc) => (
              <DocumentStatusCard
                key={doc.id}
                document={doc}
              />
            ))}
          </div>
        )}
      </div>

      {kycStatus.status === 'rejected' && (
        <div className="actions">
          <button
            onClick={onRetryVerification}
            className="btn btn-primary"
            aria-label="Retry verification after rejection"
          >
            Resubmit Application
          </button>
        </div>
      )}

      {kycStatus.level < 3 && (
        <div className="upgrade-section">
          <h3>Upgrade Your Verification Level</h3>
          <p>Increase your transaction limits by completing higher KYC levels.</p>
          <button
            onClick={() => onUpgradeKYC(kycStatus.level + 1)}
            className="btn btn-secondary"
          >
            Upgrade to Level {kycStatus.level + 1}
          </button>
        </div>
      )}
    </div>
  );
}

interface DocumentStatusCardProps {
  document: Document;
}

function DocumentStatusCard({ document }: DocumentStatusCardProps) {
  const getStatusDisplay = () => {
    const displays: Record<Document['status'], { label: string; icon: string; color: string }> = {
      pending: { label: 'Pending Review', icon: '⏳', color: 'warning' },
      approved: { label: 'Approved', icon: '✓', color: 'success' },
      rejected: { label: 'Rejected', icon: '✗', color: 'danger' },
      expired: { label: 'Expired', icon: '⏰', color: 'warning' }
    };
    return displays[document.status];
  };

  const display = getStatusDisplay();

  return (
    <div className={`document-card document-${display.color}`}>
      <div className="document-header">
        <span className="status-icon" aria-hidden="true">{display.icon}</span>
        <div className="document-info">
          <h4>{document.type.replace(/_/g, ' ')}</h4>
          <p className="status">{display.label}</p>
        </div>
      </div>

      <div className="document-dates">
        <span>Uploaded: {new Date(document.uploadedAt).toLocaleDateString()}</span>
        {document.expiresAt && (
          <span>Expires: {new Date(document.expiresAt).toLocaleDateString()}</span>
        )}
      </div>

      {document.rejectionReason && (
        <div className="rejection-reason" role="alert">
          <strong>Reason:</strong> {document.rejectionReason}
        </div>
      )}
    </div>
  );
}
```

## Accessibility & Privacy Considerations

- **Data Privacy**: Encrypt and secure all personal information
- **Accessibility**: Support screen readers for all KYC flows
- **Clear Communication**: Explain why each document is needed
- **Error Recovery**: Allow users to easily resubmit rejected documents
- **GDPR Compliance**: Provide data deletion options

## Mobile Optimization

- Full-screen document upload on mobile
- Camera API integration for selfies
- Touch-friendly file upload
- Simplified progress display

## Testing Strategy

```typescript
describe('KYCStatusIndicator', () => {
  it('displays correct status', () => {
    render(
      <KYCStatusIndicator 
        status="approved" 
        level={2}
        verifiedAt={new Date()}
      />
    );
    
    expect(screen.getByText(/verified/i)).toBeInTheDocument();
  });

  it('shows transaction limits', () => {
    render(
      <KYCStatusIndicator 
        status="approved" 
        level={2}
      />
    );
    
    expect(screen.getByText(/transaction limits/i)).toBeInTheDocument();
  });
});

describe('DocumentUploadStep', () => {
  it('handles file upload', async () => {
    const onUpload = vi.fn();
    render(
      <DocumentUploadStep 
        documentType="id_document"
        onUpload={onUpload}
      />
    );
    
    const file = new File([''], 'id.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/upload.*id/i) as HTMLInputElement;
    
    await userEvent.upload(input, file);
    
    expect(onUpload).toHaveBeenCalledWith('id_document', expect.any(File));
  });
});
```

## Regulatory Compliance

- Maintain audit trails for all KYC activities
- Document verification decisions
- Implement review processes
- Support regulatory queries
- Maintain data retention policies

## Future Enhancements

- [ ] Liveness detection for selfies
- [ ] OCR for document data extraction
- [ ] Biometric verification
- [ ] Integration with third-party KYC providers
- [ ] Risk scoring engine
- [ ] Automated decision workflows
- [ ] Re-verification reminders
