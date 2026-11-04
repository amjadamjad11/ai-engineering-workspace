# AI Integration & Agent Orchestration Architecture

**Project:** AI Engineering Workspace  
**Lead Architect:** Amjad (Backend Lead & AI Infrastructure Engineer)  

---

## 1. Provider-Independent Architecture

The AI layer is built on the **Adapter Pattern** to ensure the platform remains fully decoupled from any single AI vendor. Business modules, RAG pipelines, and agent executors interact exclusively with the unified `IAIService` interface.

```
+-------------------------------------------------------------------------------+
|                       BUSINESS DOMAIN / AGENTS / RAG                          |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                       UNIFIED AI SERVICE (IAIService)                         |
|  - Provider & Model Routing                                                   |
|  - Token Usage Tracking & Quota Checking                                      |
|  - Telemetry, Cost Estimation & Audit Persistence                             |
|  - Exponential Backoff & Retry Mechanism                                      |
|  - Structured JSON Output Validation (Zod Schema Parsing)                     |
+-------------------------------------------------------------------------------+
         |                                |                            |
         v                                v                            v
+------------------+            +-------------------+        +------------------+
|  OpenAI Adapter  |            | Anthropic Adapter |        |  Ollama Adapter  |
|  (gpt-4o, etc.)  |            | (Claude 3.5 Sonnet|        |  (Local models)  |
+------------------+            +-------------------+        +------------------+
```

### 1.1. Core Adapter Interface Contract
```typescript
export interface IAIProviderAdapter {
  readonly providerName: string;

  chatCompletion(options: AIChatRequestOptions): Promise<AIChatResponse>;
  streamChatCompletion(options: AIChatRequestOptions): AsyncIterable<AIStreamChunk>;
  generateEmbeddings(options: AIEmbeddingRequestOptions): Promise<AIEmbeddingResponse>;
  countTokens(text: string, model: string): number;
}

export interface AIChatRequestOptions {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCallId?: string;
    toolCalls?: AIToolCall[];
  }>;
  temperature?: number;
  maxTokens?: number;
  tools?: AIToolDefinition[];
  responseFormat?: 'text' | 'json_object';
}

export interface AIChatResponse {
  content: string;
  toolCalls?: AIToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
}
```

---

## 2. Telemetry, Quotas & Cost Tracking

Every invocation through `AIService` generates an immutable entry in the `ai_runs` table:
1. **Pre-flight Check:** Organization token quota and monthly budget are verified before invoking external APIs.
2. **Execution Timing:** Tracks request latency (`execution_time_ms`).
3. **Cost Calculation:** Formula based on active rates in `ai_models`:
   $$\text{Total Cost} = \left(\frac{\text{Prompt Tokens}}{1,000,000} \times \text{Input Rate}\right) + \left(\frac{\text{Completion Tokens}}{1,000,000} \times \text{Output Rate}\right)$$
4. **Aggregated Usage:** Synchronized with `ai_usage_records` for monthly customer billing summaries.

---

## 3. Specialized AI Agent Personas

The workspace orchestrates specialized AI agents designed around real-world software engineering disciplines:

| Agent Persona | Focus Area | Permitted Capabilities | Guardrail Level |
| :--- | :--- | :--- | :--- |
| **Architecture Agent** | System design, ADRs, scalability analysis | Reads project specs, generates ADR proposals, reviews schemas | High (ADR changes require Lead approval) |
| **Backend Agent** | API contracts, NestJS modules, database migrations | Proposes NestJS controllers/services, validates Prisma schemas, drafts unit tests | High (Migration scripts require human approval) |
| **Frontend Agent** | UI/UX alignment, React/Tailwind specs, state models | Reads shared contracts, generates UI mock specs, plans component hierarchies | Medium |
| **QA Agent** | Test coverage, edge cases, integration scenarios | Generates E2E test scripts, evaluates bug reports, validates API response schemas | Low |
| **AI Integration Agent**| Prompt engineering, vector indexing, evaluation | Evaluates RAG retrieval precision, inspects embedding chunking quality | Medium |
| **DevOps Agent** | CI/CD, Docker configurations, deployment telemetry | Drafts Dockerfiles, GitHub Actions workflows, environment templates | Strict (No direct execution on cloud infrastructure) |
| **Docs Agent** | OpenAPI sync, release notes, onboarding guides | Updates Markdown documentation, synchronizes READMEs with API changes | Low |

---

## 4. Human-In-The-Loop Approval Gates

To prevent unauthorized or destructive automated actions, agents **cannot independently execute sensitive operations**.

```
+-------------------------------------------------------------------------------+
|                    AGENT DECIDES ON SENSITIVE TOOL CALL                       |
|           (e.g., Run DB Migration, Commit Code, Deploy Preview)               |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
|                      SYSTEM CREATES PENDING APPROVAL                          |
|  - Writes to `ai_approvals` table with action payload & description           |
|  - Emits Realtime Notification to Project Leads & Admins                      |
|  - Suspends Agent Execution Thread                                            |
+-------------------------------------------------------------------------------+
                                      |
                         +------------+------------+
                         |                         |
                         v                         v
               [ HUMAN REJECTS ]          [ HUMAN APPROVES ]
                         |                         |
                         v                         v
               Agent informed of          Execution resumes with
               rejection & feedback       authorized tool output
```

### Prohibited Autonomous Actions (Always Require Human Approval):
* Applying database migrations or altering tables.
* Pushing code directly to protected Git branches (`main`, `master`).
* Exposing or modifying production environment secrets.
* Marking critical milestone tasks as complete without automated test evidence.
* Executing arbitrary shell scripts without isolated container sandboxing.

