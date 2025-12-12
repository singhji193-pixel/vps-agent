# VPS Agent - AI-Powered Server Management Platform

## Overview

VPS Agent is a full-stack web application that enables users to manage VPS (Virtual Private Server) infrastructure using natural language commands powered by Claude AI. The platform provides a conversational interface for executing SSH commands, running automated tests, and handling DevOps tasks.

**Core Capabilities:**
- AI-powered chat interface for server management via natural language
- Secure SSH connectivity to VPS servers with encrypted credential storage
- Automated testing framework with step-by-step execution
- Troubleshooting support assistant
- GitHub integration for deployment workflows
- OTP-based email authentication

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework:** React 18 with TypeScript
- **Routing:** Wouter (lightweight client-side routing)
- **State Management:** TanStack React Query for server state
- **UI Components:** shadcn/ui component library built on Radix UI primitives
- **Styling:** Tailwind CSS with CSS variables for theming (light/dark mode support)
- **Form Handling:** React Hook Form with Zod validation
- **Build Tool:** Vite with HMR support

The frontend follows a page-based architecture with shared components. Design follows developer-focused interfaces inspired by Linear, Vercel, and GitHub with emphasis on information clarity and professional aesthetics.

### Backend Architecture
- **Runtime:** Node.js with Express
- **Language:** TypeScript with ESM modules
- **API Pattern:** RESTful endpoints with session-based authentication
- **Real-time:** WebSocket support for streaming AI responses and live command output

### Data Storage
- **Database:** PostgreSQL with Drizzle ORM
- **Schema Location:** `shared/schema.ts` (shared between frontend and backend)
- **Migrations:** Drizzle Kit (`drizzle-kit push` for schema sync)

**Key Tables:**
- `users` - User accounts with OTP verification
- `otpCodes` - Email verification codes
- `vpsServers` - VPS connection details with encrypted credentials
- `conversations` - Chat sessions (chat, testing, support modes)
- `messages` - Individual chat messages
- `testRuns` / `testSteps` - Automated test execution tracking
- `githubIntegrations` - GitHub repository connections
- `commandHistory` - SSH command audit log

### Security
- **Authentication:** OTP (One-Time Password) via email
- **Session Management:** In-memory sessions (production should use Redis or database sessions)
- **Credential Encryption:** AES-256-GCM encryption for SSH passwords and private keys
- **Encryption Key Derivation:** scrypt-based key derivation from environment secret

### Build System
- **Development:** `tsx` for TypeScript execution with Vite dev server
- **Production:** esbuild bundles server code, Vite builds client assets
- **Output:** `dist/` directory with `index.cjs` (server) and `public/` (client assets)

## External Dependencies

### AI Services
- **Anthropic Claude API** (`@anthropic-ai/sdk`) - Powers the conversational AI interface for server management commands

### Database
- **PostgreSQL** - Primary data store
- **Environment Variable:** `DATABASE_URL` (connection string required)

### Email (Implied by OTP flow)
- Email service required for sending OTP codes (implementation in routes.ts)

### GitHub Integration
- GitHub API for repository management and deployment workflows

### SSH Connectivity
- `ssh2` library for establishing secure connections to VPS servers

### Session Secret
- **Environment Variable:** `SESSION_SECRET` - Used for credential encryption key derivation