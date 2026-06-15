/**
 * Hackathon demo fallback for the brain's LLM endpoint.
 *
 * So nebula runs out of the box with **no personal API key**: when neither
 * `OPENAI_API_KEY` nor `NEBULA_LLM_API_KEY` is set, the CLI and gateway route
 * through this hosted, key-capped, rate-limited proxy (it holds the real key
 * server-side). Users who set their own key bypass this entirely.
 *
 * NOTE: this is a public demo endpoint for the Mantle Turing Test 2026. Remove
 * or rotate it after the event (it gates a shared, spend-capped OpenAI key).
 */
export const DEMO_LLM_BASE_URL = 'https://nebulaai.space/api/llm/v1'
export const DEMO_LLM_TOKEN = 'nebula-demo-c3ce165b62c9c8a2f8a61324'
