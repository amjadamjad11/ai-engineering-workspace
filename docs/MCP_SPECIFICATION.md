# Model Context Protocol (MCP) Server Specification

**Project:** AI Engineering Workspace  
**Protocol:** Anthropic Model Context Protocol (MCP)  
**Interface:** JSON-RPC 2.0 (over stdio / SSE transport)  
**Security Status:** Strict Scoped Authorization  

---

## 1. Overview & Purpose

The **Engineering Workspace MCP Server** connects developers' local IDEs (VS Code, Cursor, Antigravity) and external agent environments directly to the centralized project brain.

Through this protocol, an AI assistant running inside a developer's editor can seamlessly query architecture specifications, inspect assigned tasks, search approved engineering decisions, and submit progress updates without switching browser tabs.

```
+-------------------+           MCP JSON-RPC (SSE / Stdio)          +------------------------+
| Developer IDE /   | <===========================================> | Workspace MCP Server   |
| External AI Agent |                                               | (NestJS Backend Subsys)|
+-------------------+                                               +------------------------+
                                                                                |
                                                                                v
                                                                    +------------------------+
                                                                    | Auth & RBAC Check      |
                                                                    | (Same as REST APIs)    |
                                                                    +------------------------+
                                                                                |
                                                                                v
                                                                    +------------------------+
                                                                    | Database & RAG Memory  |
                                                                    +------------------------+
```

---

## 2. Authentication & Authorization

> [!IMPORTANT]
> MCP is a communication protocol, **not a bypass for security**.  
> Every MCP tool execution operates under the exact same tenant boundaries, role permissions, and audit requirements as standard REST API calls.

1. **Personal Access Tokens (PAT):** Developers generate an MCP Token via the Workspace dashboard. The token encodes:
   * `user_id` (verified developer profile)
   * `organization_id` (authorized tenant)
   * `allowed_projects` (list of project IDs the token may access)
   * `scopes` (e.g. `read:context`, `read:tasks`, `write:tasks`)
2. **Audit Logging:** Every tool call via MCP logs the requesting client, developer ID, tool name, and arguments into `audit_logs`.

---

## 3. Initial MCP Tool Catalog

### 3.1. `get_project_context`
* **Description:** Retrieve the high-level architecture overview, active milestone, tech stack, and primary guidelines for a project.
* **Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectId": { "type": "string", "description": "Target project UUID" }
  },
  "required": ["projectId"]
}
```
* **Output:** JSON object containing project name, current status, active milestones, and architectural summary.

---

### 3.2. `get_my_tasks`
* **Description:** Fetch tasks currently assigned to the authenticated developer, optionally filtered by status.
* **Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectId": { "type": "string", "description": "Project UUID" },
    "status": {
      "type": "string",
      "enum": ["TODO", "IN_PROGRESS", "IN_REVIEW", "BLOCKED", "DONE"]
    }
  },
  "required": ["projectId"]
}
```

---

### 3.3. `search_project_memory`
* **Description:** Semantic vector search across project documentation, ADRs, and technical specs.
* **Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectId": { "type": "string", "description": "Project UUID" },
    "query": { "type": "string", "description": "Search query or technical question" },
    "limit": { "type": "integer", "default": 5 }
  },
  "required": ["projectId", "query"]
}
```
* **Output:** Ranked array of knowledge snippets with citations and similarity scores.

---

### 3.4. `get_api_documentation`
* **Description:** Retrieve endpoint specifications and contract definitions for a specific module or path.
* **Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectId": { "type": "string", "description": "Project UUID" },
    "moduleName": { "type": "string", "description": "e.g. 'tasks', 'auth', 'projects'" }
  },
  "required": ["projectId", "moduleName"]
}
```

---

### 3.5. `create_task`
* **Description:** Create a new task in the project (requires `write:tasks` permission).
* **Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "projectId": { "type": "string" },
    "title": { "type": "string" },
    "description": { "type": "string" },
    "priority": { "type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"], "default": "MEDIUM" },
    "assigneeEmail": { "type": "string" }
  },
  "required": ["projectId", "title"]
}
```

---

### 3.6. `submit_progress_update`
* **Description:** Post a progress update or status note directly to a task or project activity stream.
* **Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "taskId": { "type": "string", "description": "Target Task UUID" },
    "comment": { "type": "string", "description": "Progress description" },
    "newStatus": {
      "type": "string",
      "enum": ["IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"]
    }
  },
  "required": ["taskId", "comment"]
}
```

