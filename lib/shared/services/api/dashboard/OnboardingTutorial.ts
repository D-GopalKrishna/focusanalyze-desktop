import { OnboardingTutorial, OnboardingTutorialApi, ApiApi, User } from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(OnboardingTutorialApi);
const userApi = createApiClient(ApiApi);

async function getOnboardingTutorials(page = 1, size = 10): Promise<Array<OnboardingTutorial>> {
  const onboardingTutorials = (await api.apiOnboardingHelpList(page, size)).data;
  return onboardingTutorials?.results ?? [];
}

async function updateOnboardingStep(step: number): Promise<User> {
  const onboardingStep = { step };
  const user = (await userApi.apiOnboardingHelpOnboardingStepCreate(onboardingStep)).data;
  return user;
}

export { getOnboardingTutorials, updateOnboardingStep };
