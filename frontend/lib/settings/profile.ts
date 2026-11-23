/** Validation for the personal-info form in Settings → Profile (#151). */

export interface ProfileFormValues {
  fullName: string;
  phone: string;
}

export type ProfileFormErrors = Partial<
  Record<keyof ProfileFormValues, string>
>;

export const MAX_FULL_NAME_LENGTH = 100;
const PHONE_PATTERN = /^\+?[0-9][0-9 ()-]{5,18}[0-9]$/;

/** Field errors for the form; an empty object means it can be saved. Phone is optional. */
export function validateProfileForm(
  values: ProfileFormValues,
): ProfileFormErrors {
  const errors: ProfileFormErrors = {};
  const fullName = values.fullName.trim();
  const phone = values.phone.trim();

  if (!fullName) {
    errors.fullName = 'Enter your full name.';
  } else if (fullName.length > MAX_FULL_NAME_LENGTH) {
    errors.fullName = `Your name can be at most ${MAX_FULL_NAME_LENGTH} characters.`;
  }

  if (phone && !PHONE_PATTERN.test(phone)) {
    errors.phone = 'Enter a valid phone number, for example +1 555 123 4567.';
  }
  return errors;
}

/** The trimmed values that are actually sent to the API. */
export function toProfilePayload(values: ProfileFormValues): ProfileFormValues {
  return { fullName: values.fullName.trim(), phone: values.phone.trim() };
}

/** True when the form differs from what was last loaded or saved. */
export function isProfileDirty(
  current: ProfileFormValues,
  saved: ProfileFormValues,
): boolean {
  const a = toProfilePayload(current);
  const b = toProfilePayload(saved);
  return a.fullName !== b.fullName || a.phone !== b.phone;
}
