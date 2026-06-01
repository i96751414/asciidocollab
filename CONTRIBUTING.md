# Contributing to AsciiDoCollab

Thank you for your interest in AsciiDoCollab.

## Current status — pre-MVP

**Pull requests are not being accepted at this stage.**

The project has not reached MVP. The codebase is being actively developed and the architecture may change significantly before the first release. Opening a PR now would likely result in conflicts or rework, so contributions are on hold until the MVP milestone is reached.

Once MVP ships, this file will be updated with contribution guidelines, coding standards, and a PR checklist.

## Bug reports and feedback

Issues and bug reports are welcome. Please open a GitHub issue with:

- A clear description of the problem
- Steps to reproduce it
- What you expected vs. what you got
- Relevant logs or screenshots

## Security vulnerabilities

Please do **not** open a public GitHub issue for security vulnerabilities. Instead, email the maintainer directly (see the commit history for contact information). You will receive a response within 72 hours.

## Development setup

If you want to explore the code locally:

```bash
git clone https://github.com/joaoleal/asciidocollab.git
cd asciidocollab
./scripts/dev.sh
```

See the [README](README.md) for full prerequisites and configuration instructions.

### Running tests

```bash
# Domain unit tests
pnpm --filter @asciidocollab/domain test

# All packages
pnpm -r test --passWithNoTests
```

### Lint and type-check

```bash
npx eslint .
npx tsc -p packages/domain/tsconfig.json --noEmit
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
```
