# Contracts: Domain Layer DTOs

This directory defines the DTO (Data Transfer Object) contracts for all domain
use cases. DTOs live in `packages/shared/src/dtos/` and serve as the
cross-boundary communication contracts between layers.

## Pattern

Each use case has a corresponding DTO pair:

```
CreateProjectRequest  →  CreateProjectResponse
RenameFileRequest     →  RenameFileResponse
...
```

Requests carry input data. Responses carry output data. Both are plain
TypeScript interfaces defined in `packages/shared`.
