import type { LanguageModelV1 } from 'ai';

// ---------------------------------------------------------------------------
// getModel — returns a language model based on environment config.
//
// Set in .env.local (development) or Vercel env vars (production):
//
//   AI_PROVIDER=groq          → Groq (free tier, recommended for MVP)
//   AI_PROVIDER=anthropic     → Anthropic Claude (paid, best quality)
//   AI_PROVIDER=openai        → OpenAI (paid)
//   AI_PROVIDER=ollama        → Ollama (fully local, no API key needed)
//
//   AI_MODEL=<model-id>       → optional override; each provider has a default
//
// Recommended free-tier setup for MVP:
//   AI_PROVIDER=groq
//   AI_MODEL=llama-3.3-70b-versatile
//   GROQ_API_KEY=<from console.groq.com — free>
//
// ---------------------------------------------------------------------------

const DEFAULTS: Record<string, string> = {
  groq:      'llama-3.3-70b-versatile',
  anthropic: 'claude-sonnet-4-6',
  openai:    'gpt-4o-mini',
  ollama:    'llama3.2',
};

export function getModel(): LanguageModelV1 {
  const provider = (process.env.AI_PROVIDER ?? 'groq').toLowerCase();
  const modelId  = process.env.AI_MODEL ?? DEFAULTS[provider] ?? DEFAULTS['groq'];

  switch (provider) {
    case 'anthropic': {
      const { anthropic } = require('@ai-sdk/anthropic');
      return anthropic(modelId);
    }

    case 'openai': {
      const { createOpenAI } = require('@ai-sdk/openai');
      return createOpenAI({ apiKey: process.env.OPENAI_API_KEY })(modelId);
    }

    case 'ollama': {
      // Ollama exposes an OpenAI-compatible API at localhost:11434
      // No API key required — runs fully locally
      const { createOpenAI } = require('@ai-sdk/openai');
      const baseURL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1';
      return createOpenAI({ baseURL, apiKey: 'ollama' })(modelId);
    }

    case 'groq':
    default: {
      const { createGroq } = require('@ai-sdk/groq');
      return createGroq({ apiKey: process.env.GROQ_API_KEY })(modelId);
    }
  }
}
