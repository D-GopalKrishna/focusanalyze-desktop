export type WebResearchReference = {
  title: string;
  url: string;
};

export type WebResearchSource = WebResearchReference & {
  snippet?: string;
};

export type WebResearchQuery = {
  query: string;
  activity_label?: string | null;
  sources?: WebResearchSource[];
};

export type WebResearchMetadata = {
  queries?: WebResearchQuery[];
  references?: WebResearchReference[];
};

export function getWebResearch(metadata: unknown): WebResearchMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const wr = (metadata as { web_research?: WebResearchMetadata }).web_research;
  if (!wr || typeof wr !== 'object') return null;
  return wr;
}

export function hasWebResearchReferences(metadata: unknown): boolean {
  const wr = getWebResearch(metadata);
  return Boolean(wr?.references?.length);
}

export function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
