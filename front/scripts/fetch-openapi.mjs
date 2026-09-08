import { writeFile } from 'node:fs/promises'

// Allow an isolated schema-only backend during pre-migration validation.
// Production developer workflow keeps the original localhost:8000 default.
const url = process.env.JELLYFISH_OPENAPI_URL || 'http://127.0.0.1:8000/openapi.json'
const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' })
if (!response.ok) throw new Error(`OpenAPI download failed: ${response.status}`)
const schema = await response.json()
if (!schema.openapi || !schema.paths || !schema.components) throw new Error('Invalid OpenAPI document')
await writeFile(new URL('../openapi.json', import.meta.url), JSON.stringify(schema, null, 2) + '\n')
