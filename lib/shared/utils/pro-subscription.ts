export const PRO_SUBSCRIPTION_REQUIRED_CODE = 'pro_subscription_required';

export class ProSubscriptionRequiredError extends Error {
  readonly code = PRO_SUBSCRIPTION_REQUIRED_CODE;

  constructor(message = 'This feature is available for Pro, Plus, and Enterprise plans only.') {
    super(message);
    this.name = 'ProSubscriptionRequiredError';
  }
}

export function parseProRequiredFromResponse(
  status: number,
  bodyText: string,
): ProSubscriptionRequiredError | null {
  if (status !== 403 || !bodyText.trim()) {
    return null;
  }
  try {
    const payload = JSON.parse(bodyText) as { code?: string };
    if (payload.code === PRO_SUBSCRIPTION_REQUIRED_CODE) {
      return new ProSubscriptionRequiredError();
    }
  } catch {
    // not JSON
  }
  return null;
}

export function isProSubscriptionRequiredError(error: unknown): boolean {
  return error instanceof ProSubscriptionRequiredError;
}
