# Research: Monorepo Scaffold & Domain Layer

## 1. fresh-onion: Clean Architecture Enforcement

**Decision**: Use `fresh-onion` (npm: `fresh-onion`) with a project-level `onion.config.json`.

**Rationale**:
- fresh-onion uses TypeScript's compiler API to statically analyze imports and validate they respect defined layer rules
- Catches architectural violations at CI time — domain importing infrastructure would be flagged immediately
- Configuration is declarative (JSON), easy to maintain as the monorepo grows
- Zero runtime overhead — runs as a CLI tool (`npx fresh-onion`), not a runtime library

**Configuration for this monorepo** (`onion.config.json` at monorepo root):

```json
{
  "layers": {
    "domain": "./packages/domain/src",
    "shared": "./packages/shared/src",
    "infrastructure": "./packages/infrastructure/src",
    "collaboration": "./packages/collaboration/src",
    "db": "./packages/db"
  },
  "rules": [
    { "from": "domain", "allowedImports": [] },
    { "from": "shared", "allowedImports": [] },
    { "from": "infrastructure", "allowedImports": ["domain", "shared"] },
    { "from": "collaboration", "allowedImports": ["domain", "shared"] },
    { "from": "db", "allowedImports": [] }
  ]
}
```

**Note:** In Phase 1, only `packages/domain` and `packages/shared` exist. The config should be created now and updated in subsequent phases as `infrastructure`, `collaboration`, and `db` packages are added.

**Integration**: Add `"fresh-onion": "1.0.10"` as a dev dependency at the monorepo root. Add to CI pipeline: `pnpm fresh-onion`.

**Alternatives considered**:
- Manual code reviews — error-prone, no automation
- ESLint import rules (`import/no-restricted-paths`) — requires per-file patterns, not layer-based
- `dependency-cruiser` — more general, less focused on layered architecture

---

## 2. Code Coverage Strategy

**Decision**: Use Jest's built-in `coverageThreshold` with 90% threshold for all packages except `domain`.

**Rationale**:
- Jest's coverageThreshold is the simplest built-in mechanism
- Per-package configuration via `projects` in Jest config, or separate `jest.config.ts` per package
- Domain package exempted because:
  - TDD with in-memory fakes already enforces comprehensive testing
  - Domain entities and value objects are validated at construction time (invariants)
  - Domain use cases are tested against in-memory fakes — they naturally achieve high coverage without forced thresholds
  - The user explicitly exempted domain from the 90% rule

**Threshold configuration** (per non-domain package, e.g., `packages/shared/jest.config.ts`):

```typescript
export default {
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
};
```

**Future packages**: Each new package (`infrastructure`, `collaboration`, `db`, `apps/*`) MUST configure the 90% threshold.

**Alternatives considered**:
- `c8` / `istanbul` — lower-level, more manual
- Codecov / Coveralls — SaaS services, adds complexity for Phase 1

---

## 3. Monorepo Tooling Setup

**Decision**: pnpm workspaces with npm scripts orchestration.

**Rationale**:
- Architecture spec mandates pnpm workspaces
- `pnpm -r` runs scripts across all packages
- ESLint + Prettier for code quality
- tsconfig paths for cross-package imports

**Initial packages**:
- `packages/domain` — zero runtime dependencies
- `packages/shared` — DTOs, shared types

**Scripts in root `package.json`**:
- `"build": "pnpm -r build"`
- `"lint": "pnpm -r lint"`
- `"test": "pnpm -r test"`
- `"test:coverage": "pnpm -r test -- --coverage"`
- `"typecheck": "pnpm -r typecheck"`
- `"fresh-onion": "fresh-onion"`

---

## 4. TypeScript Configuration

**Decision**: Single root `tsconfig.json` with project references to each package.

**Rationale**:
- `strict: true` as mandated by constitution
- Project references enable incremental builds and proper dependency tracking
- Each package has its own `tsconfig.json` extending the root

**Root `tsconfig.json`**:
```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2025",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

## 5. Result Type Pattern

**Decision**: Implement `Result<T, E>` as a discriminated union type in `packages/shared`.

**Pattern**:
```typescript
export type Result<T, E extends DomainError> =
  | { success: true; value: T }
  | { success: false; error: E };
```

**Rationale**: Simple, no dependencies, fully type-safe. Matches the architecture spec's requirement.

---

## 6. Value Object Pattern

**Decision**: Value objects as classes with private constructor and static factory methods.

**Pattern**:
```typescript
export class ProjectId {
  private constructor(private readonly value: string) {
    if (!isValidUUID(value)) throw new InvalidProjectIdError(value);
  }

  static create(value: string): Result<ProjectId, InvalidProjectIdError> { ... }
  equals(other: ProjectId): boolean { return this.value === other.value; }
  toString(): string { return this.value; }
}
```

**Rationale**: Encapsulates validation at construction, prevents invalid state, enables structural equality via `equals()`.

---

## 7. In-Memory Fake Pattern

**Decision**: In-memory fakes as plain classes with Maps/arrays for storage, implementing the repository interface.

**Pattern**:
```typescript
export class InMemoryProjectRepository implements ProjectRepository {
  private projects = new Map<string, Project>();

  async findById(id: ProjectId): Promise<Result<Project, ProjectNotFoundError>> {
    const project = this.projects.get(id.toString());
    if (!project) return { success: false, error: new ProjectNotFoundError(id) };
    return { success: true, value: project };
  }

  async save(project: Project): Promise<Result<Project, never>> {
    this.projects.set(project.id.toString(), project);
    return { success: true, value: project };
  }
}
```

**Rationale**: Fast, honest, refactorable. No mocking framework overhead.
