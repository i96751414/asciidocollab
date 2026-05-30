# Research: Project Management

**Date**: 2026-05-29
**Feature**: Phase 4 - Project Management

## Technical Decisions

### 1. Next.js App Router Patterns

**Decision**: Use Next.js 14 App Router with route groups for layout organization.

**Rationale**: 
- Route groups `(auth)` and `(dashboard)` allow shared layouts without affecting URL structure
- Server components for initial data fetching, client components for interactivity
- Built-in loading states and error boundaries

**Alternatives Considered**:
- Pages Router: Rejected - App Router is the standard for new Next.js projects
- Client-side routing only: Rejected - SSR improves initial load and SEO

### 2. Fastify Route Structure

**Decision**: Organize routes hierarchically with nested routers.

**Rationale**:
- `routes/projects.ts` handles `/api/projects` CRUD
- `routes/projects/members.ts` handles `/api/projects/:id/members`
- Follows existing Fastify patterns in the codebase
- Schema validation at route level

**Alternatives Considered**:
- Single flat router: Rejected - becomes unwieldy with many endpoints
- Express-style middleware: Rejected - Fastify plugins are more structured

### 3. UI Design System

**Decision**: Use shadcn/ui + Radix UI + Tailwind CSS for professional technical publishing feel.

**Rationale**:
- shadcn/ui provides high-quality, accessible components
- Radix UI primitives ensure WAI-ARIA compliance
- Tailwind CSS enables rapid styling with design tokens
- Lightweight, immediate, stable feel as requested

**Alternatives Considered**:
- Material UI: Rejected - too heavy, not aligned with technical publishing aesthetic
- Chakra UI: Rejected - shadcn/ui is more customizable and lighter
- Custom CSS: Rejected - would take too long to build accessible components

### 4. Form Validation

**Decision**: Use Zod for schema validation + React Hook Form for form state.

**Rationale**:
- Zod schemas can be shared between client and server
- React Hook Form provides excellent DX with minimal re-renders
- Integrates well with Next.js Server Actions
- Type-safe validation errors

**Alternatives Considered**:
- Yup: Rejected - Zod has better TypeScript integration
- Formik: Rejected - React Hook Form is lighter and more modern
- Native HTML validation: Rejected - insufficient for complex forms

### 5. API Client Pattern

**Decision**: Create a typed API client service layer in `lib/api.ts`.

**Rationale**:
- Centralizes all API calls with proper error handling
- Type-safe responses using shared DTOs
- Handles authentication (session cookies) automatically
- Easy to mock for testing

**Alternatives Considered**:
- Direct fetch calls in components: Rejected - leads to code duplication
- GraphQL: Rejected - REST is sufficient and simpler for this phase
- TanStack Query: Rejected - can be added later for caching

### 6. State Management

**Decision**: Use React Server Components for data fetching, client state for UI interactions.

**Rationale**:
- Server components fetch initial data (project list, project details)
- Client state handles form inputs, modals, optimistic updates
- No global state management needed for this phase
- Keeps the UI lightweight and immediate

**Alternatives Considered**:
- Redux: Rejected - overkill for this scope
- Zustand: Rejected - can be added later if needed
- Context API: Rejected - server components are more appropriate

## Research Tasks Completed

1. ✅ Next.js 14 App Router patterns
2. ✅ Fastify route organization
3. ✅ shadcn/ui + Tailwind CSS integration
4. ✅ Zod + React Hook Form patterns
5. ✅ Typed API client implementation
6. ✅ Server vs Client component strategy

## Open Questions

None - all technical decisions have been resolved.
