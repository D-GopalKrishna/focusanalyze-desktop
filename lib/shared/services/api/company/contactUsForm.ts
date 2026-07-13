import { Configuration, ContactedForm, ContactUsApi } from "@shared/api-client";

const api = new ContactUsApi(
  new Configuration({
    basePath: process.env.NEXT_PUBLIC_API_URL,
  }),
);

export const ContactUsService = async (values: ContactedForm) => {
  try {
    const response = (await api.apiContactUsCreate(values)).data;
    return response;
  } catch (error) {
    throw new Error(`Error contacting us: ${error}`);
  }
};
