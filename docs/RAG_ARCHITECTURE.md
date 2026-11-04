# Permission-Aware RAG & Project Memory Engine

**Project:** AI Engineering Workspace  
**Architect:** Amjad (Backend Lead & AI Infrastructure Engineer)  

---

## 1. Objectives & Guiding Principles

The RAG (Retrieval-Augmented Generation) engine transforms project documentation, architecture decisions (ADRs), code references, task logs, and discussions into an intelligent, queryable **Shared AI Brain**.

### Core Tenets
1. **Zero Cross-Tenant Leakage:** An organization or project must never, under any circumstance, retrieve knowledge belonging to another tenant.
2. **Permission-Aware Retrieval:** Retrieval filters respect the requesting user's role and visibility permissions.
3. **Evidence Attribution:** Every AI response synthesized using project memory must cite the exact document title, section, and similarity score.
4. **Stale Information Prevention:** Deprecated or superseded specifications (e.g. outdated ADRs) are excluded or flagged explicitly.

---

## 2. Ingestion & Chunking Pipeline

```
+-------------------------------------------------------------------------------+
|                             RAW KNOWLEDGE SOURCE                              |
|       (Markdown Docs, GitHub PRs, Architecture Specs, Task Descriptions)      |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| 1. TEXT EXTRACTION & SANITIZATION                                             |
| - Strip binary artifacts, redundant whitespace, and internal tokens           |
| - Compute SHA-256 Checksum to avoid re-indexing unchanged documents           |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| 2. SEMANTIC CHUNKING (500 - 800 Tokens with 100 Token Overlap)                |
| - Header-aware recursive markdown splitting (preserves code blocks & tables)  |
| - Attach contextual breadcrumbs (e.g., "Document > Section 2 > Subheading")   |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| 3. EMBEDDING GENERATION                                                       |
| - OpenAI `text-embedding-3-small` (1536 dimensions) or local Ollama embeddings|
| - Batch processing with exponential backoff retry                             |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| 4. DATABASE PERSISTENCE                                                       |
| - Insert into `knowledge_chunks` with `organization_id`, `project_id`,        |
|   `vector(1536)` embedding, and metadata JSONB (status, visibility, tags)     |
+-------------------------------------------------------------------------------+
```

---

## 3. Permission-Aware Retrieval Pipeline

```
                       USER ASKS: "What is our database strategy?"
                                           |
                                           v
+-------------------------------------------------------------------------------+
| 1. AUTHENTICATION & CONTEXT RESOLUTION                                        |
| - Extract verified `user_id`, `organization_id`, and `project_id`             |
| - Confirm user has active membership in the project                           |
+-------------------------------------------------------------------------------+
                                           |
                                           v
+-------------------------------------------------------------------------------+
| 2. QUERY EMBEDDING GENERATION                                                 |
| - Generate 1536-dim vector for incoming user query                            |
+-------------------------------------------------------------------------------+
                                           |
                                           v
+-------------------------------------------------------------------------------+
| 3. STRICT TENANT-SCOPED VECTOR SEARCH (pgvector Cosine Distance)              |
|                                                                               |
| SELECT id, content, metadata, 1 - (embedding <=> $queryVector) AS similarity   |
| FROM knowledge_chunks                                                         |
| WHERE organization_id = $orgId                                                |
|   AND project_id = $projectId                                                 |
|   AND (metadata->>'status' IS NULL OR metadata->>'status' != 'DEPRECATED')    |
| ORDER BY embedding <=> $queryVector                                           |
| LIMIT 6;                                                                      |
+-------------------------------------------------------------------------------+
                                           |
                                           v
+-------------------------------------------------------------------------------+
| 4. THRESHOLD FILTERING & CONTEXT ASSEMBLY                                     |
| - Discard matches below cosine similarity threshold (e.g., < 0.70)            |
| - If no chunks pass threshold: Return "No authoritative evidence found."      |
| - Assemble System Prompt with numbered source citations                       |
+-------------------------------------------------------------------------------+
                                           |
                                           v
+-------------------------------------------------------------------------------+
| 5. LLM SYNTHESIS & AUDIT LOGGING                                              |
| - Model synthesizes answer based STRICTLY on retrieved chunks                 |
| - Return structured answer + citations array to client                        |
| - Record token usage in `ai_runs`                                             |
+-------------------------------------------------------------------------------+
```

---

## 4. Grounding & Anti-Hallucination Guardrails

To prevent the AI from fabricating architectural details when project documentation is incomplete:

1. **System Prompt Constraint:**
   > *"You are the Engineering Workspace AI Assistant. Answer the question using ONLY the provided project sources. If the documentation does not contain sufficient information to answer definitively, clearly state: 'I do not have sufficient recorded architectural evidence in this project to answer this question accurately.' Do not invent requirements or API endpoints."*
2. **Missing Evidence Attribution:**
   When similarity scores fall below 0.65 across all candidate chunks, the engine flags `evidenceMissing: true` in the API metadata, prompting the developer to document the decision before proceeding.
3. **Superseded ADR Guard:**
   If a retrieved chunk belongs to an `engineering_decisions` record with `status = 'SUPERSEDED'`, the engine automatically appends an alert warning the user that a newer architectural decision supersedes the text.

