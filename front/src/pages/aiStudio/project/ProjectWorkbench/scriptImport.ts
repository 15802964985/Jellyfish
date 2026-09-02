export type ImportedScriptChapter = {
  title: string
  content: string
}

const MAX_SCRIPT_SIZE = 5 * 1024 * 1024
const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown']

function baseName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, '').trim() || '导入剧本'
}

function isChapterHeading(line: string) {
  const value = line.trim()
  if (!value) return false
  if (/^#{1,3}\s+\S+/.test(value)) return true
  return /^(?:第\s*[0-9０-９一二三四五六七八九十百千零〇两]+\s*[集章节幕回].*|(?:chapter|episode)\s+\d+\b.*)$/i.test(value)
}

function cleanHeading(line: string) {
  return line.trim().replace(/^#{1,6}\s*/, '').trim()
}

export function splitScriptIntoChapters(text: string, fileName: string): ImportedScriptChapter[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []

  const lines = normalized.split('\n')
  const result: ImportedScriptChapter[] = []
  let title = ''
  let body: string[] = []

  const flush = () => {
    const content = body.join('\n').trim()
    if (!title && !content) return
    result.push({
      title: title || (result.length === 0 ? baseName(fileName) : `第${result.length + 1}集`),
      content,
    })
    body = []
  }

  lines.forEach((line) => {
    if (isChapterHeading(line)) {
      if (title) flush()
      title = cleanHeading(line)
      return
    }
    body.push(line)
  })
  flush()

  if (result.length === 0) {
    return [{ title: baseName(fileName), content: normalized }]
  }
  return result.slice(0, 100)
}

export async function readScriptFile(file: File) {
  const lowerName = file.name.toLowerCase()
  if (!SUPPORTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
    throw new Error('目前支持 TXT、MD、MARKDOWN 格式')
  }
  if (file.size > MAX_SCRIPT_SIZE) {
    throw new Error('剧本文件不能超过 5MB')
  }
  const text = await file.text()
  const chapters = splitScriptIntoChapters(text, file.name)
  if (!chapters.length) throw new Error('文件中没有可导入的剧本内容')
  return chapters
}
