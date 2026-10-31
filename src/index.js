import Schema from '@deepseek-ai/schemastery'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { applyNotebook } from './service.js'

export const name = 'dsh-notebook'
export const inject = ['tools', 'systemPrompt', 'jobs', 'agents', 'llm', 'webServer', 'connection']

export const Config = Schema.object({
  dataDir: Schema.string().default(''),
  maxNotebooks: Schema.number().default(100),
  maxSourcesPerNotebook: Schema.number().default(50),
  maxWordsPerSource: Schema.number().default(500000),
  maxUploadBytes: Schema.number().default(20 * 1024 * 1024),
  chunkChars: Schema.number().default(1200),
  chunkOverlap: Schema.number().default(150),
  topK: Schema.number().default(8),
  maxInjectChars: Schema.number().default(16000),
  urlTimeoutMs: Schema.number().default(15000),
  maxUrlBytes: Schema.number().default(2 * 1024 * 1024),
  assistantMaxSteps: Schema.number().default(24),
  assistantTimeoutMs: Schema.number().default(180000),
  assistantMaxTokens: Schema.number().default(8192),
  maxChatChars: Schema.number().default(32000),
})

export function apply(ctx, config) {
  return applyNotebook(ctx, config, { defineTool, createUserMessage })
}
