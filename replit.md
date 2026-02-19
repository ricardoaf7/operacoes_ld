# CMTU-LD Operations Dashboard - "Zeladoria em Tempo Real"

## Overview

This full-stack web application, branded as "Zeladoria em Tempo Real," is an operational dashboard for CMTU-LD in Londrina, Brazil. Its purpose is to monitor and manage urban services like mowing and garden maintenance across 1125+ service areas through a map-centric interface. Key users include the Mayor and city officials, who require real-time visibility into service status, scheduling, and team deployment. The application features interactive mapping, service area management, automated scheduling, and team assignment, with all content presented in Brazilian Portuguese. It is also implemented as a Progressive Web App (PWA) for a native-like mobile experience.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Frameworks & UI**: React 18+ with TypeScript (Vite), Radix UI primitives, shadcn/ui components, and Tailwind CSS, adhering to IBM Carbon Design System principles. It supports light/dark modes and uses the IBM Plex Sans font.
**Layout**: A full-screen split layout with a collapsible sidebar. The primary workflow is map-centric, allowing quick registration directly from marker clicks.
**State Management**: TanStack Query for server state; React hooks for component-level state.
**Routing**: Wouter for client-side routing.
**Map Integration**: Leaflet.js displays service areas as color-coded, draggable markers (16px circular divIcons). The coloring indicates days since last mowing using a 7-tier backward-looking system (60-day cycle) plus "Executando" (currently working) and "Sem Registro" statuses. An interactive legend allows exclusive category filtering and custom date range selection. CSS animation (`marker-blink`) is applied to "Executando" areas.
**Smart Area Search**: A MapHeaderBar autocomplete provides intelligent dropdown suggestions (max 8 results) for addresses, neighborhoods, and lots, featuring text highlighting and full keyboard navigation. Intelligent Map Labels display context-aware labels on map markers only when a search is active.
**Daily Execution Marking**: Coordinators can mark areas as "Executando" via a toggle. These areas appear with pulsing green markers and are automatically reset at midnight (Brasília time).
**Quick Registration Workflow**: Clicking a map marker opens a `MapInfoCard` for quick area info and a "Registrar Roçagem" button. This leads to a `QuickRegisterModal` with automatic numeric date masking for faster data entry.
**New Area Registration**: Clicking on the map (outside markers) opens a `NewAreaModal`. It uses automatic reverse geocoding to pre-fill address details, and form validation is handled by React Hook Form with Zod.
**Data Export**: A header-mounted button provides options for exporting a complete database snapshot (JSON) or CSV exports (full or incremental) of service area data, optimized for Supabase import.

### Backend Architecture

**Server**: Express.js on Node.js with TypeScript.
**API Design**: RESTful API with resource-based endpoints (GET, POST, PATCH) for areas, teams, and configuration, using JSON and Zod schema validation. Includes geocoding integration via Nominatim/OpenStreetMap.
**Performance**: Hybrid data loading with specialized endpoints: `/api/areas/light` for lightweight map data (70% payload reduction, loads all areas initially), `/api/areas/search` for server-side search, and `/api/areas/:id` for full details on demand.
**Database Search**: Optimized `searchAreas()` method uses PostgreSQL `ilike` for case-insensitive searching across multiple fields.
**Authentication & Authorization**: A multi-tier system with session-based authentication (express-session + PostgreSQL store). Roles include `admin`, `gestor`, and `fiscal`. A public portal (`/publico`) provides a read-only map view without authentication. All mutating API endpoints require authentication, with additional role-based checks for admin functionalities. User management (CRUD) is admin-only.

### Data Storage

**Storage Architecture**: Dual-mode system switching between in-memory (`MemStorage`) for development and PostgreSQL (`DbStorage`) for production, based on the `DATABASE_URL` environment variable. Both environments share the same Neon PostgreSQL database.
**Storage Interface**: `IStorage` provides a unified abstraction for CRUD operations.
**Database Schema**: Defined in `shared/schema.ts` using Zod types and Drizzle table definitions for `service_areas` (geographic data, scheduling, history, audit), `teams`, `app_config`, and `export_history`.
**Audit Trail**: Every mowing registration captures operator name (`registrado_por`) and timestamp (`data_registro`).
**Scheduling Algorithm**: Calculates mowing schedules based on a fixed 60-day cycle (`Próxima roçagem = Última roçagem + 60 dias`), respecting manual overrides.
**Persistence Layer**: Drizzle ORM with Neon serverless driver, utilizing JSONB columns and automatic timestamping.
**Migration & Seeding**: Drizzle Kit for schema migrations; `db/seed.ts` for initial data population. A production data import script (`db/import-areas.ts`) handles CSV imports, data cleaning, and batch insertion for over 1100 service areas.

## External Dependencies

**Database Provider**: Neon serverless PostgreSQL (`@neondatabase/serverless`).
**ORM**: Drizzle ORM v0.39+ with `drizzle-kit`.
**Map Services**: Leaflet.js v1.9.4 and Leaflet.draw v1.0.4.
**UI Component Libraries**: Radix UI primitives, shadcn/ui, lucide-react, class-variance-authority.
**Form Handling**: React Hook Form with Hookform Resolvers for Zod.
**Utility Libraries**: date-fns, clsx, tailwind-merge, cmdk, Zod.
**Build Tools**: Vite (frontend), esbuild (server-side), TypeScript, PostCSS with Autoprefixer.