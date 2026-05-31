# Frontend Component Contracts: Project Management Frontend

**Feature**: `009-project-mgmt-frontend` | **Date**: 2026-05-31

## New Components

### `ConfirmationDialog`

```typescript
interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;        // default: "Confirm"
  cancelLabel?: string;         // default: "Cancel"
  variant?: "destructive" | "default";
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}
```

Wraps `shadcn/ui AlertDialog`. Used by `MemberList`, `ArchiveButton`.

---

### `DeleteProjectButton`

```typescript
interface DeleteProjectButtonProps {
  projectId: string;
  projectName: string;
  onDeleted: () => void;        // called after successful deletion, typically router.push('/dashboard')
}
```

Renders a `Button variant="destructive"`. On click, opens an `AlertDialog` containing a text input. The confirm button is disabled until the typed value exactly matches `projectName`. On confirm, calls `projectsApi.delete(projectId)` and invokes `onDeleted`.

---

### `SoleOwnerWarning`

```typescript
interface SoleOwnerWarningProps {
  /** Whether to render the warning. Hidden when false. */
  visible: boolean;
}
```

Renders a prominent `Alert` banner (destructive variant) explaining the user cannot leave the project until they assign the owner role to another member.

---

### `UserSearchCombobox`

```typescript
interface UserSearchComboboxProps {
  projectId: string;            // passed as excludeProjectId to search API
  value: UserSearchResult | null;
  onChange: (user: UserSearchResult | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface UserSearchResult {
  userId: string;
  displayName: string;
  email: string;
}
```

Debounced input (300 ms) that calls `usersApi.search(query, projectId)` and renders a dropdown of results. Shows "No users found" when query returns no results. Clears selection on form reset.

---

### `CurrentUserContext`

```typescript
interface CurrentUser {
  userId: string;
  displayName: string;
  email: string;
}

// Context value
interface CurrentUserContextValue {
  currentUser: CurrentUser | null;
}
```

Provided in `apps/web/src/app/(dashboard)/layout.tsx`. Consumed via `useCurrentUser()` hook.

---

## Updated Component Interfaces

### `MemberList` (updated)

```typescript
interface MemberListProps {
  projectId: string;
  members: ProjectMember[];           // role now includes 'owner'
  currentUserId: string;              // new: for self-removal guard
  currentUserRole: ProjectMemberRole; // new: for owner-only controls
  onUpdateRole?: (userId: string, role: ProjectMemberRole) => void;
  onRemove?: (userId: string) => void;
}
```

**Behaviour changes**:
- Shows `owner` in role dropdown only when `currentUserRole === 'owner'`
- When `currentUserId === member.userId` (own row) and member is last owner, disables all dropdown options below `owner`
- Uses `ConfirmationDialog` instead of `window.confirm()` for member removal

---

### `InviteMemberForm` (updated)

```typescript
interface InviteMemberFormProps {
  projectId: string;
  currentUserRole: ProjectMemberRole; // new: to control whether owner role is available
  onSuccess?: (member: ProjectMember) => void;
}
```

**Behaviour changes**:
- Replaces free-text email `<Input>` with `UserSearchCombobox`
- Adds `owner` to the role `<select>` only when `currentUserRole === 'owner'`
- Submits `userId` (not email) to the invite endpoint

---

### `ProjectSettingsForm` (updated)

```typescript
interface ProjectSettingsFormProps {
  project: Project;
  isArchived: boolean;                // new: disables all form fields + shows banner
  currentUserRole: ProjectMemberRole; // new: controls owner-only actions visibility
  onSuccess?: () => void;
}
```

**Behaviour changes**:
- When `isArchived`: all inputs disabled, `ArchiveButton` (restore mode) and `DeleteProjectButton` shown, form submit hidden
- `DeleteProjectButton` visible only when `currentUserRole === 'owner'`
- `ArchiveButton` visible only when `currentUserRole === 'owner'`

---

### `ArchiveButton` (updated)

```typescript
interface ArchiveButtonProps {
  projectId: string;
  projectName: string;                // new: used in confirmation dialog text
  isArchived: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
}
```

**Behaviour changes**:
- Uses `ConfirmationDialog` instead of `window.confirm()`
- Displays error notification on failure (previously swallowed silently)

---

### `ProjectCard` (updated)

```typescript
interface ProjectCardProps {
  project: Project;  // no interface change; role field now includes 'owner'
}
```

**Behaviour changes**:
- Shows settings link when `project.role === 'administrator' || project.role === 'owner'`

---

## Type Alias

```typescript
type ProjectMemberRole = 'viewer' | 'editor' | 'administrator' | 'owner';
```

Defined in `packages/shared/src/types` or inferred from the Zod schema. Used consistently across all component interfaces above.
