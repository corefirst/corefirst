# User Identity

> Status: Shipped | Updated: 2026-05-12  
> PRD: F-12 Multi-User Storage Partitioning

---

## Overview

CoreFirst assigns every browser/device a stable UUID identity on first visit via Next.js middleware. This UUID is:

- The **storage partition key** — all PouchDB records, packages, and media live under `data/users/<uuid>/`
- The **profile identifier** — shown in the ProfileSwitcher and Profile tab of Settings
- The **future hub.corefirst.world member ID** — local UUIDs will be "claimed" by a hub account for cross-device sync

No login, no registration, no personal data required. The system works immediately on first visit.

---

## Components

### `middleware.ts` — UUID Auto-Assignment

Runs before every Next.js request. If `cf_user_id` cookie is absent, generates a UUID and sets the cookie.

```typescript
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  if (!request.cookies.get('cf_user_id')) {
    response.cookies.set('cf_user_id', crypto.randomUUID(), {
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
      sameSite: 'lax',
      httpOnly: false, // intentional: client JS reads this to namespace localStorage keys
    });
  }
  return response;
}
```

**Cookie is `httpOnly: false`** by design — the client reads it to key `cf_settings_{uuid}` and `cf_profiles` in localStorage. This is safe for single-user self-hosted deployments; share-nothing by default.

---

### `src/lib/auth/user.ts` — Server-Side ID Resolution

```typescript
export async function getUserId(request?: Request): Promise<string>
```

Resolution order:
1. `x-user-id` request header — reverse-proxy / cloud platform injection
2. `cf_user_id` cookie — always present after middleware

All values normalized via `normalizeUserId()` which strips to `[a-z0-9_-]`. UUID hex chars + hyphens pass through unchanged.

---

### `hooks/useProfile.ts` — Client-Side Profile Management

```typescript
export function useProfile(): {
  profiles: Profile[];
  currentId: string;
  currentProfile: Profile | undefined;
  addProfile(name: string): string;
  renameProfile(id: string, name: string): void;
  switchProfile(id: string): void;
}
```

**Storage:** `localStorage` key `cf_profiles` — JSON array of `{ id: string, name: string }`.

**Add profile:** generates `crypto.randomUUID()` → appends to list → does not auto-switch (user must call `switchProfile` explicitly from the UI).

**Switch profile:** writes new UUID into `cf_user_id` cookie → `window.location.reload()` → server now scopes all storage to the new UUID.

**Rename profile:** updates `cf_profiles` in localStorage only — no server call, no directory rename. UUID is the stable internal ID; display name is pure metadata.

**Stale-closure safety:** `addProfile` and `renameProfile` use functional updaters (`prev => [...]`) so concurrent calls from rapid UI interaction never lose updates.

---

### `components/ProfileSwitcher.tsx` — Household UI

Corner dropdown accessible from every page. Provides:

- Current profile name display
- Profile list with inline rename (click pencil icon)
- "Add person" → name input → creates new UUID profile
- Keyboard: Enter to confirm, Escape to cancel
- ARIA: `aria-haspopup="listbox"`, `aria-expanded`, `role="listbox"`, `role="option"`, `aria-selected`

---

## Data Flow

```
First visit
  └─ middleware.ts → Set cf_user_id=<uuid> cookie (1 year)

Every API request
  └─ getUserId(request)
       ├─ x-user-id header? → use it (reverse proxy)
       └─ cf_user_id cookie → use it (standard path)
            └─ src/lib/storage/paths.ts → data/users/<uuid>/

Profile switch
  └─ useProfile.switchProfile(newId)
       ├─ document.cookie = "cf_user_id=<newId>; ..."
       └─ window.location.reload()
            └─ All subsequent requests scoped to newId
```

---

## Future: hub.corefirst.world Integration

The UUID will be "claimable" by creating a hub account:
- Local UUID → linked to hub member ID
- Data syncs across devices via PouchDB replication to a CouchDB endpoint
- Premium features gated by membership

No code changes required in this layer — the UUID is already the right shape for a member ID.

---

## Constants

`src/lib/constants.ts`:
```typescript
export const USER_ID_COOKIE = 'cf_user_id';
```

Used by `middleware.ts`, `hooks/useProfile.ts`, and `hooks/useSettings.ts` to avoid drift.
