# @ai-workspace/api — Backend Application

**Domain:** Core Backend Modular Monolith  
**Framework:** NestJS 10.x  
**Language:** TypeScript  
**Owner:** Backend Lead (Amjad)  
**Package Namespace:** `@ai-workspace/api`  

---

## 1. Overview

This directory contains the core backend API for the AI Engineering Workspace platform. It provides REST APIs, WebSocket real-time collaboration channels, AI provider integrations, permission-aware RAG vector search, and Model Context Protocol (MCP) server endpoints.

---

## 2. Directory Structure

```
apps/api/
├── src/
│   ├── common/
│   │   ├── filters/
│   │   │   └── http-exception.filter.ts         # Global exception filter (ApiErrorResponse envelope)
│   │   └── interceptors/
│   │       └── transform-response.interceptor.ts # Global response transformer (ApiResponse envelope)
│   ├── config/
│   │   ├── env.config.ts                         # Zod-validated environment schema
│   │   └── swagger.config.ts                     # OpenAPI / Swagger configuration
│   ├── dto/
│   │   └── ping.dto.ts                           # Sample validated DTO
│   ├── app.controller.ts                         # Root controller (/api/v1/health & /ping)
│   ├── app.module.ts                             # Root NestJS application module
│   ├── app.service.ts                            # Service providing health status & ping echo
│   └── main.ts                                   # Application bootstrap & global pipeline setup
├── .env.example                                  # Documented environment variables template
├── nest-cli.json                                 # NestJS CLI build and schematic configuration
├── package.json                                  # Backend scripts & dependencies
├── tsconfig.json                                 # TypeScript compiler configuration (decorators enabled)
├── tsconfig.build.json                           # Production build TypeScript configuration
└── README.md
```

---

## 3. Available Scripts

Run these scripts from the repository root:

```bash
# Build the backend application
npm run build --workspace=@ai-workspace/api

# Start in development mode with hot reload
npm run start:dev --workspace=@ai-workspace/api

# Start in production mode
npm run start:prod --workspace=@ai-workspace/api
```

---

## 4. Environment Variables

Copy `.env.example` to `.env`:
```bash
cp apps/api/.env.example apps/api/.env
```

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `development \| production \| test` | `development` | Runtime environment |
| `PORT` | `number` | `4000` | HTTP listening port |
| `API_PREFIX` | `string` | `api/v1` | Global API route prefix |
| `CORS_ORIGIN`| `string` | `*` | Allowed CORS origins (comma-separated or `*`) |

All environment variables are validated at boot time via **Zod** (`src/config/env.config.ts`). If an invalid configuration is detected, the server fails fast with explicit error messages before accepting traffic.

---

## 5. Architectural Standards & Global Pipelines

### 5.1. Global ValidationPipe
Every incoming request is filtered through NestJS `ValidationPipe` configured with:
* `whitelist: true`: Automatically strips properties not defined in the DTO.
* `forbidNonWhitelisted: true`: Rejects requests containing unrecognized fields (`400 Bad Request`), preventing mass-assignment attacks.
* `transform: true`: Automatically converts request payloads into strongly typed DTO class instances.

### 5.2. Standardized Response Envelope
All successful API responses conform to the shared contract:
```typescript
{
  "success": true,
  "data": { ... },
  "meta": null,
  "error": null
}
```

### 5.3. Standardized Error Envelope
All uncaught exceptions and HTTP errors are formatted uniformly:
```typescript
{
  "success": false,
  "data": null,
  "meta": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed for the request payload.",
    "details": [
      { "message": "message must not be empty" }
    ],
    "timestamp": "2026-11-04T10:44:04.156Z",
    "path": "/api/v1/health/ping"
  }
}
```

### 5.4. Swagger / OpenAPI Documentation
* Interactive UI: `http://localhost:4000/api/docs`
* Raw OpenAPI JSON: `http://localhost:4000/api/docs-json`
