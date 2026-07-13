// pages - usage_type, features_selection, tool_selection, pricing, download, calendar_integration, project_integration, virtual_conferencing_integration, preferences

// Onboarding enums - for
// First MVP has - Feature selections → Tool selection → Pricing → Calendar integration → Project integration → Preferences

export const formatUserOnboardingMetadata = (oldMetadata: object, newMetadata: object): object => {
  return {
    ...oldMetadata,
    ...newMetadata,
  };
};
