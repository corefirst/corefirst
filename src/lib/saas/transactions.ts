/**
 * Ledger / transaction history bindings — mirrors corefirst-world
 * `GET /v1/users/transactions` (auth-required).
 */
import { saasJson } from './client';

export type TxType =
  | 'credit_grant_initial'
  | 'credit_subscription_grant'
  | 'credit_top_up_grant'
  | 'credit_bonus_grant'
  | 'credit_refund'
  | 'book_purchase'
  | 'ai_chat_consumption'
  | 'ai_image_consumption'
  | 'ai_tts_consumption'
  | 'ai_stt_consumption'
  | 'ai_byok_call'
  | 'credit_revoke';

export type TxStatus = 'submit' | 'pending' | 'confirmed' | 'success' | 'failed';
export type TxChannel = 'stripe' | 'internal_credit' | 'internal_currency';

export interface SaasTransaction {
  id: string;
  relatedId: string | null;
  userId: string;
  sn: string;
  txhash: string;
  channel: TxChannel;
  currency: string | null;
  type: TxType;
  status: TxStatus;
  amount: string | number; // Prisma Decimal serializes as string
  data: any | null;
  output: any | null;
  fromAccount: string | null;
  toAccount: string | null;
  payAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListTxResponse {
  data: SaasTransaction[];
  nextCursor: string | null;
}

export async function listTransactions(opts: {
  limit?: number;
  cursor?: string;
  type?: TxType;
  status?: TxStatus;
} = {}): Promise<ListTxResponse> {
  const params = new URLSearchParams();
  if (opts.limit)  params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.type)   params.set('type', opts.type);
  if (opts.status) params.set('status', opts.status);
  const qs = params.toString();
  return saasJson<ListTxResponse>(`/v1/users/transactions${qs ? `?${qs}` : ''}`);
}
