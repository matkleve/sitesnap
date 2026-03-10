# Account Page

## What It Is

User account management page for changing email, changing password, and deleting the account. Accessed via `/account` from the Sidebar avatar. All mutations go through Supabase Auth APIs. Destructive actions (delete) require confirmation.

## What It Looks Like

Full-width page, max-width centered (640px). User info at top (avatar circle with initial, email, role badge). Below: action sections as cards. Each card has a description and a single action button. "Delete account" section is visually distinct (red-tinted border or warning color).

## Where It Lives

- **Route**: `/account`
- **Parent**: App shell
- **Sidebar link**: Avatar circle at bottom of rail

## Actions

| #   | User Action              | System Response                                                            | Triggers                            |
| --- | ------------------------ | -------------------------------------------------------------------------- | ----------------------------------- |
| 1   | Navigates to /account    | Shows current email, role, avatar                                          | Load from `AuthService`             |
| 2   | Clicks "Change email"    | Expands inline form: new email input + confirm button                      | Supabase `updateUser({ email })`    |
| 3   | Submits new email        | Sends confirmation to new email, shows success message                     | Toast                               |
| 4   | Clicks "Change password" | Expands inline form: current password + new password + confirm             | Supabase `updateUser({ password })` |
| 5   | Submits new password     | Password updated, shows success                                            | Toast                               |
| 6   | Clicks "Delete account"  | Confirmation dialog: "This cannot be undone. Type DELETE to confirm."      | —                                   |
| 7   | Confirms deletion        | Deletes auth user → cascade deletes profile → logs out → redirect to login | Supabase admin delete or RPC        |

## Component Hierarchy

```
AccountPage                                ← full-width, max-width 640px centered
├── UserInfoCard
│   ├── AvatarCircle                       ← large circle with user initial + --color-clay bg
│   ├── UserEmail                          ← current email address
│   └── RoleBadge                          ← "Admin" / "User" pill
├── AccountSection "Change email"
│   ├── Description                        ← "Update your email address"
│   └── [expanded] EmailForm
│       ├── NewEmailInput
│       └── ConfirmButton
├── AccountSection "Change password"
│   ├── Description                        ← "Set a new password"
│   └── [expanded] PasswordForm
│       ├── CurrentPasswordInput
│       ├── NewPasswordInput
│       └── ConfirmButton
└── DangerSection "Delete account"
    ├── WarningText                        ← "This permanently deletes all your data."
    └── DeleteButton                       ← red/warning styled, opens confirmation dialog
```

## Data

| Field        | Source                                     | Type      |
| ------------ | ------------------------------------------ | --------- |
| Current user | `AuthService.currentUser()`                | `User`    |
| Profile      | `supabase.from('profiles').select('role')` | `Profile` |

## State

| Name                | Type                            | Default | Controls                         |
| ------------------- | ------------------------------- | ------- | -------------------------------- |
| `expandedSection`   | `'email' \| 'password' \| null` | `null`  | Which form is open               |
| `submitting`        | `boolean`                       | `false` | Loading state for forms          |
| `deleteConfirmOpen` | `boolean`                       | `false` | Whether deletion dialog is shown |

## File Map

| File                                      | Purpose                                |
| ----------------------------------------- | -------------------------------------- |
| `features/account/account.component.ts`   | Page component (currently placeholder) |
| `features/account/account.component.html` | Template                               |
| `features/account/account.component.scss` | Styles                                 |
| `core/auth.service.ts`                    | Email/password update, delete account  |

## Wiring

- Email change sends Supabase confirmation email to new address
- Password change requires current password for verification
- Delete account cascades via DB triggers (profiles, images, group memberships)
- After deletion, `AuthService.signOut()` → redirect to `/login`

## Acceptance Criteria

- [ ] Shows current email and role
- [ ] Change email: inline form, sends confirmation to new address
- [ ] Change password: requires current password, validates new password
- [ ] Delete account: confirmation dialog with typed "DELETE" confirmation
- [ ] Delete cascades properly (handled by DB, but frontend shows success/error)
- [ ] All forms show loading state while submitting
- [ ] Success/error feedback via toast notifications
