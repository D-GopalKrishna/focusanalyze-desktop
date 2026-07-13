import axios from 'axios';
import {
  ApiApi,
  OrganizationApi,
  type OrganizationProfileUpdate,
  type OrganizationUserProfileProject,
  type OrganizationUserProfileResponse,
  type OrganizationUserProfileTeam,
  type OrganizationUserProfileUser,
  type TeamUserProfileResponse,
} from "@shared/api-client";
import { createApiConfiguration, getAccessToken } from '../auth';
import type { OrganizationInfo } from '@/lib/state/context/user';

export type OrganizationTeam = {
  id: number; // OrganizationGroup id
  group_id: number; // Django auth.Group id
  name: string;
  user_count?: number;
  /** Designated team admin (django user id); from API as ``team_admin_user_id``. */
  team_admin_user_id?: number | null;
};

export type InviteUserPayload = {
  email: string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type OrganizationUserRow = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar: string | null;
  avatar_thumbnail?: string | null;
  groups?: Array<{ id: number; name: string }>;
};

type ListResponse<T> = { results: T[] };

const configuration = createApiConfiguration();

const api = new ApiApi(configuration);
const organizationApi = new OrganizationApi(configuration);

async function getOrganizationTeams(orgId: number): Promise<OrganizationTeam[]> {
  const resp = (await api.apiOrganizationsGroupsRetrieve(orgId as any)) as any;
  // Some endpoints are not strongly typed in the generated client; normalize output.
  const data = (resp?.data ?? resp) as ListResponse<OrganizationTeam>;
  return data?.results ?? [];
}

async function createOrganizationTeam(orgId: number, name: string): Promise<OrganizationTeam> {
  const resp = (await api.apiOrganizationsGroupsCreateCreate(orgId, {
    data: { name },
  } as any)) as any;
  const payload = (resp?.data ?? resp) as { team?: OrganizationTeam };
  if (!payload?.team) throw new Error('Unexpected response');
  return payload.team;
}

async function getTeamUsers(orgId: number, teamId: number, q?: string) {
  const resp = (await api.apiOrganizationsGroupsUsersRetrieve(teamId, orgId, {
    params: q ? { q } : undefined,
  } as any)) as any;
  const data = (resp?.data ?? resp) as ListResponse<OrganizationUserRow>;
  return data;
}

async function getOrganizationUsers(
  orgId: number,
  q?: string,
  options?: { includeGroups?: boolean },
) {
  const includeGroups = options?.includeGroups !== false;
  const resp = (await api.apiOrganizationsUsersRetrieve(orgId, {
    params: {
      ...(q ? { q } : {}),
      ...(includeGroups ? { include_groups: 1 } : {}),
    },
  } as any)) as any;

  const data = (resp?.data ?? resp) as ListResponse<OrganizationUserRow>;

  return data;
}

async function addUserToOrganization(orgId: number, payload: InviteUserPayload) {
  try {
    const resp = (await api.apiOrganizationsUsersAddCreate(orgId, { data: payload } as any)) as any;
    return (resp?.data ?? resp) as { ok?: boolean; user?: unknown };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data) {
      const d = err.response.data as { detail?: unknown };
      if (typeof d.detail === 'string') throw new Error(d.detail);
    }
    throw err instanceof Error ? err : new Error('Could not add member to organization');
  }
}

async function addUserToTeam(orgId: number, teamId: number, payload: InviteUserPayload) {
  try {
    const resp = (await api.apiOrganizationsGroupsUsersAddCreate(teamId, orgId, {
      data: payload,
    } as any)) as any;
    return (resp?.data ?? resp) as { ok?: boolean; user?: unknown };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data) {
      const d = err.response.data as { detail?: unknown };
      if (typeof d.detail === 'string') throw new Error(d.detail);
    }
    throw err instanceof Error ? err : new Error('Could not add member to team');
  }
}

async function removeUserFromTeam(orgId: number, teamId: number, userId: number) {
  const token = getAccessToken() ?? '';
  if (!token) throw new Error('Not authenticated');
  try {
    await api.apiOrganizationsGroupsUsersRemoveDestroy(teamId, orgId, userId as any);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data) {
      const d = err.response.data as { detail?: unknown };
      if (typeof d.detail === 'string') throw new Error(d.detail);
    }
    throw err instanceof Error ? err : new Error('Could not remove member from team');
  }
}

