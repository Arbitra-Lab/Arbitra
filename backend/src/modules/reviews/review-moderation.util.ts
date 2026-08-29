// Moderation scoring and auto-flagging logic for reviews

const PROHIBITED_WORDS = [
  'spam',
  'scam',
  'fraud',
  'offensive',
  'abuse',
  'harassment',
  'threat',
];

const SUSPICIOUS_PATTERNS = [
  /(.)\1{4,}/g, // Repeated characters (e.g., "aaaaa")
  /[A-Z]{4,}/g, // Multiple consecutive caps
  /[^\w\s.,!?'-]/g, // Excessive special characters
];

export interface ModerationResult {
  isFlagged: boolean;
  confidence: number;
  reason: string;
}

export function containsProhibitedLanguage(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return PROHIBITED_WORDS.some((word) => lower.includes(word));
}

export function scoreContent(text: string): ModerationResult {
  if (!text) {
    return {
      isFlagged: false,
      confidence: 1.0,
      reason: 'Clean: empty content',
    };
  }

  let flagScore = 0;
  const reasons: string[] = [];

  // Check for prohibited language
  if (containsProhibitedLanguage(text)) {
    flagScore += 0.6;
    reasons.push('prohibited language detected');
  }

  // Check for excessive capitalization
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.5) {
    flagScore += 0.3;
    reasons.push('excessive capitalization');
  }

  // Check for repeated characters
  const repeatedMatches = text.match(/(.)\1{4,}/g) || [];
  if (repeatedMatches.length > 0) {
    flagScore += 0.4;
    reasons.push('repeated characters detected');
  }

  // Check for spam patterns (e.g., URLs, phone numbers)
  const spamPatterns = /([^a-zA-Z0-9\s.,!?'-]|http|www|\d{3}-\d{3}-\d{4})/g;
  const spamMatches = text.match(spamPatterns) || [];
  if (spamMatches.length > text.length * 0.1) {
    flagScore += 0.5;
    reasons.push('potential spam content');
  }

  // Check for suspiciously short or long content
  const words = text.split(/\s+/).length;
  if (words < 2) {
    flagScore += 0.2;
    reasons.push('insufficient review content');
  }

  // Normalize score to 0-1
  const confidence = Math.min(flagScore, 1.0);

  return {
    isFlagged: confidence >= 0.5,
    confidence,
    reason:
      reasons.length > 0
        ? reasons.join('; ')
        : 'Clean: passes all checks',
  };
}
