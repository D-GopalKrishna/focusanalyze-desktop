import axios from 'axios';
import {
  ApiApi,
  Configuration,
  type AcceptInvitation,
  type CreateInvitation,
  type CreateInvitationResponse,
  type Invitation,
  type InvitationPreview,
} from "@shared/api-client";
import { createApiConfiguration, hasUsableAccessToken } from '../auth';

export type { AcceptInvitation, CreateInvitation, CreateInvitationResponse, Invitation, InvitationPreview };

// Admin-side calls (list/create/resend/revoke) are org-scoped and require the caller to be
// signed in — reuse the standard authenticated client config.
const authedApi = new ApiApi(createApiConfiguration());

// The three token routes are public by design (the invitee has no account yet on the path
// this exists to serve). A bare, no-auth client is used for them so an unauthenticated
// visitor never sends a stale/empty Authorization header — Keycloak's authenticator treats
// an empty Bearer token as a malformed one and 401s before the view's AllowAny is reached.
const publicApi = new ApiApi(new Configuration({ basePath: process.env.NEXT_PUBLIC_API_URL }));

function extractErrorDetail(err: unknown, fallback: string): Error {
  if (axios.isAxiosError(err) && err.response?.data) {
    const d = err.response.data as { detail?: unknown };
    if (typeof d.detail === 'string' && d.detail) return new Error(d.detail);
  }
  return err instanceof Error ? err : new Error(fallback);
}

async function getOrganizationInvitations(orgId: number, includeInactive = false): Promise<Invitation[]> {
  try {
    const resp = await authedApi.apiOrganizationsInvitationsRetrieve(orgId, {
      params: includeInactive ? { include_inactive: 1 } : undefined,
    } as any);
    return (resp.data?.results ?? []) as Invitation[];
  } catch (err) {
    throw extractErrorDetail(err, 'Could not load invitations');
  }
}

async function createOrganizationInvitations(
  orgId: number,
  payload: CreateInvitation,
): Promise<CreateInvitationResponse> {
  try {
    const resp = await authedApi.apiOrganizationsInvitationsCreate(orgId, payload);
    return resp.data as CreateInvitationResponse;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data) {
      // 400 with only `failed` entries is a valid partial-success shape, not an error.
      const data = err.response.data as CreateInvitationResponse;
      if (data && Array.isArray(data.created) && Array.isArray(data.failed)) {
        return data;
      }
    }
    throw extractErrorDetail(err, 'Could not send invitation');
  }
}

async function resendOrganizationInvitation(orgId: number, email: string): Promise<Invitation> {
  try {
    const resp = await authedApi.apiOrganizationsInvitationsResendCreate(orgId, { email });
    return resp.data as Invitation;
  } catch (err) {
    throw extractErrorDetail(err, 'Could not resend invitation');
  }
}

async function revokeOrganizationInvitation(orgId: number, email: string): Promise<Invitation> {
  try {
    const resp = await authedApi.apiOrganizationsInvitationsRevokeCreate(orgId, { email });
    return resp.data as Invitation;
  } catch (err) {
    throw extractErrorDetail(err, 'Could not revoke invitation');
  }
}

async function getInvitationByToken(token: string): Promise<InvitationPreview> {
  try {
    const resp = await publicApi.apiInvitationsRetrieve(token);
    return resp.data as InvitationPreview;
  } catch (err) {
    throw extractErrorDetail(err, 'This invitation link is invalid.');
  }
}

async function acceptInvitation(
  token: string,
  payload: AcceptInvitation,
): Promise<{ detail: string; organization: { id: number; name: string }; email: string }> {
  // Signed-in acceptance (post "Continue with Google") must carry the real Bearer token;
  // everyone else must send none at all — see the `publicApi` comment above.
  const client = hasUsableAccessToken() ? new ApiApi(createApiConfiguration()) : publicApi;
  try {
    const resp = await client.apiInvitationsAcceptCreate(token, payload);
    return resp.data as unknown as { detail: string; organization: { id: number; name: string }; email: string };
  } catch (err) {
    throw extractErrorDetail(err, 'Could not accept invitation');
  }
}

async function declineInvitation(token: string): Promise<void> {
  try {
    await publicApi.apiInvitationsDeclineCreate(token);
  } catch (err) {
    throw extractErrorDetail(err, 'Could not decline invitation');
  }
}

export {
  getOrganizationInvitations,
  createOrganizationInvitations,
  resendOrganizationInvitation,
  revokeOrganizationInvitation,
  getInvitationByToken,
  acceptInvitation,
  declineInvitation,
};
