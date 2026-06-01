# AsciiDoCollab

> **⚠ Pre-MVP — not ready for production use.**
> The core infrastructure is being built and hardened. The collaborative editor — the central feature — does not exist yet. See [Project status](#project-status) for the honest picture.

**Collaborative AsciiDoc editing for teams — self-hosted, secure, and built for real work.**

Write technical documentation, books, and structured content in AsciiDoc format — together, in real time, in your browser. No lock-in, no vendor dependency: deploy it on your own infrastructure and keep full control of your documents.

---

## What it does

AsciiDoCollab gives your team a shared space to write and manage AsciiDoc documents. Multiple people can edit the same document simultaneously, preview rendered output live, export to PDF, and integrate with Git — all from a single, self-hosted web application.

## Features

**Foundation (built, under active hardening)**

- User accounts — self-registration with email verification, admin invitation flow
- Secure login with session management (Argon2id, encrypted sessions, rate limiting, breach detection via [Have I Been Pwned](https://haveibeenpwned.com))
- Create and manage projects to organise your work
- Invite team members and assign roles — Viewer, Editor, or Owner
- Admin panel — manage users, toggle open registration, audit log
- Configurable email delivery (SMTP, SendGrid, or AWS SES)

**Not yet built (MVP blockers)**

- AsciiDoc editor with syntax highlighting and live HTML preview
- Real-time co-editing — see collaborators' cursors and changes as they happen
- Git integration — push, pull, branch, and create pull requests from the UI
- PDF export via Asciidoctor-PDF

**Planned after MVP**

- SSO / SAML 2.0 (Microsoft Entra ID and compatible providers)
- File and folder management within projects
- Multi-factor authentication and IP-based access controls

---

## Project status

**This project has not reached MVP.**

The authentication and user-management layer is feature-complete and has been through multiple rounds of code review and hardening. The collaborative editor — the reason this project exists — is not yet started.

| Layer | Status |
|-------|--------|
| Authentication & session management | ✅ Built, hardened |
| User registration & invitation flow | ✅ Built, hardened |
| Project & team management | ✅ Built |
| Admin panel & audit log | ✅ Built |
| AsciiDoc editor | ❌ Not started |
| Real-time collaboration | ❌ Not started |
| Git integration | ❌ Not started |
| PDF export | ❌ Not started |

Do not deploy this to production or rely on it for real work yet. The API and data model may change before MVP.

---

## Quickstart

The fastest way to get AsciiDoCollab running locally is with the included startup script. You need:

- [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL and local email)
- [Node.js 24+](https://nodejs.org)
- [pnpm 9+](https://pnpm.io/installation)

```bash
git clone https://github.com/joaoleal/asciidocollab.git
cd asciidocollab
./scripts/dev.sh
```

The script will:

1. Start PostgreSQL and a local mail server via Docker
2. Create a `.env.local` from the provided template (auto-generating secrets)
3. Install all dependencies
4. Build the codebase and apply the database schema
5. Start the API server (`http://localhost:4000`) and the web app (`http://localhost:3000`)

**Local email preview** — all outbound emails (registration, password reset) are captured by [Mailpit](https://mailpit.axllent.org) and visible at `http://localhost:8025`. Nothing is sent to real addresses.

---

## Configuration

Copy `.env.example` to `.env.local` and edit as needed. The only values you must change for a real deployment are:

| Variable                                    | Purpose                                                |
|---------------------------------------------|--------------------------------------------------------|
| `ASCIIDOCOLLAB_DATABASE_URL`                | PostgreSQL connection string                           |
| `ASCIIDOCOLLAB_AUTH_SESSION_SECRET`         | Cookie signing secret (run `openssl rand -base64 32`)  |
| `ASCIIDOCOLLAB_AUTH_SESSION_ENCRYPTION_KEY` | Session encryption key (run `openssl rand -base64 32`) |
| `ASCIIDOCOLLAB_API_FRONTEND_URL`            | Your public frontend URL                               |
| `ASCIIDOCOLLAB_AUTH_EMAIL_FROM`             | From address for outbound email                        |

All other settings have secure defaults. See `.env.example` for the full list with descriptions.

---

## Self-hosting

AsciiDoCollab is designed to be self-hosted. You need:

- A PostgreSQL 15+ database
- An SMTP relay, SendGrid account, or AWS SES credentials (or disable email for local testing)
- Node.js 24+ to run the API and web app

No cloud accounts, no telemetry, no external dependencies required.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[Apache License 2.0](LICENSE)
