/**
 * AI, RAG & Agent Orchestration Contracts
 */

export type AIProviderName = 'openai' | 'anthropic' | 'ollama';

export interface AISourceCitation {
  documentTitle: string;
  sourceUri: string;
  snippet: string;
  similarity: number;
}

export interface AIUsageMetrics {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

export interface AIChatQueryDto {
  conversationId?: string;
  prompt: string;
  provider?: AIProviderName;
  model?: string;
  stream?: boolean;
}

export interface AIChatResponsePayload {
  runId: string;
  reply: string;
  sources: AISourceCitation[];
  usage: AIUsageMetrics;
  evidenceMissing?: boolean;
}

export enum AgentPersonaRole {
  ARCHITECTURE_AGENT = 'ARCHITECTURE_AGENT',
  BACKEND_AGENT = 'BACKEND_AGENT',
  FRONTEND_AGENT = 'FRONTEND_AGENT',
  QA_AGENT = 'QA_AGENT',
  AI_INTEGRATION_AGENT = 'AI_INTEGRATION_AGENT',
  DEVOPS_AGENT = 'DEVOPS_AGENT',
  DOCS_AGENT = 'DOCS_AGENT',
}

export interface AIApprovalRequest {
  id: string;
  runId: string;
  actionDescription: string;
  proposedPayload: Record<string, any>;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
}

