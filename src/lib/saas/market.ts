/**
 * Marketplace API bindings — courseware browse / purchase / download / social.
 *
 * All write operations require the user to be logged in (saas/auth). The
 * `download-url` endpoint enforces purchase server-side; callers can attempt
 * a download URL straight away and handle `PURCHASE_REQUIRED` (status 402)
 * by routing through `purchase()` first.
 */
import { saasJson, saasFetch, SaasError } from './client';
import type { SaasUser } from './storage';

export type Visibility = 'PUBLIC_FREE' | 'PUBLIC_PAID' | 'PRIVATE';
export type BookStatus = 'DRAFT' | 'PENDING' | 'PUBLISHED' | 'BANNED';

export interface MarketTextbook {
  id: string;
  ownerId: string;
  owner?: Pick<SaasUser, 'id' | 'name' | 'avatarUrl'>;
  title: string;
  description?: string | null;
  language: string;
  category?: string | null;
  price: number | string;
  visibility: Visibility;
  status: BookStatus;
  s3Key: string;
  downloadCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
  _count?: { likes: number; comments: number };
}

export interface MarketComment {
  id: string;
  content: string;
  userId: string;
  user?: Pick<SaasUser, 'id' | 'name' | 'avatarUrl'>;
  textbookId: string;
  parentId?: string | null;
  createdAt: string;
}

export interface MarketPurchase {
  id: string;
  userId: string;
  textbookId: string;
  amount: number | string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  createdAt: string;
}

export async function listTextbooks(): Promise<MarketTextbook[]> {
  return saasJson<MarketTextbook[]>('/v1/market/textbooks');
}

export async function getTextbook(id: string): Promise<MarketTextbook> {
  return saasJson<MarketTextbook>(`/v1/market/textbooks/${id}`);
}

export async function getDownloadUrl(id: string): Promise<{ downloadUrl: string; expiresIn: number }> {
  return saasJson(`/v1/market/textbooks/${id}/download-url`);
}

export async function purchaseTextbook(id: string): Promise<MarketPurchase> {
  return saasJson<MarketPurchase>(`/v1/market/textbooks/${id}/purchase`, { method: 'POST' });
}

export async function listPurchases(): Promise<MarketPurchase[]> {
  return saasJson<MarketPurchase[]>('/v1/market/purchases');
}

export async function toggleLike(id: string): Promise<{ liked: boolean }> {
  return saasJson(`/v1/market/textbooks/${id}/like`, { method: 'POST' });
}

export async function listComments(id: string): Promise<MarketComment[]> {
  return saasJson<MarketComment[]>(`/v1/market/textbooks/${id}/comments`);
}

export async function postComment(
  id: string,
  content: string,
  parentId?: string,
): Promise<MarketComment> {
  return saasJson<MarketComment>(`/v1/market/textbooks/${id}/comments`, {
    method: 'POST',
    body: { content, parentId },
  });
}

/**
 * Download a textbook's binary to a Blob.
 * Throws SaasError(402, 'PURCHASE_REQUIRED') when the user has not purchased it.
 */
export async function downloadTextbookBlob(id: string): Promise<Blob> {
  const { downloadUrl } = await getDownloadUrl(id);
  const res = await fetch(downloadUrl);
  if (!res.ok) throw new SaasError(res.status, `Failed to fetch textbook: ${res.status}`);
  return res.blob();
}

/**
 * Publish a new textbook: requests a presigned PUT URL, uploads the file, then
 * registers metadata. Returns the created textbook record.
 */
export async function publishTextbook(args: {
  file: Blob;
  filename: string;
  title: string;
  description?: string;
  language: string;
  category?: string;
  price?: number;
  visibility?: Visibility;
}): Promise<MarketTextbook> {
  const { uploadUrl, key } = await saasJson<{ uploadUrl: string; key: string }>(
    '/v1/market/upload-init',
    { method: 'POST', body: { filename: args.filename, contentType: args.file.type } },
  );

  const put = await fetch(uploadUrl, {
    method: 'PUT',
    body: args.file,
    headers: { 'Content-Type': args.file.type || 'application/octet-stream' },
  });
  if (!put.ok) throw new SaasError(put.status, `Upload failed: ${put.status}`);

  return saasJson<MarketTextbook>('/v1/market/textbooks', {
    method: 'POST',
    body: {
      title: args.title,
      description: args.description,
      language: args.language,
      category: args.category,
      price: args.price ?? 0,
      visibility: args.visibility ?? 'PUBLIC_FREE',
      s3Key: key,
    },
  });
}
