import {
  BillingCycleDceEnum,
  BundleKeyEnum,
  CreateSubscription,
  CreateTopUpOrder,
  MySubscriptionOverview,
  OrderResponse,
  PlanEnum,
  UpdateUserSetting,
  User,
  UserApi,
  UserSetting,
  VerifySubscription,
  VerifyTopUpPayment,
} from "@shared/api-client";
import { createApiClient } from '../auth';

const api = createApiClient(UserApi);

async function getUserData(): Promise<User> {
  const user = (await api.apiUserMeRetrieve()).data;
  return user;
}

async function updateUser(user: User): Promise<User> {
  const newUser = (await api.apiUserUpdateMeUpdate(user)).data;
  return newUser;
}

async function inviteUser(email: string): Promise<User> {
  const newUser = (await api.apiUserInviteNewUserCreate({ email })).data;
  return newUser;
}

async function updateUserOnboardingMetadata(metadata: object): Promise<UserSetting> {
  const newUser = (
    await api.apiUserUpdateOnboardingMetadataUpdate({ onboarding_metadata: metadata })
  ).data;
  return newUser;
}

async function setUserPreference(usersettings: UpdateUserSetting) {
  const userSettings = await api.apiUserUpdateUserSettingsUpdate(usersettings);
  return userSettings.data;
}

const createSubscription = async (plan: PlanEnum, billingCycle: BillingCycleDceEnum) => {
  const payload: CreateSubscription = {
    plan,
    billing_cycle: billingCycle,
  };
  return api.apiUserCreateSubscriptionCreate(payload);
};

const verifySubscription = async (
  razorpay_subscription_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string,
  plan: PlanEnum,
  billingCycle: BillingCycleDceEnum,
) => {
  const payload: VerifySubscription = {
    razorpay_subscription_id,
    razorpay_payment_id,
    razorpay_signature,
    plan,
    billing_cycle: billingCycle,
  };
  return (await api.apiUserVerifySubscriptionCreate(payload)).data;
};

const cancelSubscription = async () => {
  return (await api.apiUserCancelSubscriptionCreate()).data;
};

const startTrial = async () => {
  const userSubscription = (await api.apiUserStartTrialCreate()).data;
  return userSubscription;
};

const startBetaTrial = async () => {
  const userSubscription = (await api.apiUserStartBetaTrialCreate()).data;
  return userSubscription;
};

const getUserBillingDetails = async (): Promise<MySubscriptionOverview> => {
  const billingDetails = (await api.apiUserMySubscriptionRetrieve()).data;
  return billingDetails;
};

type TopUpOrderResponse = OrderResponse;

const createTopUpOrder = async (bundleKey: BundleKeyEnum): Promise<TopUpOrderResponse> => {
  const payload: CreateTopUpOrder = { bundle_key: bundleKey };
  const response = await api.apiUserCreateTopupOrderCreate(payload);
  return response.data;
};

const verifyTopUpPayment = async (
  razorpay_order_id: string,
  razorpay_payment_id: string,
  razorpay_signature: string,
  bundle_key: BundleKeyEnum,
) => {
  const payload: VerifyTopUpPayment = {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    bundle_key,
  };
  const response = await api.apiUserVerifyTopupPaymentCreate(payload);
  return response.data;
};

export {
  getUserData,
  updateUser,
  inviteUser,
  updateUserOnboardingMetadata,
  setUserPreference,
  createSubscription,
  verifySubscription,
  cancelSubscription,
  startTrial,
  startBetaTrial,
  getUserBillingDetails,
  createTopUpOrder,
  verifyTopUpPayment,
};
