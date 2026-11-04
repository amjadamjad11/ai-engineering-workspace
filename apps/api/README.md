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
│   ├── app.controller.ts    # Root controller providing /api/v1/health
│   ├── app.module.ts        # Root NestJS application module
│   ├── app.service.ts       # Health check status provider
│   └── main.ts              # Application bootstrap & configuration
├── nest-cli.json            # NestJS CLI build and schematic configuration
├── package.json             # Package scripts & dependencies
├── tsconfig.json            # TypeScript compiler configuration (decorators enabled)
├── tsconfig.build.json      # Production build TypeScript configuration
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

## 4. Default Endpoints

* **Base Prefix:** `/api/v1`
* **Health Check:** `GET /api/v1/health`
  * Response:
    ```json
    {
      "status": "ok",
      "service": "AI Engineering Workspace API",
      "timestamp": "2026-11-04T10:23:03.000Z"
    }
    ```
