/** Keep generated TypeScript at one final newline so Git whitespace checks pass. */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
/** Visit only the generated client; preserve content and line endings inside each file. */
async function normalize(directory) {
 for (const entry of await readdir(directory, { withFileTypes: true })) {
  const filename = path.join(directory, entry.name)
  if (entry.isDirectory()) await normalize(filename)
  else if (entry.name.endsWith('.ts')) {
   const source = await readFile(filename, 'utf8')
   const result = source.replace(/(?:\r?\n)+$/, '') + (source.includes('\r\n') ? '\r\n' : '\n')
   if (source !== result) await writeFile(filename, result)
  }
 }
}
await normalize(fileURLToPath(new URL('../src/services/generated/', import.meta.url)))
