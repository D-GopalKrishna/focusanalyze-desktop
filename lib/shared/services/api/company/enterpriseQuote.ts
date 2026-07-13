import { Configuration, EnterpriseQuote, EnterpriseQuoteApi } from "@shared/api-client";

const api = new EnterpriseQuoteApi(
  new Configuration({
    basePath: process.env.NEXT_PUBLIC_API_URL,
  }),
);

export type EnterpriseQuotePayload = EnterpriseQuote;

export async function submitEnterpriseQuote(payload: EnterpriseQuotePayload): Promise<void> {
  try {
    await api.apiEnterpriseQuoteCreate(payload);
  } catch (error) {
    const err = error as { response?: { data?: { error?: string; detail?: string } } };
    const data = err.response?.data;
    throw new Error(data?.error || data?.detail || 'Could not submit enterprise quote');
  }
}
