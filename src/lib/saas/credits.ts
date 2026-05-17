/**
 * Credits / billing bindings — mirrors corefirst-world /v1/credits/* and
 * /v1/webhooks/* (the webhook endpoints are server-only; not exposed here).
 */
import { saasJson } from './client';

export type CreditSource = 'subscription' | 'top_up' | 'bonus' | 'debt';

export interface CreditBalanceSummary {
  total: number;
  bySource: Record<CreditSource, number>;
  expiringSoon: { in7Days: number; in30Days: number };
}

export interface CreditPackage {
  id: string;
  productType: 'top_up' | 'subscription' | 'bonus';
  productCode: string;
  name: string;
  description: string | null;
  price: string | number;
  currency: string;
  regionalPricing: Record<string, string> | null;
  interval: 'one_time' | 'month' | 'year';
  credits: string | number;
  bonusCredits: string | number;
  expiryDays: number | null;
  stripeProductId: string | null;
  stripePriceId: string | null;
  applicableTo: string[] | null;
  availableFrom: string | null;
  availableUntil: string | null;
  requiresInviteCode: boolean;
  minTier: 'FREE' | 'PRO' | 'CREATOR' | null;
  displayOrder: number;
  isActive: boolean;
  data: any;
  createdAt: string;
  updatedAt: string;
  /** Derived by the server using ?currency= */
  displayPrice: string;
  displayCurrency: string;
}

export interface UserSubscription {
  id: string;
  userId: string;
  creditPackageId: string;
  periodStart: string;
  periodEnd: string;
  nextBillingDate: string | null;
  channel: string;
  subscriptionId: string | null;
  invoiceId: string | null;
  status: string;
  statusChangedAt: string | null;
  creditsGranted: string;
  data: any;
  createdAt: string;
  updatedAt: string;
  creditPackage?: CreditPackage;
}

export async function fetchBalance(): Promise<CreditBalanceSummary> {
  return saasJson<CreditBalanceSummary>('/v1/credits/balance');
}

export async function listPackages(opts?: {
  type?: 'top_up' | 'subscription' | 'bonus';
  currency?: string;
}): Promise<CreditPackage[]> {
  const params = new URLSearchParams();
  if (opts?.type)     params.set('type', opts.type);
  if (opts?.currency) params.set('currency', opts.currency);
  const qs = params.toString();
  return saasJson<CreditPackage[]>(`/v1/credits/packages${qs ? `?${qs}` : ''}`);
}

export async function fetchSubscriptions(): Promise<UserSubscription[]> {
  return saasJson<UserSubscription[]>('/v1/credits/subscriptions');
}

/**
 * Initiate Stripe Checkout for a package.
 *
 * Returns `{ url }` once Stripe is wired. Currently returns 501 with
 * `code: 'NOT_IMPLEMENTED'` — surface that to users as "购买暂未开通".
 */
export async function startCheckout(packageId: string): Promise<{ url?: string; id?: string }> {
  return saasJson(`/v1/credits/checkout/${packageId}`, { method: 'POST' });
}
