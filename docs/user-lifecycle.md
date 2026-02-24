# User Lifecycle Documentation

**Who this is for:** engineers working on authentication, onboarding, and account management.  
**What you'll get:** the end-to-end flow of how users are created, authenticated, assigned roles, and deleted, and which invariants must always hold.

See also: `glossary.md`, `security-boundaries.md`, `database-schema.md`, and `decisions.md` (D1, D2).

---

## 1. Registration Flow

1. User registers via Supabase Auth.
2. Supabase creates an entry in `auth.users`.
3. A database trigger automatically:
   - Creates a row in `profiles`.
   - Assigns a default role (for example, `user`) via `user_roles`.

This ensures system consistency without any client-side orchestration.

### Registration Trigger Contract

- Trigger timing: runs immediately after a new row is created in `auth.users`.
- Trigger responsibilities:
  - Create exactly one `profiles` row for the new `auth.users.id`.
  - Assign the default `user` role in `user_roles`.
- Failure behavior:
  - If profile creation or role assignment fails, registration transaction must fail.
  - The system must never leave a user without a profile or without a role.
- Operational requirement:
  - `roles` must already contain `user` before registration is allowed.
- Idempotency requirement:
  - Trigger logic must avoid duplicate `profiles` / `user_roles` rows if retried.

**Invariants**

- Every `auth.users` row has exactly one `profiles` row.
- Every user has at least one role (default: `user`).

---

## 2. Login Flow

1. User logs in via Supabase Auth.
2. Supabase issues a JWT session token.
3. Angular stores the session (for example, in memory or local storage).
4. All database and storage requests include the JWT automatically (via Supabase client).

**Invariants**

- Only requests with a valid, unexpired JWT reach RLS-protected tables.
- Angular is not trusted for identity checks; it only forwards the token.

---

## 3. Role Assignment

Default behavior:

- All new users receive role `user`.

Admin role assignment:

- Must be performed manually via:
  - SQL, or
  - Admin interface (future extension).

**Invariants**

- Roles are defined in `roles` and linked to users via `user_roles`.
- RLS checks rely on `user_roles` and `roles` (see `security-boundaries.md`).
- Role revocation must be blocked if it would leave a user with zero roles.

---

## 4. Account Deletion

When a user is deleted from `auth.users`:

- The corresponding `profiles` row is deleted.
- All `user_roles` entries for that user are deleted.
- All `images` owned by that user are deleted.

All of the above happen via `ON DELETE CASCADE` constraints defined in the schema.

**Invariants**

- There is no orphaned profile, role, or image data for deleted users.
- Deletion is initiated only from `auth.users`; other tables do not delete users directly.
