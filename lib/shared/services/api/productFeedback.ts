import { isAxiosError } from 'axios';
import { ProductFeedbackApi, type FeedbackPostCreate } from "@shared/api-client";
import { createApiClient } from './auth';
import { axiosErrorBody } from './openapiHelpers';

const api = createApiClient(ProductFeedbackApi);

function parseApiError(status: number, bodyText: string): string {
  try {
    const json = JSON.parse(bodyText) as Record<string, unknown>;
    const messages: string[] = [];
    for (const value of Object.values(json)) {
      if (Array.isArray(value)) {
        messages.push(...value.map(String));
      } else if (typeof value === 'string') {
        messages.push(value);
      }
    }
    if (messages.length > 0) {
      return messages.join(' ');
    }
  } catch {
    // not JSON
  }
  if (bodyText.includes('FeedbackBoard matching query does not exist')) {
    return 'No boards are set up yet. Restart the API after migrations, or run: python manage.py seed_product_feedback';
  }
  return bodyText.length > 240
    ? `${bodyText.slice(0, 240)}…`
    : bodyText || `Request failed (${status})`;
}

function throwProductFeedbackError(err: unknown): never {
  if (isAxiosError(err)) {
    const status = err.response?.status ?? 0;
    throw new Error(parseApiError(status, axiosErrorBody(err)));
  }
  throw err;
}

export type FeedbackBoard = {
  id: number;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  post_count: number;
};

export type FeedbackPost = {
  id: number;
  title: string;
  description: string;
  status: string;
  status_label: string;
  category: string;
  category_label: string;
  board_slug: string;
  board_name: string;
  author_name: string;
  upvotes: number;
  comment_count: number;
  user_has_voted: boolean;
  created_at: string;
  updated_at: string;
};

export type FeedbackPostDetail = FeedbackPost & {
  comments: FeedbackComment[];
  is_public: boolean;
};

export type FeedbackComment = {
  id: number;
  body: string;
  author_name: string;
  created_at: string;
};

export type RoadmapColumn = {
  status: string;
  title: string;
  color: string;
  cards: FeedbackPost[];
};

export type ChangelogEntry = {
  id: number;
  title: string;
  summary: string;
  body: string;
  label: string;
  label_display: string;
  release_tag: string;
  tag_list: string[];
  published_at: string;
};

export async function listFeedbackBoards(): Promise<FeedbackBoard[]> {
  try {
    const { data } = await api.productFeedbackBoardsList();
    return (data as { results?: FeedbackBoard[] }).results ?? [];
  } catch (err) {
    throwProductFeedbackError(err);
  }
}

export async function listFeedbackPosts(params?: {
  board?: string;
  status?: string;
  category?: string;
  search?: string;
}): Promise<FeedbackPost[]> {
  const query: Record<string, string> = {};
  if (params?.board) query.board = params.board;
  if (params?.status) query.status = params.status;
  if (params?.category) query.category = params.category;
  if (params?.search) query.search = params.search;

  try {
    const { data } = await api.productFeedbackPostsList(
      undefined,
      undefined,
      Object.keys(query).length > 0 ? { params: query } : undefined,
    );
    return (data as { results?: FeedbackPost[] }).results ?? [];
  } catch (err) {
    throwProductFeedbackError(err);
  }
}

export async function getFeedbackPost(id: string | number): Promise<FeedbackPostDetail> {
  try {
    const { data } = await api.productFeedbackPostsRetrieve(Number(id));
    return data as FeedbackPostDetail;
  } catch (err) {
    throwProductFeedbackError(err);
  }
}

export async function createFeedbackPost(payload: {
  title: string;
  description: string;
  category: string;
  board_slug: string;
}): Promise<FeedbackPost> {
  try {
    const { data } = await api.productFeedbackPostsCreate(payload as FeedbackPostCreate);
    return data as unknown as FeedbackPost;
  } catch (err) {
    throwProductFeedbackError(err);
  }
}

export async function toggleFeedbackVote(
  postId: string | number,
): Promise<FeedbackPost & { voted?: boolean }> {
  try {
    const { data } = await api.productFeedbackPostsVoteCreate(Number(postId));
    return data as FeedbackPost & { voted?: boolean };
  } catch (err) {
    throwProductFeedbackError(err);
  }
}

export async function addFeedbackComment(
  postId: string | number,
  body: string,
): Promise<FeedbackComment> {
  try {
    const { data } = await api.productFeedbackPostsCommentsCreate(Number(postId), {
      body,
    } as never);
    const results = (data as { results?: FeedbackComment[] }).results;
    if (results?.[0]) return results[0] as FeedbackComment;
    return data as unknown as FeedbackComment;
  } catch (err) {
    throwProductFeedbackError(err);
  }
}

export async function getRoadmap(board?: string): Promise<RoadmapColumn[]> {
  try {
    const { data } = await api.productFeedbackRoadmapList(
      board ? { params: { board } } : undefined,
    );
    return data as RoadmapColumn[];
  } catch (err) {
    throwProductFeedbackError(err);
  }
}

export async function listChangelogEntries(): Promise<ChangelogEntry[]> {
  try {
    const { data } = await api.productFeedbackChangelogList();
    return ((data as unknown as { results?: ChangelogEntry[] }).results ?? []) as ChangelogEntry[];
  } catch (err) {
    throwProductFeedbackError(err);
  }
}
