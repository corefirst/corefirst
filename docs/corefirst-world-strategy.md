# CoreFirst World: Architectural Strategy & System Design

This document outlines the strategic architecture for the CoreFirst ecosystem as it evolves from a standalone learning tool into a comprehensive SaaS platform and B2B solution provider.

## 1. Vision & Ecosystem Overview

The CoreFirst ecosystem is divided into three primary pillars to balance open-source community growth, brand marketing, and commercial sustainability.

| Component | Repository Type | Primary Goal |
| :--- | :--- | :--- |
| **CoreFirst Client** | Standalone (OSS) | The high-performance, open-source learning application. |
| **CoreFirst Website** | Standalone | Marketing, SEO, and public-facing brand presence. |
| **CoreFirst World** | **Monorepo (SaaS/B2B)** | The commercial "brain" - hosting SaaS services, B2B templates, and shared business logic. |

---

## 2. The `corefirst-world` Monorepo

The `corefirst-world` repository is a Full-stack Monorepo managed with `pnpm` and `Turborepo`. It centralizes the commercial value while keeping the system modular for both B2C SaaS and B2B Enterprise deployments.

### 2.1 Directory Structure

```text
corefirst-world/
├── apps/
│   ├── hub/              # B2C SaaS Dashboard (corefirst.world/hub)
│   ├── api/              # Unified Backend API (Modular Monolith)
│   ├── blog/             # Content Marketing Site (corefirst.world/blog)
│   └── enterprise/       # Future B2B Enterprise Management Template
├── packages/
│   ├── @cflt/core/       # Shared Learning Algorithms & Core Logic
│   ├── @cflt/ui/         # Shared React Component Library (Tailwind based)
│   ├── @cflt/db/         # Database Schema (Prisma/Drizzle) & Client
│   ├── @cflt/ai/         # LLM Wrappers & Prompt Templates
│   └── @cflt/types/      # Unified TypeScript Definitions (Contract)
├── package.json
└── turbo.json
```

### 2.2 Why Monorepo?
- **Atomic Changes**: Update an API field in `@cflt/types` and see immediate type-checking errors across both `hub` and `api`.
- **Logic Reuse**: The language learning engine (`@cflt/core`) is identical for the C-end SaaS and B-end private deployments.
- **Unified Standards**: Single ESLint/Prettier/Tailwind configuration across the entire commercial suite.

---

## 3. Domain & Routing Strategy

We utilize a **Path-based Routing** strategy on the primary domain `corefirst.world` to maximize SEO authority and simplify authentication.

- **`corefirst.world/`**: Landing Page (Marketing).
- **`corefirst.world/hub`**: SaaS Console (User management, assets, billing).
- **`corefirst.world/explore`**: Textbook Marketplace (SEO-rich resource discovery).
- **`corefirst.world/blog`**: Technical and pedagogical insights.
- **`api.corefirst.world`**: (Subdomain exception) Dedicated for API requests to allow independent scaling and CORS management.

---

## 4. Service Delivery Models

### 4.1 B2C SaaS (CoreFirst Cloud)
- **Target**: Individual learners.
- **Revenue**: Subscription-based (Pro/VIP), textbook purchases, AI service credits.
- **Infrastructure**: Shared multi-tenant database, global CDN.

### 4.2 B2B Enterprise (Custom Solutions)
- **Target**: Schools, corporations, or training centers.
- **Revenue**: License fees, customization, and private deployment.
- **Infrastructure**: Private VPC or On-premise.
- **Implementation**: The `enterprise` app in the Monorepo serves as a template, consuming `@cflt/core` while connecting to private LDAP/SSO and internal LLMs.

---

## 5. Backend Service Architecture (The "API" App)

The backend is designed as a **Modular Monolith** within the Monorepo to avoid the overhead of microservices while maintaining clear boundaries:

1.  **Auth Service**: Handles CoreFirst ID, SSO, and Role-Based Access Control (RBAC).
2.  **Sync Service**: An "Offline-First" synchronization engine for learning progress and vocabulary.
3.  **Market Service**: Manages textbook metadata, authorship, and licensing.
4.  **AI Gateway**: Provides token usage tracking, prompt sanitization, and model abstraction (OpenAI/Claude/Gemini).
5.  **Payment Service**: Integration with Stripe (Global) and local payment providers.

---

## 6. Developer Guidelines

- **Package Scoping**: All internal packages must use the `@cflt/` scope (e.g., `@cflt/ui`).
- **Standardized Imports**: Prefer absolute workspace imports over relative paths.
- **Strict Typing**: All API responses must be typed in `@cflt/types` and shared between `apps/api` and `apps/hub`.
- **Asset Management**: Large assets (textbooks, audio) should never be in the repo. Use S3/R2 with Presigned URLs managed by the API.

---

*Last Updated: May 12, 2026*
