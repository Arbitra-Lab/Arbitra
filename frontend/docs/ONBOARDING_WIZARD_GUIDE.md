# Onboarding Wizard UI with Step Tracking Guide

## Overview

This document provides guidelines for designing and implementing an onboarding wizard UI component for the Arbitra platform. The wizard guides new users through setup steps while tracking progress.

## Component Architecture

### High-Level Structure

```
OnboardingWizard
├── WizardHeader
│   ├── Progress Bar
│   ├── Current Step Indicator
│   └── Step Counter (Step X of Y)
├── StepContent
│   ├── Step Description
│   ├── Form/Content Area
│   └── Visual Elements
├── Navigation
│   ├── Previous Button (disabled on first step)
│   ├── Next/Continue Button
│   ├── Skip Button (optional)
│   └── Complete Button (last step)
└── StepTracker
    └── Visual Step Indicators
```

## State Management

### Wizard State Structure

```typescript
interface OnboardingWizardState {
  currentStep: number;
  totalSteps: number;
  completedSteps: Set<number>;
  skippedSteps: Set<number>;
  stepData: Record<number, any>;
  isLoading: boolean;
  error: string | null;
}

interface Step {
  id: number;
  title: string;
  description: string;
  component: React.ComponentType;
  validation?: (data: any) => boolean;
  optional?: boolean;
  estimatedTime?: number; // in seconds
}
```

### Tracking Progress

```typescript
// Store completion status
const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

const markStepComplete = (stepNumber: number) => {
  setCompletedSteps(prev => new Set([...prev, stepNumber]));
};

const isStepComplete = (stepNumber: number) => {
  return completedSteps.has(stepNumber);
};

// Calculate progress percentage
const progressPercentage = (completedSteps.size / totalSteps) * 100;
```

## UI Components

### 1. Progress Indicator

```typescript
interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  completedSteps: Set<number>;
  onStepClick?: (stepNumber: number) => void;
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
  completedSteps,
  onStepClick
}: ProgressIndicatorProps) {
  return (
    <div className="wizard-progress">
      <div className="progress-bar-container">
        <div
          className="progress-bar-fill"
          style={{
            width: `${(completedSteps.size / totalSteps) * 100}%`
          }}
        />
      </div>
      
      <div className="steps-timeline">
        {Array.from({ length: totalSteps }).map((_, index) => {
          const stepNumber = index + 1;
          const isComplete = completedSteps.has(stepNumber);
          const isCurrent = stepNumber === currentStep;
          
          return (
            <button
              key={stepNumber}
              className={`
                step-indicator
                ${isCurrent ? 'current' : ''}
                ${isComplete ? 'complete' : ''}
              `}
              onClick={() => onStepClick?.(stepNumber)}
              aria-current={isCurrent ? 'step' : undefined}
              aria-label={`Step ${stepNumber}${isComplete ? ', completed' : ''}`}
            >
              <span className="step-number">
                {isComplete ? '✓' : stepNumber}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

### 2. Step Content Wrapper

```typescript
interface StepContentProps {
  step: Step;
  data: any;
  onChange: (data: any) => void;
  isLoading: boolean;
}