async function removeOrganizationMember(orgId: number, userId: number) {
  const token = getAccessToken() ?? '';
  if (!token) throw new Error('Not authenticated');
  try {
    await api.apiOrganizationsUsersRemoveDestroy(orgId, userId as any);
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data) {
      const d = err.response.data as { detail?: unknown };
      if (typeof d.detail === 'string') throw new Error(d.detail);
    }
    throw err instanceof Error ? err : new Error('Could not remove member');
  }
}

async function assignTeamAdmin(orgId: number, organizationGroupId: number, userId: number | null) {
  const token = getAccessToken() ?? '';
  if (!token) throw new Error('Not authenticated');
  try {
    const resp = (await api.apiOrganizationsGroupsAssignAdminCreate(organizationGroupId, orgId, {
      data: { user_id: userId },
    } as any)) as any;
    return (resp?.data ?? resp) as {
      detail: string;
      team: { id: number; team_admin_user_id: number | null };
    };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data) {
      const d = err.response.data as { detail?: unknown };
      if (typeof d.detail === 'string') throw new Error(d.detail);
    }
    throw err instanceof Error ? err : new Error('Could not assign team admin');
  }
}

export type OrganizationUserProfile = OrganizationUserProfileResponse;
export type TeamUserProfile = TeamUserProfileResponse;

export type {
  OrganizationUserProfileProject,
  OrganizationUserProfileTeam,
  OrganizationUserProfileUser,
};

async function getOrganizationUserProfile(
  orgId: number,
  userId: number,
): Promise<OrganizationUserProfile> {
  const resp = (await organizationApi.apiOrganizationsUsersProfileRetrieve(orgId, userId)) as {
    data?: OrganizationUserProfileResponse;
  };
  const data = resp?.data;
  if (!data) throw new Error('Unexpected response loading user profile');
  return data;
}

async function getTeamUserProfile(
  orgId: number,
  organizationGroupId: number,
  userId: number,
): Promise<TeamUserProfile> {
  const resp = (await organizationApi.apiOrganizationsGroupsUsersProfileRetrieve(
    organizationGroupId,
    orgId,
    userId,
  )) as { data?: TeamUserProfileResponse };
  const data = resp?.data;
  if (!data) throw new Error('Unexpected response loading team user profile');
  return data;
}

async function readFileAsDataUrl(file: File): Promise<string> {
  const { compressImageToDataUrl } = await import('@/lib/utils/compress-image-for-upload');
  return compressImageToDataUrl(file, 'orgLogo');
}

async function updateOrganizationProfile(
  orgId: number,
  payload: { name?: string; organization_logo?: string | File },
): Promise<OrganizationInfo> {
  let organization_logo: string | undefined;
  if (typeof File !== 'undefined' && payload.organization_logo instanceof File) {
    organization_logo = await readFileAsDataUrl(payload.organization_logo);
  } else if (typeof payload.organization_logo === 'string' && payload.organization_logo) {
    organization_logo = payload.organization_logo;
  }

  const body: OrganizationProfileUpdate = {};
  if (payload.name !== undefined) body.name = payload.name;
  if (organization_logo) body.organization_logo = organization_logo;

  try {
    const resp = await api.apiOrganizationsProfileUpdate(orgId, body as any);
    const data = (resp as { data?: OrganizationInfo }).data;
    if (!data) throw new Error('Unexpected response updating organization');
    return data;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const d = err.response.data as { error?: string } | string | undefined;
      if (d && typeof d === 'object' && typeof d.error === 'string') {
        throw new Error(d.error);
      }
      if (typeof d === 'string' && d.trim()) {
        throw new Error(d);
      }
      throw new Error(err.message || `Failed to update organization (${err.response.status})`);
    }
    throw err instanceof Error ? err : new Error('Failed to update organization');
  }
}

export {
  getOrganizationTeams,
  createOrganizationTeam,
  getTeamUsers,
  getOrganizationUsers,
  addUserToOrganization,
  addUserToTeam,
  removeUserFromTeam,
  removeOrganizationMember,
  assignTeamAdmin,
  getOrganizationUserProfile,
  getTeamUserProfile,
  updateOrganizationProfile,
};
