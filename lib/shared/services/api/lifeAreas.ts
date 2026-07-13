import { LifeAreaApi, LifeAreaRead, PatchedLifeAreaRead } from "@shared/api-client";
import { unwrapPaginatedList } from "@shared/utils/general";
import { createApiClient } from './auth';

const api = createApiClient(LifeAreaApi);

export async function fetchLifeAreas(): Promise<LifeAreaRead[]> {
  const resp = (await api.apiLifeAreaList()).data;
  return unwrapPaginatedList(resp as LifeAreaRead[] | { results?: LifeAreaRead[] });
}

export async function createLifeArea(body: {
  name: string;
  color?: string;
}): Promise<LifeAreaRead> {
  const { data } = await api.apiLifeAreaCreate({
    name: body.name,
    color: body.color,
    sidebar_order: 0,
  } as LifeAreaRead);
  return data;
}

export async function patchLifeArea(id: number, body: PatchedLifeAreaRead): Promise<LifeAreaRead> {
  const { data } = await api.apiLifeAreaPartialUpdate(id, body);
  return data;
}

export async function deleteLifeArea(id: number): Promise<void> {
  await api.apiLifeAreaDestroy(id);
}