export function StepContent({
  step,
  data,
  onChange,
  isLoading
}: StepContentProps) {
  const StepComponent = step.component;
  
  return (
    <div className="wizard-step-content" role="region" aria-label={`Step ${step.id}: ${step.title}`}>
      <div className="step-header">
        <h2 className="step-title">{step.title}</h2>
        <p className="step-description">{step.description}</p>
        {step.estimatedTime && (
          <span className="estimated-time" aria-label={`This step takes approximately ${step.estimatedTime} seconds`}>
            ⏱ ~{Math.ceil(step.estimatedTime / 60)} min
          </span>
        )}
      </div>
      
      <div className="step-body">
        <StepComponent
          data={data}
          onChange={onChange}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
```

### 3. Navigation Controls

```typescript
interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  canContinue: boolean;
  isLoading: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onSkip?: () => void;
  onComplete?: () => void;
}

export function WizardNavigation({
  currentStep,
  totalSteps,
  canContinue,
  isLoading,
  onPrevious,
  onNext,
  onSkip,
  onComplete
}: WizardNavigationProps) {
  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === totalSteps;
  
  return (
    <div className="wizard-navigation" role="group" aria-label="Wizard navigation">
      <button
        onClick={onPrevious}
        disabled={isFirstStep || isLoading}
        className="btn btn-secondary"
        aria-label="Go to previous step"
      >
        ← Previous
      </button>
      
      {onSkip && !isLastStep && (
        <button
          onClick={onSkip}
          disabled={isLoading}
          className="btn btn-tertiary"
          aria-label="Skip this step"
        >
          Skip
        </button>
      )}
      
      <button
        onClick={isLastStep ? onComplete : onNext}
        disabled={!canContinue || isLoading}
        className="btn btn-primary"
        aria-label={isLastStep ? 'Complete wizard' : 'Go to next step'}
      >
        {isLoading ? (
          <>
            <span className="spinner" aria-hidden="true" />
            Processing...
          </>
        ) : (
          isLastStep ? 'Complete' : 'Next →'
        )}
      </button>
    </div>
  );
}
```

### 4. Main Wizard Component

```typescript
export function OnboardingWizard({ steps, onComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [stepData, setStepData] = useState<Record<number, any>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentStepData = steps[currentStep - 1];
  const canContinue = !error && (stepData[currentStep] !== undefined);

  const handleNext = async () => {
    if (currentStepData.validation) {
      const isValid = currentStepData.validation(stepData[currentStep]);
      if (!isValid) {
        setError('Please complete this step before continuing');
        return;
      }
    }

    setCompletedSteps(prev => new Set([...prev, currentStep]));
    
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  const handleStepData = (data: any) => {
    setStepData(prev => ({
      ...prev,
      [currentStep]: data
    }));
    setError(null);
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      // Validate all required steps are complete
      const requiredSteps = steps
        .map((step, idx) => idx + 1)
        .filter(idx => !steps[idx - 1].optional);
      
      const allRequired = requiredSteps.every(step => completedSteps.has(step));
      
      if (!allRequired) {
        setError('Please complete all required steps');
        setIsLoading(false);
        return;
      }

      // Save completion data
      await onComplete({
        completedSteps: Array.from(completedSteps),
        stepData,
        totalTime: calculateTotalTime()
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete wizard');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="wizard-container" role="main" aria-label="Onboarding wizard">
      <div className="wizard-card">
        <ProgressIndicator
          currentStep={currentStep}
          totalSteps={steps.length}
          completedSteps={completedSteps}
          onStepClick={setCurrentStep}
        />

        <StepContent
          step={currentStepData}
          data={stepData[currentStep] || {}}
          onChange={handleStepData}
          isLoading={isLoading}
        />

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        <WizardNavigation
          currentStep={currentStep}
          totalSteps={steps.length}
          canContinue={canContinue}
          isLoading={isLoading}
          onPrevious={handlePrevious}
          onNext={handleNext}
          onComplete={handleComplete}
        />
      </div>
    </div>
  );
}
```

## Step Definition Examples

### Profile Setup Step
```typescript
const profileStep: Step = {
  id: 1,
  title: 'Create Your Profile',
  description: 'Tell us about yourself',
  component: ProfileForm,
  validation: (data) => {
    return data.firstName && data.lastName && data.email;
  },
  estimatedTime: 120
};
```

### Verification Step
```typescript
const verificationStep: Step = {
  id: 2,
  title: 'Verify Email',
  description: 'Confirm your email address',
  component: EmailVerification,
  validation: (data) => {
    return data.verified === true;
  },
  estimatedTime: 60
};
```

### Preferences Step
```typescript
const preferencesStep: Step = {
  id: 3,
  title: 'Set Your Preferences',
  description: 'Customize your experience',
  component: PreferencesForm,
  optional: true,
  estimatedTime: 180
};
```

## Accessibility Guidelines

### ARIA Attributes
- Use `role="main"` on wizard container
- Use `role="region"` on step content with `aria-label`
- Use `aria-current="step"` on current step indicator
- Use `role="progressbar"` for progress bar with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Use `role="alert"` for error messages
- Use `aria-label` on all buttons

### Keyboard Navigation
- Tab through all interactive elements
- Enter/Space to activate buttons
- Arrow keys to navigate between steps (optional enhancement)
- Escape to exit wizard (optional)

### Screen Reader Support
- Announce current step number and total
- Announce step completion
- Announce validation errors
- Announce estimated time for each step

## Mobile Considerations

### Responsive Layout
```css
.wizard-container {
  max-width: 100%;
  
  @media (max-width: 768px) {
    .step-indicator {
      display: none; /* Or simplified view */
    }
    
    .wizard-step-content {
      min-height: auto;
    }
    
    .wizard-navigation {
      flex-direction: column-reverse;
      gap: 8px;
    }
  }
}
```

### Touch-Friendly
- Buttons minimum 44x44px
- Adequate spacing between navigation buttons
- Full-width inputs on mobile
- Minimize required scrolling per step

## Performance Optimization

### Lazy Loading
```typescript
const steps = useMemo(() => {
  return [
    { ...profileStep },
    { ...verificationStep, component: lazy(() => import('./EmailVerification')) },
    { ...preferencesStep, component: lazy(() => import('./PreferencesForm')) }
  ];
}, []);
```

### Progress Persistence
```typescript
useEffect(() => {
  // Save progress to localStorage
  localStorage.setItem('wizardProgress', JSON.stringify({
    currentStep,
    completedSteps: Array.from(completedSteps),
    stepData
  }));
}, [currentStep, completedSteps, stepData]);

// Restore from localStorage on mount
useEffect(() => {
  const saved = localStorage.getItem('wizardProgress');
  if (saved) {
    const { currentStep, completedSteps, stepData } = JSON.parse(saved);
    setCurrentStep(currentStep);
    setCompletedSteps(new Set(completedSteps));
    setStepData(stepData);
  }
}, []);
```

## Analytics Integration

### Track User Progress

```typescript
const trackWizardEvent = (event: string, data: any) => {
  analytics.track('wizard_' + event, {
    step: currentStep,
    totalSteps: steps.length,
    completedSteps: completedSteps.size,
    ...data
  });
};

// Usage
useEffect(() => {
  trackWizardEvent('step_viewed', {
    stepTitle: currentStepData.title
  });
}, [currentStep]);

const handleNext = async () => {
  // ... existing logic
  trackWizardEvent('step_completed', {
    stepNumber: currentStep,
    timeSpent: Date.now() - stepStartTime
  });
};

const handleComplete = async () => {
  // ... existing logic
  trackWizardEvent('wizard_completed', {
    totalTimeSpent: Date.now() - wizardStartTime,
    completedSteps: completedSteps.size
  });
};
```

## Error Handling

### Validation Errors
```typescript
const validateStep = (step: Step, data: any) => {
  if (!step.validation) return true;
  
  try {
    return step.validation(data);
  } catch (err) {
    setError('Validation error: ' + (err as Error).message);
    return false;
  }
};
```

### Submission Errors
```typescript
const handleComplete = async () => {
  try {
    setIsLoading(true);
    const response = await saveOnboardingData(stepData);
    
    if (!response.ok) {
      setError(response.message || 'Failed to save onboarding data');
      return;
    }
    
    await onComplete(response.data);
  } catch (err) {
    setError('An error occurred. Please try again.');
  } finally {
    setIsLoading(false);
  }
};
```

## Testing Strategy

### Component Tests
```typescript
describe('OnboardingWizard', () => {
  it('renders current step content', () => {
    render(<OnboardingWizard steps={mockSteps} />);
    expect(screen.getByText('Create Your Profile')).toBeInTheDocument();
  });

  it('advances to next step', async () => {
    render(<OnboardingWizard steps={mockSteps} />);
    
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(screen.getByText('Verify Email')).toBeInTheDocument();
  });

  it('disables previous button on first step', () => {
    render(<OnboardingWizard steps={mockSteps} />);
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });

  it('marks step complete', async () => {
    render(<OnboardingWizard steps={mockSteps} />);
    
    // Complete first step
    await userEvent.type(screen.getByLabelText(/first name/i), 'John');
    await userEvent.type(screen.getByLabelText(/last name/i), 'Doe');
    await userEvent.type(screen.getByLabelText(/email/i), 'john@example.com');
    
    expect(screen.getByRole('button', { name: /next/i })).toBeEnabled();
  });

  it('validates required fields', async () => {
    render(<OnboardingWizard steps={mockSteps} />);
    
    await userEvent.click(screen.getByRole('button', { name: /next/i }));
    
    expect(screen.getByRole('alert')).toHaveTextContent(/please complete/i);
  });

  it('calls onComplete when wizard finishes', async () => {
    const onComplete = vi.fn();
    render(<OnboardingWizard steps={mockSteps} onComplete={onComplete} />);
    
    // Complete all steps...
    
    await userEvent.click(screen.getByRole('button', { name: /complete/i }));
    expect(onComplete).toHaveBeenCalled();
  });
});
```

## Related Documentation

- [React Hooks Documentation](https://react.dev/reference/react)
- [Web Accessibility Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Material Design - Steppers](https://material.io/components/steppers)
- [Best Practices for Onboarding](https://www.nngroup.com/articles/onboarding-ux/)

## Future Enhancements

- [ ] Add optional intro video per step
- [ ] Implement step analytics/heatmaps
- [ ] Add conditional branching (skip steps based on answers)
- [ ] Support multiple wizard flows
- [ ] Add progress save to backend
- [ ] Implement resume wizard from last step
- [ ] Add animations between steps
- [ ] Create wizard builder UI
