import { LaunchingSoonUser, LaunchingSoonUserApi } from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(LaunchingSoonUserApi);

export const LaunchingSoonService = async (values: LaunchingSoonUser) => {
  try {
    const response = (await api.apiLaunchingSoonUserCreate(values)).data;
    return response;
  } catch (error) {
    throw new Error(`Error registering for launching soon: ${error}`);
  }
};
