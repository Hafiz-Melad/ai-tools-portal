import {
  Children,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

import ReactMarkdown, {
  type Components,
} from 'react-markdown'
import remarkGfm from 'remark-gfm'

import {
  Highlight,
  themes,
  type Language,
} from 'prism-react-renderer'

import {
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom'

import { supabase } from '../lib/supabase'

type Profile = {
  full_name: string
  credits: number
}

type AIModel = {
  id: string
  name: string
  provider: string
  model_key: string
  description: string
  enabled: boolean
}

type ResponseMode =
  | 'chat'
  | 'web_search'
  | 'research'

type ReasoningEffort =
  | 'low'
  | 'medium'
  | 'high'

type SearchSource = {
  id: number | null
  title: string
  url: string
  snippet: string | null
  date: string | null
  lastUpdated: string | null
}

type MessageAttachment = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  attachmentType: 'image' | 'document'
  previewUrl: string
}

type PendingAttachment = MessageAttachment & {
  localId: string
  status: 'uploading' | 'ready' | 'error'
  error?: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  attachments?: MessageAttachment[]
  responseMode?: ResponseMode
  sources?: SearchSource[]
}

type AttachmentUploadResponse = {
  success: boolean
  error?: string
  attachment?: {
    id: string
    fileName: string
    mimeType: string
    sizeBytes: number
    attachmentType: 'image' | 'document'
    conversationId: string | null
    status: 'pending'
  }
}

type StoredAttachmentRow = {
  id: string
  message_id: string | null
  storage_path: string
  file_name: string
  mime_type: string
  size_bytes: number
  attachment_type: 'image' | 'document'
}

type ExtractedPdfText = {
  text: string
  textTruncated: boolean
}

type ChatErrorResponse = {
  success?: boolean
  error?: string
}

type ChatStreamEvent =
  | {
      type: 'start'
      model?: {
        id: string
        name: string
        provider: string
        modelKey: string
      }
      responseMode?: ResponseMode
    }
  | {
      type: 'delta'
      delta: string
    }
  | {
      type: 'sources'
      responseMode: ResponseMode
      sources: SearchSource[]
    }
  | {
      type: 'complete'
      responseId: string
      conversationId: string
      creditsRemaining: number
      creditsUsed: number
      providerCostUsd: number
      responseMode: ResponseMode
      sources: SearchSource[]
    }
  | {
      type: 'error'
      error: string
    }

type ChatStreamCompleteEvent = Extract<
  ChatStreamEvent,
  { type: 'complete' }
>

type HistoryConversation = {
  id: string
  title: string | null
  model_id: string
  created_at: string
}

type HistoryMessage = {
  id: string
  role: string
  content: string
  created_at: string
  response_mode?: unknown
  sources?: unknown
}

type HistoryApiResponse = {
  success: boolean
  error?: string
  conversation?: HistoryConversation
  conversations?: HistoryConversation[]
  messages?: HistoryMessage[]
  deletedConversationId?: string
}

type SidebarItemProps = {
  label: string
  icon: ReactNode
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  badge?: string
}

const CHAT_STREAM_API_URL = import.meta.env.DEV
  ? 'https://ai-tools-portal-9h5.pages.dev/api/chat-stream'
  : '/api/chat-stream'

const HISTORY_API_URL = import.meta.env.DEV
  ? 'https://ai-tools-portal-9h5.pages.dev/api/history'
  : '/api/history'

const UPLOAD_ATTACHMENT_API_URL = import.meta.env.DEV
  ? 'https://ai-tools-portal-9h5.pages.dev/api/upload-attachment'
  : '/api/upload-attachment'

const REASONING_EFFORT_STORAGE_KEY =
  'claude_reasoning_effort'

const MAX_ATTACHMENTS_PER_MESSAGE = 4
const MAX_ATTACHMENT_SIZE_BYTES = 6 * 1024 * 1024
const MAX_EXTRACTED_DOCUMENT_CHARACTERS = 80_000
const MAX_PDF_PAGES = 100
const PDF_EXTRACTION_TIMEOUT_MS = 30_000

let pdfJsModulePromise:
  | Promise<typeof import('pdfjs-dist')>
  | null = null

const supportedImageMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

const supportedDocumentMimeTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
])

const extensionMimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
}

function normalizeReasoningEffort(
  value: unknown
): ReasoningEffort {
  if (typeof value !== 'string') {
    return 'medium'
  }

  const normalized = value
    .trim()
    .toLowerCase()

  if (
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high'
  ) {
    return normalized
  }

  return 'medium'
}

function getStoredReasoningEffort(): ReasoningEffort {
  try {
    return normalizeReasoningEffort(
      window.localStorage.getItem(
        REASONING_EFFORT_STORAGE_KEY
      )
    )
  } catch {
    return 'medium'
  }
}

function storeReasoningEffort(
  reasoningEffort: ReasoningEffort
): void {
  try {
    window.localStorage.setItem(
      REASONING_EFFORT_STORAGE_KEY,
      reasoningEffort
    )
  } catch {
    // The selection still works for this browser session.
  }
}

function Icon({
  name,
  className = 'h-5 w-5',
}: {
  name:
    | 'plus'
    | 'chat'
    | 'folder'
    | 'file'
    | 'artifact'
    | 'code'
    | 'sliders'
    | 'palette'
    | 'spark'
    | 'send'
    | 'copy'
    | 'check'
    | 'logout'
    | 'menu'
    | 'close'
    | 'mic'
    | 'wave'
    | 'trash'
  className?: string
}) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  const paths: Record<typeof name, ReactNode> = {
    plus: (
      <>
        <path d="M12 5v14" {...common} />
        <path d="M5 12h14" {...common} />
      </>
    ),
    chat: (
      <path
        d="M5.4 17.7 3.7 20v-4.7A8.1 8.1 0 1 1 20.2 12a8.1 8.1 0 0 1-8.2 8.1c-2.4 0-4.6-.8-6.6-2.4Z"
        {...common}
      />
    ),
    folder: (
      <>
        <path
          d="M3.5 7.5h6l1.7 2h9.3v8.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2V7.5Z"
          {...common}
        />
        <path
          d="M5 7.5V5.8a2 2 0 0 1 2-2h3.4l1.6 2H19"
          {...common}
        />
      </>
    ),
    file: (
      <>
        <path
          d="M6 3.5h8l4 4V20.5H6V3.5Z"
          {...common}
        />
        <path d="M14 3.5v4h4" {...common} />
        <path d="M9 12h6" {...common} />
        <path d="M9 15.5h6" {...common} />
      </>
    ),
    artifact: (
      <>
        <path
          d="M4.2 7.2 12 3l7.8 4.2v9.6L12 21l-7.8-4.2V7.2Z"
          {...common}
        />
        <path d="m4.6 7.4 7.4 4 7.4-4" {...common} />
        <path d="M12 11.4V21" {...common} />
      </>
    ),
    code: (
      <>
        <path d="m8.2 7.2-4 4.8 4 4.8" {...common} />
        <path d="m15.8 7.2 4 4.8-4 4.8" {...common} />
        <path d="m13.7 4.8-3.4 14.4" {...common} />
      </>
    ),
    sliders: (
      <>
        <path d="M4 7h10" {...common} />
        <path d="M18 7h2" {...common} />
        <path d="M4 17h2" {...common} />
        <path d="M10 17h10" {...common} />
        <circle cx="16" cy="7" r="2" {...common} />
        <circle cx="8" cy="17" r="2" {...common} />
      </>
    ),
    palette: (
      <>
        <path
          d="M12 3.2a8.8 8.8 0 1 0 0 17.6h1.1a1.9 1.9 0 0 0 1.5-3.1 1.9 1.9 0 0 1 1.5-3.1h1.4A3.5 3.5 0 0 0 21 11.1 8.1 8.1 0 0 0 12 3.2Z"
          {...common}
        />
        <circle cx="7.5" cy="10" r=".8" fill="currentColor" />
        <circle cx="10" cy="6.8" r=".8" fill="currentColor" />
        <circle cx="14.2" cy="6.8" r=".8" fill="currentColor" />
      </>
    ),
    spark: (
      <>
        <path
          d="M12 2.8c.5 4.8 2.4 6.9 7.2 7.4-4.8.5-6.7 2.6-7.2 7.4-.5-4.8-2.4-6.9-7.2-7.4 4.8-.5 6.7-2.6 7.2-7.4Z"
          fill="currentColor"
          stroke="none"
        />
        <path
          d="M19.1 15.7c.2 1.8.9 2.6 2.7 2.8-1.8.2-2.5 1-2.7 2.8-.2-1.8-.9-2.6-2.7-2.8 1.8-.2 2.5-1 2.7-2.8Z"
          fill="currentColor"
          stroke="none"
        />
      </>
    ),
    send: (
      <>
        <path d="m5 12 14-7-4.2 14-3-5-6.8-2Z" {...common} />
        <path d="m11.8 14 3.5-3.5" {...common} />
      </>
    ),
    copy: (
      <>
        <rect
          x="8"
          y="8"
          width="11"
          height="11"
          rx="2"
          {...common}
        />
        <path
          d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"
          {...common}
        />
      </>
    ),
    check: (
      <path d="m5 12.5 4.2 4.2L19 7" {...common} />
    ),
    logout: (
      <>
        <path d="M10 5H5.5v14H10" {...common} />
        <path d="M13 8.5 16.5 12 13 15.5" {...common} />
        <path d="M8 12h8.5" {...common} />
      </>
    ),
    menu: (
      <>
        <path d="M4 7h16" {...common} />
        <path d="M4 12h16" {...common} />
        <path d="M4 17h16" {...common} />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12" {...common} />
        <path d="m18 6-12 12" {...common} />
      </>
    ),
    mic: (
      <>
        <rect
          x="9"
          y="3.5"
          width="6"
          height="11"
          rx="3"
          {...common}
        />
        <path d="M6.8 11.5a5.2 5.2 0 0 0 10.4 0" {...common} />
        <path d="M12 16.7v3.8" {...common} />
      </>
    ),
    wave: (
      <>
        <path d="M4 10v4" {...common} />
        <path d="M7.2 7.5v9" {...common} />
        <path d="M10.4 5v14" {...common} />
        <path d="M13.6 8.5v7" {...common} />
        <path d="M16.8 6.5v11" {...common} />
        <path d="M20 10v4" {...common} />
      </>
    ),
    trash: (
      <>
        <path d="M4.5 7h15" {...common} />
        <path d="M9 7V4.8h6V7" {...common} />
        <path d="m7 7 .8 13h8.4L17 7" {...common} />
        <path d="M10 10.5v6" {...common} />
        <path d="M14 10.5v6" {...common} />
      </>
    ),
  }

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {paths[name]}
    </svg>
  )
}

function SidebarItem({
  label,
  icon,
  onClick,
  active = false,
  disabled = false,
  badge,
}: SidebarItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition',
        active
          ? 'bg-[#2a2a28] text-[#f2eee6]'
          : 'text-[#ded8cf] hover:bg-[#292927]',
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'cursor-pointer',
      ].join(' ')}
    >
      <span className="flex h-5 w-5 items-center justify-center text-[#d9d3ca]">
        {icon}
      </span>

      <span className="min-w-0 flex-1 truncate">
        {label}
      </span>

      {badge && (
        <span className="rounded-full border border-[#4b4945] px-2 py-0.5 text-[10px] text-[#aaa39a]">
          {badge}
        </span>
      )}
    </button>
  )
}

function normalizeModelRelation(
  value: unknown
): AIModel | null {
  if (Array.isArray(value)) {
    return (value[0] as AIModel | undefined) ?? null
  }

  return (value as AIModel | null) ?? null
}

function getInitials(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) {
    return 'U'
  }

  return parts
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function formatConversationDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(date)
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`
  }

  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`
  }

  return `${(
    sizeBytes /
    (1024 * 1024)
  ).toFixed(1)} MB`
}


function getReactNodeText(node: ReactNode): string {
  if (
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node
      .map((child) => getReactNodeText(child))
      .join('')
  }

  if (isValidElement(node)) {
    const elementProps = node.props as {
      children?: ReactNode
    }

    return getReactNodeText(
      elementProps.children
    )
  }

  return ''
}

function getCodeLanguage(
  children: ReactNode
): string | null {
  const child = Children.toArray(children)[0]

  if (!isValidElement(child)) {
    return null
  }

  const elementProps = child.props as {
    className?: string
  }

  const match =
    elementProps.className?.match(
      /language-([a-zA-Z0-9_+-]+)/
    )

  return match?.[1] ?? null
}

const codeLanguageAliases: Record<
  string,
  Language
> = {
  bash: 'bash',
  shell: 'bash',
  sh: 'bash',
  zsh: 'bash',
  powershell: 'bash',
  ps1: 'bash',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  csharp: 'clike',
  cs: 'clike',
  java: 'clike',
  kotlin: 'clike',
  rust: 'clike',
  css: 'css',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'jsx',
  typescript: 'typescript',
  ts: 'typescript',
  tsx: 'tsx',
  json: 'json',
  jsonc: 'json',
  python: 'python',
  py: 'python',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  html: 'markup',
  xml: 'markup',
  svg: 'markup',
  markup: 'markup',
  markdown: 'markdown',
  md: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  diff: 'diff',
  git: 'git',
  go: 'go',
  golang: 'go',
  scss: 'scss',
  sass: 'sass',
  less: 'less',
  makefile: 'makefile',
  wasm: 'wasm',
  handlebars: 'handlebars',
  hbs: 'handlebars',
  objectivec: 'objectivec',
  objc: 'objectivec',
  ocaml: 'ocaml',
  reason: 'reason',
}

const codeLanguageLabels: Record<
  string,
  string
> = {
  bash: 'Bash',
  shell: 'Shell',
  sh: 'Shell',
  zsh: 'Zsh',
  powershell: 'PowerShell',
  ps1: 'PowerShell',
  c: 'C',
  cpp: 'C++',
  'c++': 'C++',
  csharp: 'C#',
  cs: 'C#',
  java: 'Java',
  kotlin: 'Kotlin',
  rust: 'Rust',
  css: 'CSS',
  javascript: 'JavaScript',
  js: 'JavaScript',
  jsx: 'JSX',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  tsx: 'TSX',
  json: 'JSON',
  jsonc: 'JSON with comments',
  python: 'Python',
  py: 'Python',
  sql: 'SQL',
  graphql: 'GraphQL',
  gql: 'GraphQL',
  html: 'HTML',
  xml: 'XML',
  svg: 'SVG',
  markup: 'Markup',
  markdown: 'Markdown',
  md: 'Markdown',
  yaml: 'YAML',
  yml: 'YAML',
  diff: 'Diff',
  git: 'Git',
  go: 'Go',
  golang: 'Go',
  scss: 'SCSS',
  sass: 'Sass',
  less: 'Less',
  makefile: 'Makefile',
  wasm: 'WebAssembly',
  handlebars: 'Handlebars',
  hbs: 'Handlebars',
  objectivec: 'Objective-C',
  objc: 'Objective-C',
  ocaml: 'OCaml',
  reason: 'Reason',
}

function normalizeCodeLanguage(
  value: string | null
): Language {
  if (!value) {
    return 'markup'
  }

  return (
    codeLanguageAliases[
      value.trim().toLowerCase()
    ] ?? 'markup'
  )
}

function getCodeLanguageLabel(
  value: string | null
): string {
  if (!value) {
    return 'Code'
  }

  const normalized = value
    .trim()
    .toLowerCase()

  return (
    codeLanguageLabels[normalized] ??
    normalized.toUpperCase()
  )
}

function MarkdownCodeBlock({
  children,
}: {
  children: ReactNode
}) {
  const [copied, setCopied] = useState(false)

  const code = getReactNodeText(children)
    .replace(/\n$/, '')

  const rawLanguage = getCodeLanguage(children)
  const language = normalizeCodeLanguage(
    rawLanguage
  )
  const languageLabel = getCodeLanguageLabel(
    rawLanguage
  )

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)

      window.setTimeout(() => {
        setCopied(false)
      }, 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="my-4 min-w-0 overflow-hidden rounded-xl border border-[#44423e] bg-[#181817]">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-[#393835] bg-[#222220] px-3">
        <span className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-[#918a81]">
          {languageLabel}
        </span>

        <button
          type="button"
          onClick={() => void copyCode()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-[#aaa49c] transition hover:bg-[#333330] hover:text-[#eee9e1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#81766c]"
          aria-label={
            copied
              ? 'Code copied'
              : 'Copy code'
          }
          title={
            copied
              ? 'Copied'
              : 'Copy code'
          }
        >
          <Icon
            name={copied ? 'check' : 'copy'}
            className="h-3.5 w-3.5"
          />

          <span>
            {copied ? 'Copied' : 'Copy'}
          </span>
        </button>
      </div>

      <Highlight
        theme={themes.vsDark}
        code={code}
        language={language}
      >
        {({
          className,
          style,
          tokens,
          getLineProps,
          getTokenProps,
        }) => (
          <pre
            className={`${className} overflow-x-auto p-4 font-mono text-[13px] leading-6`}
            style={{
              ...style,
              margin: 0,
              minWidth: 0,
              background: 'transparent',
            }}
          >
            <code className="block min-w-max">
              {tokens.map((line, lineIndex) => {
                const lineProps = getLineProps({
                  line,
                })

                return (
                  <span
                    key={lineIndex}
                    {...lineProps}
                    className={`${lineProps.className ?? ''} block min-h-6`}
                  >
                    {line.map((token, tokenIndex) => (
                      <span
                        key={tokenIndex}
                        {...getTokenProps({ token })}
                      />
                    ))}
                  </span>
                )
              })}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  )
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="mb-3 mt-6 text-3xl font-semibold leading-tight text-[#f2eee7] first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 mt-6 text-2xl font-semibold leading-tight text-[#f2eee7] first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-5 text-xl font-semibold leading-snug text-[#f2eee7] first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 mt-4 text-lg font-semibold text-[#f2eee7] first:mt-0">
      {children}
    </h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-2 mt-4 text-base font-semibold text-[#f2eee7] first:mt-0">
      {children}
    </h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-2 mt-4 text-sm font-semibold uppercase tracking-[0.08em] text-[#cfc8bf] first:mt-0">
      {children}
    </h6>
  ),
  p: ({ children }) => (
    <p className="my-3 text-[15px] leading-7 text-[#e7e1d8] first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-[#fffaf1]">
      {children}
    </strong>
  ),
  em: ({ children }) => (
    <em className="italic text-[#eee8df]">
      {children}
    </em>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-6 text-[15px] leading-7 text-[#e7e1d8]">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-6 text-[15px] leading-7 text-[#e7e1d8]">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li className="pl-1 marker:text-[#9b958d]">
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-[#746b61] pl-4 text-[#cfc8bf]">
      {children}
    </blockquote>
  ),
  a: ({ href, title, children }) => (
    <a
      href={href}
      title={title}
      target="_blank"
      rel="noreferrer"
      className="font-medium text-[#e58b6a] underline decoration-[#8f5f4d] underline-offset-4 transition hover:text-[#f0a283]"
    >
      {children}
    </a>
  ),
  hr: () => (
    <hr className="my-6 border-0 border-t border-[#3d3b37]" />
  ),
  pre: ({ children }) => (
    <MarkdownCodeBlock>
      {children}
    </MarkdownCodeBlock>
  ),
  code: ({ className, children }) => {
    const isBlockCode =
      Boolean(className) ||
      getReactNodeText(children).includes(
        '\n'
      )

    return (
      <code
        className={
          isBlockCode
            ? `${className ?? ''} bg-transparent font-mono text-inherit`
            : 'rounded-md border border-[#45423e] bg-[#2b2a27] px-1.5 py-0.5 font-mono text-[0.9em] text-[#f0d9c7]'
        }
      >
        {children}
      </code>
    )
  },
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-xl border border-[#44423e]">
      <table className="min-w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-[#292927] text-[#f1ece4]">
      {children}
    </thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-[#3b3935]">
      {children}
    </tbody>
  ),
  tr: ({ children }) => (
    <tr className="divide-x divide-[#3b3935]">
      {children}
    </tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2.5 font-semibold">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2.5 align-top text-[#ddd7ce]">
      {children}
    </td>
  ),
  del: ({ children }) => (
    <del className="text-[#9c958c]">
      {children}
    </del>
  ),
}

function normalizeResponseMode(
  value: unknown
): ResponseMode {
  return value === 'web_search' ||
    value === 'research'
    ? value
    : 'chat'
}

function normalizeSearchSources(
  value: unknown
): SearchSource[] {
  if (!Array.isArray(value)) {
    return []
  }

  const sources: SearchSource[] = []

  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object'
    ) {
      continue
    }

    const raw =
      item as Record<string, unknown>

    if (
      typeof raw.url !== 'string' ||
      !raw.url.trim()
    ) {
      continue
    }

    let parsedUrl: URL

    try {
      parsedUrl = new URL(raw.url)
    } catch {
      continue
    }

    if (
      parsedUrl.protocol !== 'https:' &&
      parsedUrl.protocol !== 'http:'
    ) {
      continue
    }

    let id: number | null = null

    if (
      typeof raw.id === 'number' &&
      Number.isInteger(raw.id) &&
      raw.id > 0
    ) {
      id = raw.id
    } else if (
      typeof raw.id === 'string' &&
      /^\d+$/.test(raw.id.trim())
    ) {
      const parsedId = Number(raw.id)

      if (
        Number.isSafeInteger(parsedId) &&
        parsedId > 0
      ) {
        id = parsedId
      }
    }

    const title =
      typeof raw.title === 'string' &&
      raw.title.trim()
        ? raw.title.trim().slice(0, 300)
        : parsedUrl.hostname

    const optionalText = (
      candidate: unknown,
      maximumLength: number
    ): string | null =>
      typeof candidate === 'string' &&
      candidate.trim()
        ? candidate
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, maximumLength)
        : null

    const normalized: SearchSource = {
      id,
      title,
      url: parsedUrl.toString(),
      snippet: optionalText(
        raw.snippet,
        1000
      ),
      date: optionalText(
        raw.date,
        80
      ),
      lastUpdated: optionalText(
        raw.lastUpdated ??
          raw.last_updated,
        80
      ),
    }

    const existingIndex =
      sources.findIndex(
        (source) =>
          (
            normalized.id !== null &&
            source.id === normalized.id
          ) ||
          source.url === normalized.url
      )

    if (existingIndex < 0) {
      if (sources.length < 100) {
        sources.push(normalized)
      }
    } else {
      sources[existingIndex] = normalized
    }
  }

  return sources
}

function getResponseModeLabel(
  responseMode: ResponseMode
): string {
  if (responseMode === 'web_search') {
    return 'Web Search'
  }

  if (responseMode === 'research') {
    return 'Research'
  }

  return 'Chat'
}

function escapeMarkdownUrl(
  value: string
): string {
  return value
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
}

function linkifyCitationReferences(
  content: string,
  sources: SearchSource[]
): string {
  if (sources.length === 0) {
    return content
  }

  const sourceById = new Map(
    sources
      .filter(
        (
          source
        ): source is SearchSource & {
          id: number
        } => source.id !== null
      )
      .map((source) => [
        source.id,
        source,
      ])
  )

  if (sourceById.size === 0) {
    return content
  }

  const fencedParts =
    content.split(/(```[\s\S]*?```)/g)

  return fencedParts
    .map((fencedPart, fencedIndex) => {
      if (fencedIndex % 2 === 1) {
        return fencedPart
      }

      const inlineParts =
        fencedPart.split(/(`[^`\n]*`)/g)

      return inlineParts
        .map((inlinePart, inlineIndex) => {
          if (inlineIndex % 2 === 1) {
            return inlinePart
          }

          return inlinePart.replace(
            /(^|[^\[])\[(\d+)\](?![\]\(])/g,
            (
              _match,
              prefix: string,
              rawId: string
            ) => {
              const source =
                sourceById.get(
                  Number(rawId)
                )

              if (!source) {
                return `${prefix}[${rawId}]`
              }

              return (
                `${prefix}[[${rawId}]](` +
                `${escapeMarkdownUrl(source.url)})`
              )
            }
          )
        })
        .join('')
    })
    .join('')
}

function SourceList({
  sources,
}: {
  sources: SearchSource[]
}) {
  if (sources.length === 0) {
    return null
  }

  return (
    <details
      className="mt-4 rounded-xl border border-[#403e3a] bg-[#242422]"
      open={sources.length <= 3}
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-[#cfc8bf]">
        {sources.length}{' '}
        {sources.length === 1
          ? 'source'
          : 'sources'}
      </summary>

      <div className="grid gap-2 border-t border-[#3b3935] p-2 sm:grid-cols-2">
        {sources.map((source, index) => {
          let host = source.url

          try {
            host = new URL(
              source.url
            ).hostname.replace(/^www\./, '')
          } catch {
            // The URL was normalized before rendering.
          }

          return (
            <a
              key={`${source.id ?? 'source'}-${source.url}-${index}`}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 rounded-lg border border-[#3d3b37] bg-[#292927] px-3 py-2 transition hover:border-[#5a554e] hover:bg-[#302f2c]"
            >
              <span className="block truncate text-xs font-medium text-[#eee9e1]">
                {source.id !== null
                  ? `[${source.id}] `
                  : ''}
                {source.title}
              </span>

              <span className="mt-1 block truncate text-[10px] text-[#8f8981]">
                {host}
                {source.date
                  ? ` · ${source.date}`
                  : ''}
              </span>

              {source.snippet && (
                <span className="mt-1 line-clamp-2 block text-[11px] leading-4 text-[#aaa49c]">
                  {source.snippet}
                </span>
              )}
            </a>
          )
        })}
      </div>
    </details>
  )
}

function MarkdownMessage({
  content,
  sources = [],
}: {
  content: string
  sources?: SearchSource[]
}) {
  const renderedContent =
    linkifyCitationReferences(
      content,
      sources
    )

  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {renderedContent}
      </ReactMarkdown>
    </div>
  )
}

function getImageExtension(
  mimeType: string
): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    default:
      return 'png'
  }
}

function getFileExtension(fileName: string): string {
  const normalized = fileName
    .trim()
    .toLowerCase()

  const lastDot = normalized.lastIndexOf('.')

  return lastDot >= 0
    ? normalized.slice(lastDot)
    : ''
}

function resolveAttachmentMimeType(
  file: File
): string {
  const suppliedMimeType = file.type
    .trim()
    .toLowerCase()

  if (
    suppliedMimeType &&
    suppliedMimeType !==
      'application/octet-stream'
  ) {
    return suppliedMimeType
  }

  return (
    extensionMimeTypes[
      getFileExtension(file.name)
    ] ?? ''
  )
}

function getAttachmentType(
  mimeType: string
): 'image' | 'document' | null {
  if (
    supportedImageMimeTypes.has(mimeType)
  ) {
    return 'image'
  }

  if (
    supportedDocumentMimeTypes.has(
      mimeType
    )
  ) {
    return 'document'
  }

  return null
}

function getDocumentLabel(
  fileName: string
): string {
  const extension = getFileExtension(
    fileName
  )
    .replace('.', '')
    .toUpperCase()

  return extension || 'FILE'
}

async function loadBrowserPdfJs() {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = (async () => {
      const [pdfJs, workerModule] =
        await Promise.all([
          import('pdfjs-dist'),
          import(
            'pdfjs-dist/build/pdf.worker.min.mjs?url'
          ),
        ])

      pdfJs.GlobalWorkerOptions.workerSrc =
        workerModule.default

      return pdfJs
    })()
  }

  return pdfJsModulePromise
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMilliseconds: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error(message)),
      timeoutMilliseconds
    )

    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (reason) => {
        window.clearTimeout(timeoutId)
        reject(reason)
      }
    )
  })
}

function normalizePdfText(value: string): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

async function extractPdfTextInBrowser(
  file: File
): Promise<ExtractedPdfText> {
  const pdfJs = await loadBrowserPdfJs()
  const bytes = new Uint8Array(
    await file.arrayBuffer()
  )

  const loadingTask = pdfJs.getDocument({
    data: bytes,
    useSystemFonts: true,
    isEvalSupported: false,
  })

  const extractionDeadline =
    Date.now() + PDF_EXTRACTION_TIMEOUT_MS

  function remainingTime(): number {
    return Math.max(
      1,
      extractionDeadline - Date.now()
    )
  }

  try {
    const pdf = await withTimeout(
      loadingTask.promise,
      remainingTime(),
      'PDF text extraction timed out.'
    )

    if (
      pdf.numPages <= 0 ||
      pdf.numPages > MAX_PDF_PAGES
    ) {
      throw new Error(
        `PDF documents must contain between 1 and ${MAX_PDF_PAGES} pages.`
      )
    }

    let extractedText = ''
    let textTruncated = false

    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber += 1
    ) {
      const page = await withTimeout(
        pdf.getPage(pageNumber),
        remainingTime(),
        'PDF text extraction timed out.'
      )

      const textContent = await withTimeout(
        page.getTextContent(),
        remainingTime(),
        'PDF text extraction timed out.'
      )

      const pageLines: string[] = []
      let currentLine = ''

      for (const item of textContent.items) {
        if (!('str' in item)) {
          continue
        }

        const itemText = item.str.trim()

        if (itemText) {
          currentLine += currentLine
            ? ` ${itemText}`
            : itemText
        }

        if (item.hasEOL && currentLine) {
          pageLines.push(currentLine)
          currentLine = ''
        }
      }

      if (currentLine) {
        pageLines.push(currentLine)
      }

      const pageText = pageLines
        .join('\n')
        .trim()

      if (!pageText) {
        continue
      }

      const section =
        `${extractedText ? '\n\n' : ''}` +
        `[Page ${pageNumber}]\n${pageText}`

      const remainingCharacters =
        MAX_EXTRACTED_DOCUMENT_CHARACTERS -
        extractedText.length

      if (
        section.length >
        remainingCharacters
      ) {
        extractedText += section.slice(
          0,
          Math.max(0, remainingCharacters)
        )
        textTruncated = true
        break
      }

      extractedText += section
    }

    extractedText =
      normalizePdfText(extractedText)

    if (!extractedText) {
      throw new Error(
        'No readable text was found in this PDF. Scanned PDFs require OCR, which is not enabled yet.'
      )
    }

    return {
      text: extractedText,
      textTruncated,
    }
  } finally {
    try {
      await loadingTask.destroy()
    } catch {
      // Browser-side PDF cleanup is best effort.
    }
  }
}

function Chat() {
  const { modelId: modelIdFromUrl } = useParams()
  const navigate = useNavigate()
  const location = useLocation()

  const conversationFromUrl = useMemo<string>(
    () =>
      new URLSearchParams(location.search)
        .get('conversation')
        ?.trim() ?? '',
    [location.search]
  )

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null)

  const fileInputRef =
    useRef<HTMLInputElement | null>(null)

  const objectPreviewUrlsRef =
    useRef<Set<string>>(new Set())

  const loadedConversationIdRef =
    useRef<string | null>(null)

  const pendingPromptRef =
    useRef<string | null>(null)

  const generationAbortControllerRef =
    useRef<AbortController | null>(null)

  const generationStoppedRef =
    useRef(false)

  const [profile, setProfile] =
    useState<Profile | null>(null)

  const [models, setModels] =
    useState<AIModel[]>([])

  const [activeModelId, setActiveModelId] =
    useState(modelIdFromUrl ?? '')

  const [messages, setMessages] =
    useState<ChatMessage[]>([])

  const [conversations, setConversations] =
    useState<HistoryConversation[]>([])

  const [message, setMessage] = useState('')

  const [responseMode, setResponseMode] =
    useState<ResponseMode>('chat')

  const [reasoningEffort, setReasoningEffort] =
    useState<ReasoningEffort>(
      getStoredReasoningEffort
    )

  const [
    pendingAttachments,
    setPendingAttachments,
  ] = useState<PendingAttachment[]>([])

  const [bootstrapLoading, setBootstrapLoading] =
    useState(true)

  const [
    conversationLoading,
    setConversationLoading,
  ] = useState(false)

  const [sending, setSending] = useState(false)

  const [
    streamingMessageId,
    setStreamingMessageId,
  ] = useState<string | null>(null)

  const [sidebarOpen, setSidebarOpen] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [conversationId, setConversationId] =
    useState<string | null>(null)

  const [conversationTitle, setConversationTitle] =
    useState<string | null>(null)

  const [creditsRemaining, setCreditsRemaining] =
    useState<number | null>(null)

  const [subscriptionStatus, setSubscriptionStatus] =
    useState<string | null>(null)

  const [lastCreditsUsed, setLastCreditsUsed] =
    useState<number | null>(null)

  const [copiedMessageId, setCopiedMessageId] =
    useState<string | null>(null)

  const [signingOut, setSigningOut] =
    useState(false)

  const [
    deletingConversationId,
    setDeletingConversationId,
  ] = useState<string | null>(null)

  const activeModel = useMemo(
    () =>
      models.find(
        (candidate) =>
          candidate.id === activeModelId
      ) ?? null,
    [models, activeModelId]
  )

  const hasCredits =
    typeof creditsRemaining === 'number' &&
    creditsRemaining > 0

  const subscriptionIsActive =
    subscriptionStatus === 'active'

  const canSendMessages =
    hasCredits &&
    subscriptionIsActive &&
    activeModel !== null

  const attachmentUploadInProgress =
    pendingAttachments.some(
      (attachment) =>
        attachment.status === 'uploading'
    )

  const readyAttachments =
    pendingAttachments.filter(
      (attachment) =>
        attachment.status === 'ready'
    )

  const canSubmitMessage =
    canSendMessages &&
    !sending &&
    !bootstrapLoading &&
    !conversationLoading &&
    !attachmentUploadInProgress &&
    (
      message.trim().length > 0 ||
      readyAttachments.length > 0
    )

  const accessMessage = !hasCredits
    ? 'No credits remain on this account. Contact the administrator to add credits.'
    : !subscriptionIsActive
      ? 'This Claude subscription is inactive.'
      : null

  useEffect(() => {
    return () => {
      generationStoppedRef.current = true
      generationAbortControllerRef.current?.abort()
      generationAbortControllerRef.current = null

      for (
        const previewUrl of
        objectPreviewUrlsRef.current
      ) {
        URL.revokeObjectURL(previewUrl)
      }

      objectPreviewUrlsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrapChat() {
      try {
        setBootstrapLoading(true)
        setError(null)

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!session?.user) {
          throw new Error(
            'You must log in first.'
          )
        }

        const user = session.user

        const [
          profileResult,
          subscriptionResult,
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('full_name, credits')
            .eq('id', user.id)
            .single(),

          supabase
            .from('subscriptions')
            .select('plan_id, status')
            .eq('user_id', user.id)
            .limit(1)
            .maybeSingle(),
        ])

        if (profileResult.error) {
          throw profileResult.error
        }

        if (subscriptionResult.error) {
          throw subscriptionResult.error
        }

        if (!subscriptionResult.data) {
          throw new Error(
            'No subscription was found.'
          )
        }

        const subscription =
          subscriptionResult.data

        const {
          data: modelRows,
          error: modelError,
        } = await supabase
          .from('plan_models')
          .select(`
            ai_models (
              id,
              name,
              provider,
              model_key,
              description,
              enabled
            )
          `)
          .eq('plan_id', subscription.plan_id)

        if (modelError) {
          throw modelError
        }

        const availableModels = (modelRows ?? [])
          .map((item: { ai_models?: unknown }) =>
            normalizeModelRelation(item.ai_models)
          )
          .filter(
            (candidate): candidate is AIModel =>
              candidate !== null &&
              candidate.enabled === true &&
              (
                candidate.provider.toLowerCase() ===
                  'anthropic' ||
                candidate.name
                  .toLowerCase()
                  .startsWith('claude')
              )
          )
          .sort((firstModel, secondModel) =>
            secondModel.name.localeCompare(
              firstModel.name,
              undefined,
              { numeric: true }
            )
          )

        const requestedModel =
          availableModels.find(
            (candidate) =>
              candidate.id === modelIdFromUrl
          )

        const defaultModel =
          requestedModel ??
          availableModels.find(
            (candidate) =>
              candidate.name.toLowerCase() ===
              'claude sonnet 5'
          ) ??
          availableModels.find((candidate) =>
            candidate.name
              .toLowerCase()
              .includes('sonnet')
          ) ??
          availableModels[0]

        const historyResponse = await fetch(
          HISTORY_API_URL,
          {
            method: 'GET',
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
            },
          }
        )

        let historyResult: HistoryApiResponse

        try {
          historyResult =
            (await historyResponse.json()) as
              HistoryApiResponse
        } catch {
          throw new Error(
            'The history server returned an invalid response.'
          )
        }

        if (
          !historyResponse.ok ||
          !historyResult.success
        ) {
          throw new Error(
            historyResult.error ||
              'Could not load recent conversations.'
          )
        }

        const availableModelIds = new Set(
          availableModels.map(
            (candidate) => candidate.id
          )
        )

        if (cancelled) {
          return
        }

        setProfile(profileResult.data)
        setCreditsRemaining(
          profileResult.data.credits
        )
        setSubscriptionStatus(
          subscription.status
        )
        setModels(availableModels)
        setActiveModelId(defaultModel?.id ?? '')

        setConversations(
          (historyResult.conversations ?? [])
            .filter((conversation) =>
              availableModelIds.has(
                conversation.model_id
              )
            )
            .slice(0, 30)
        )

        if (!conversationFromUrl) {
          const pendingPrompt =
            sessionStorage
              .getItem('claude_pending_prompt')
              ?.trim()

          if (pendingPrompt) {
            sessionStorage.removeItem(
              'claude_pending_prompt'
            )

            pendingPromptRef.current =
              pendingPrompt
          }
        }
      } catch (err) {
        if (cancelled) {
          return
        }

        console.error(err)

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load Claude.'
        )
      } finally {
        if (!cancelled) {
          setBootstrapLoading(false)
        }
      }
    }

    void bootstrapChat()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (bootstrapLoading) {
      return
    }

    const targetConversationId: string =
      conversationFromUrl

    if (!targetConversationId) {
      if (loadedConversationIdRef.current) {
        loadedConversationIdRef.current = null
        setConversationId(null)
        setConversationTitle(null)
        setMessages([])
        setLastCreditsUsed(null)
      }

      return
    }

    if (
      loadedConversationIdRef.current ===
      targetConversationId
    ) {
      return
    }

    let cancelled = false

    async function loadConversation() {
      try {
        setConversationLoading(true)
        setError(null)

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!session?.access_token) {
          throw new Error(
            'Your login session has expired.'
          )
        }

        const response = await fetch(
          `${HISTORY_API_URL}?conversationId=${encodeURIComponent(
            targetConversationId
          )}`,
          {
            method: 'GET',
            headers: {
              Authorization:
                `Bearer ${session.access_token}`,
            },
          }
        )

        let result: HistoryApiResponse

        try {
          result =
            (await response.json()) as
              HistoryApiResponse
        } catch {
          throw new Error(
            'The history server returned an invalid response.'
          )
        }

        if (!response.ok || !result.success) {
          throw new Error(
            result.error ||
              'Could not load the conversation.'
          )
        }

        if (!result.conversation) {
          throw new Error(
            'The conversation was not found.'
          )
        }

        let restoredMessages: ChatMessage[] =
          (result.messages ?? [])
            .filter(
              (savedMessage) =>
                savedMessage.role === 'user' ||
                savedMessage.role === 'assistant'
            )
            .map((savedMessage) => {
              const role =
                savedMessage.role as
                  | 'user'
                  | 'assistant'

              return {
                id: savedMessage.id,
                role,
                content: savedMessage.content,
                responseMode:
                  role === 'assistant'
                    ? normalizeResponseMode(
                        savedMessage.response_mode
                      )
                    : undefined,
                sources:
                  role === 'assistant'
                    ? normalizeSearchSources(
                        savedMessage.sources
                      )
                    : undefined,
              }
            })

        try {
          const assistantMessageIds =
            restoredMessages
              .filter(
                (savedMessage) =>
                  savedMessage.role ===
                  'assistant'
              )
              .map(
                (savedMessage) =>
                  savedMessage.id
              )

          if (
            assistantMessageIds.length > 0
          ) {
            const {
              data: metadataRows,
              error: metadataError,
            } = await supabase
              .from('messages')
              .select(
                'id, response_mode, sources'
              )
              .in(
                'id',
                assistantMessageIds
              )

            if (!metadataError) {
              const metadataById =
                new Map(
                  (
                    metadataRows ?? []
                  ).map((row) => [
                    row.id as string,
                    row,
                  ])
                )

              restoredMessages =
                restoredMessages.map(
                  (savedMessage) => {
                    if (
                      savedMessage.role !==
                      'assistant'
                    ) {
                      return savedMessage
                    }

                    const metadata =
                      metadataById.get(
                        savedMessage.id
                      )

                    if (!metadata) {
                      return savedMessage
                    }

                    return {
                      ...savedMessage,
                      responseMode:
                        normalizeResponseMode(
                          metadata.response_mode
                        ),
                      sources:
                        normalizeSearchSources(
                          metadata.sources
                        ),
                    }
                  }
                )
            }
          }
        } catch (metadataLoadError) {
          console.error(
            'Could not load response metadata:',
            metadataLoadError
          )
        }

        try {
          const messageIds = restoredMessages.map(
            (savedMessage) => savedMessage.id
          )

          if (messageIds.length > 0) {
            const {
              data: attachmentRows,
              error: attachmentError,
            } = await supabase
              .from('chat_attachments')
              .select(
                'id, message_id, storage_path, file_name, mime_type, size_bytes, attachment_type'
              )
              .eq(
                'conversation_id',
                result.conversation.id
              )
              .eq('status', 'attached')
              .in('message_id', messageIds)

            if (attachmentError) {
              throw attachmentError
            }

            const storedAttachments =
              (attachmentRows ??
                []) as StoredAttachmentRow[]

            if (storedAttachments.length > 0) {
              const {
                data: signedRows,
                error: signedUrlError,
              } = await supabase.storage
                .from('chat-attachments')
                .createSignedUrls(
                  storedAttachments.map(
                    (attachment) =>
                      attachment.storage_path
                  ),
                  60 * 60
                )

              if (signedUrlError) {
                throw signedUrlError
              }

              const signedResults = (
                signedRows ?? []
              ) as Array<{
                signedUrl?: string
              }>

              const attachmentsByMessage =
                new Map<
                  string,
                  MessageAttachment[]
                >()

              storedAttachments.forEach(
                (attachment, index) => {
                  if (!attachment.message_id) {
                    return
                  }

                  const previewUrl =
                    signedResults[
                      index
                    ]?.signedUrl?.trim() ?? ''

                  const currentAttachments =
                    attachmentsByMessage.get(
                      attachment.message_id
                    ) ?? []

                  currentAttachments.push({
                    id: attachment.id,
                    fileName:
                      attachment.file_name,
                    mimeType:
                      attachment.mime_type,
                    sizeBytes:
                      attachment.size_bytes,
                    attachmentType:
                      attachment.attachment_type,
                    previewUrl,
                  })

                  attachmentsByMessage.set(
                    attachment.message_id,
                    currentAttachments
                  )
                }
              )

              restoredMessages =
                restoredMessages.map(
                  (savedMessage) => ({
                    ...savedMessage,
                    attachments:
                      attachmentsByMessage.get(
                        savedMessage.id
                      ),
                  })
                )
            }
          }
        } catch (attachmentLoadError) {
          console.error(
            'Could not load message attachments:',
            attachmentLoadError
          )
        }

        const storedModel = models.find(
          (candidate) =>
            candidate.id ===
            result.conversation?.model_id
        )

        if (cancelled) {
          return
        }

        loadedConversationIdRef.current =
          result.conversation.id

        setConversationId(
          result.conversation.id
        )

        setConversationTitle(
          result.conversation.title
        )

        setMessages(restoredMessages)

        const latestAssistantMode =
          [...restoredMessages]
            .reverse()
            .find(
              (savedMessage) =>
                savedMessage.role ===
                'assistant'
            )?.responseMode

        if (latestAssistantMode) {
          setResponseMode(
            latestAssistantMode
          )
        }

        if (storedModel) {
          setActiveModelId(storedModel.id)

          navigate(
            `/chat/${storedModel.id}?conversation=${result.conversation.id}`,
            { replace: true }
          )
        }
      } catch (err) {
        if (cancelled) {
          return
        }

        console.error(err)

        setError(
          err instanceof Error
            ? err.message
            : 'Could not load the conversation.'
        )
      } finally {
        if (!cancelled) {
          setConversationLoading(false)
        }
      }
    }

    void loadConversation()

    return () => {
      cancelled = true
    }
  }, [
    bootstrapLoading,
    conversationFromUrl,
    models,
    navigate,
  ])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
    })
  }, [messages, sending])

  useEffect(() => {
    const pendingPrompt =
      pendingPromptRef.current

    if (
      bootstrapLoading ||
      conversationLoading ||
      sending ||
      conversationFromUrl ||
      !activeModel ||
      !canSendMessages ||
      !pendingPrompt
    ) {
      return
    }

    pendingPromptRef.current = null
    void sendText(pendingPrompt)
  }, [
    bootstrapLoading,
    conversationLoading,
    sending,
    conversationFromUrl,
    activeModel,
    canSendMessages,
  ])

  async function refreshConversationList(
    accessToken: string
  ) {
    try {
      const response = await fetch(
        HISTORY_API_URL,
        {
          method: 'GET',
          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },
        }
      )

      const result =
        (await response.json()) as
          HistoryApiResponse

      if (
        response.ok &&
        result.success &&
        result.conversations
      ) {
        const availableModelIds = new Set(
          models.map((candidate) => candidate.id)
        )

        setConversations(
          result.conversations
            .filter((conversation) =>
              availableModelIds.has(
                conversation.model_id
              )
            )
            .slice(0, 30)
        )
      }
    } catch (refreshError) {
      console.error(
        'Could not refresh conversation list:',
        refreshError
      )
    }
  }

  async function uploadAttachment(
    draft: PendingAttachment,
    file: File
  ) {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      if (!session?.access_token) {
        throw new Error(
          'Your login session has expired. Please log in again.'
        )
      }

      const formData = new FormData()
      formData.append('file', file)

      if (
        draft.mimeType ===
        'application/pdf'
      ) {
        const extractedPdf =
          await extractPdfTextInBrowser(file)

        formData.append(
          'extractedText',
          extractedPdf.text
        )

        formData.append(
          'textTruncated',
          String(
            extractedPdf.textTruncated
          )
        )
      }

      if (conversationId) {
        formData.append(
          'conversationId',
          conversationId
        )
      }

      const response = await fetch(
        UPLOAD_ATTACHMENT_API_URL,
        {
          method: 'POST',
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      )

      let result: AttachmentUploadResponse

      try {
        result =
          (await response.json()) as
            AttachmentUploadResponse
      } catch {
        throw new Error(
          'The upload server returned an invalid response.'
        )
      }

      if (
        !response.ok ||
        !result.success ||
        !result.attachment
      ) {
        throw new Error(
          result.error ||
            'The attachment could not be uploaded.'
        )
      }

      setPendingAttachments(
        (currentAttachments) =>
          currentAttachments.map(
            (attachment) =>
              attachment.localId ===
              draft.localId
                ? {
                    ...attachment,
                    id:
                      result.attachment!.id,
                    fileName:
                      result.attachment!
                        .fileName,
                    mimeType:
                      result.attachment!
                        .mimeType,
                    sizeBytes:
                      result.attachment!
                        .sizeBytes,
                    attachmentType:
                      result.attachment!
                        .attachmentType,
                    status: 'ready',
                    error: undefined,
                  }
                : attachment
          )
      )
    } catch (uploadError) {
      const uploadMessage =
        uploadError instanceof Error
          ? uploadError.message
          : 'The attachment could not be uploaded.'

      setPendingAttachments(
        (currentAttachments) =>
          currentAttachments.map(
            (attachment) =>
              attachment.localId ===
              draft.localId
                ? {
                    ...attachment,
                    status: 'error',
                    error: uploadMessage,
                  }
                : attachment
          )
      )

      setError(uploadMessage)
    }
  }

  function queueAttachmentFiles(
    selectedFiles: File[]
  ) {
    if (selectedFiles.length === 0) {
      return
    }

    const availableSlots =
      MAX_ATTACHMENTS_PER_MESSAGE -
      pendingAttachments.length

    if (availableSlots <= 0) {
      setError(
        `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files to one message.`
      )
      return
    }

    const filesWithinLimit =
      selectedFiles.slice(0, availableSlots)

    const validationErrors: string[] = []

    if (
      selectedFiles.length >
      availableSlots
    ) {
      validationErrors.push(
        `Only ${availableSlots} more ${
          availableSlots === 1
            ? 'file'
            : 'files'
        } can be attached.`
      )
    }

    for (const originalFile of filesWithinLimit) {
      const mimeType =
        resolveAttachmentMimeType(
          originalFile
        )

      const attachmentType =
        getAttachmentType(mimeType)

      if (!attachmentType) {
        validationErrors.push(
          `"${originalFile.name}" is not supported. Use PNG, JPEG, WebP, GIF, PDF, DOCX, TXT, Markdown, CSV, or JSON.`
        )
        continue
      }

      if (
        originalFile.size <= 0 ||
        originalFile.size >
          MAX_ATTACHMENT_SIZE_BYTES
      ) {
        validationErrors.push(
          `"${originalFile.name}" must be smaller than 6 MB.`
        )
        continue
      }

      const file =
        originalFile.type === mimeType
          ? originalFile
          : new File(
              [originalFile],
              originalFile.name,
              {
                type: mimeType,
                lastModified:
                  originalFile.lastModified,
              }
            )

      const previewUrl =
        URL.createObjectURL(file)

      objectPreviewUrlsRef.current.add(
        previewUrl
      )

      const draft: PendingAttachment = {
        id: '',
        localId: crypto.randomUUID(),
        fileName: file.name,
        mimeType,
        sizeBytes: file.size,
        attachmentType,
        previewUrl,
        status: 'uploading',
      }

      setPendingAttachments(
        (currentAttachments) => [
          ...currentAttachments,
          draft,
        ]
      )

      void uploadAttachment(draft, file)
    }

    setError(
      validationErrors[0] ?? null
    )
  }

  function handleAttachmentSelection(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const selectedFiles = Array.from(
      event.target.files ?? []
    )

    event.target.value = ''

    queueAttachmentFiles(selectedFiles)
  }

  function handleComposerPaste(
    event: ClipboardEvent<HTMLTextAreaElement>
  ) {
    const clipboardImages = Array.from(
      event.clipboardData.items
    )
      .filter(
        (item) =>
          item.kind === 'file' &&
          supportedImageMimeTypes.has(
            item.type.trim().toLowerCase()
          )
      )
      .map((item) => item.getAsFile())
      .filter(
        (file): file is File =>
          file !== null
      )

    if (clipboardImages.length === 0) {
      return
    }

    event.preventDefault()

    const timestamp = Date.now()

    const pastedFiles =
      clipboardImages.map((file, index) => {
        const mimeType =
          file.type.trim().toLowerCase()

        const extension =
          getImageExtension(mimeType)

        return new File(
          [file],
          `pasted-image-${timestamp}-${index + 1}.${extension}`,
          {
            type: mimeType,
            lastModified: timestamp,
          }
        )
      })

    queueAttachmentFiles(pastedFiles)
  }

  async function removePendingAttachment(
    attachment: PendingAttachment
  ) {
    if (attachment.status === 'uploading') {
      setError(
        'Wait for the attachment upload to finish before removing it.'
      )
      return
    }

    try {
      if (
        attachment.status === 'ready' &&
        attachment.id
      ) {
        const {
          data: storedAttachment,
          error: lookupError,
        } = await supabase
          .from('chat_attachments')
          .select('storage_path')
          .eq('id', attachment.id)
          .single()

        if (lookupError) {
          throw lookupError
        }

        const storagePath =
          storedAttachment?.storage_path

        if (
          typeof storagePath !== 'string' ||
          !storagePath.trim()
        ) {
          throw new Error(
            'The stored attachment path is invalid.'
          )
        }

        const {
          error: storageDeleteError,
        } = await supabase.storage
          .from('chat-attachments')
          .remove([storagePath])

        if (storageDeleteError) {
          throw storageDeleteError
        }

        const {
          error: databaseDeleteError,
        } = await supabase
          .from('chat_attachments')
          .delete()
          .eq('id', attachment.id)

        if (databaseDeleteError) {
          throw databaseDeleteError
        }
      }

      setPendingAttachments(
        (currentAttachments) =>
          currentAttachments.filter(
            (candidate) =>
              candidate.localId !==
              attachment.localId
          )
      )

      URL.revokeObjectURL(
        attachment.previewUrl
      )

      objectPreviewUrlsRef.current.delete(
        attachment.previewUrl
      )

      setError(null)
    } catch (removeError) {
      console.error(removeError)

      setError(
        removeError instanceof Error
          ? removeError.message
          : 'The attachment could not be removed.'
      )
    }
  }

  function discardPendingAttachments() {
    const attachmentsToDiscard = [
      ...pendingAttachments,
    ]

    setPendingAttachments([])

    for (const attachment of attachmentsToDiscard) {
      if (attachment.status === 'ready') {
        void removePendingAttachment(attachment)
      } else {
        URL.revokeObjectURL(
          attachment.previewUrl
        )

        objectPreviewUrlsRef.current.delete(
          attachment.previewUrl
        )
      }
    }
  }

  async function sendText(
    cleanedMessage: string
  ) {
    const selectedAttachments =
      pendingAttachments.filter(
        (attachment) =>
          attachment.status === 'ready' &&
          attachment.id
      )

    const selectedImageCount =
      selectedAttachments.filter(
        (attachment) =>
          attachment.attachmentType === 'image'
      ).length

    const selectedDocumentCount =
      selectedAttachments.filter(
        (attachment) =>
          attachment.attachmentType === 'document'
      ).length

    const effectiveMessage =
      cleanedMessage ||
      (
        selectedImageCount > 0 &&
        selectedDocumentCount > 0
          ? 'Please analyze the attached files.'
          : selectedDocumentCount === 1
            ? 'Please analyze the attached document.'
            : selectedDocumentCount > 1
              ? 'Please analyze the attached documents.'
              : selectedImageCount === 1
                ? 'Please analyze this image.'
                : selectedImageCount > 1
                  ? 'Please analyze these images.'
                  : ''
      )

    if (
      !effectiveMessage ||
      !activeModel ||
      sending
    ) {
      return
    }

    if (attachmentUploadInProgress) {
      setError(
        'Wait for all attachment uploads to finish before sending.'
      )
      return
    }

    if (!canSendMessages) {
      setError(
        accessMessage ||
          'Chat access is currently unavailable.'
      )
      return
    }

    /*
     * Capture the selected model before the asynchronous request
     * begins. The model selector is disabled while streaming, but
     * this stable reference also keeps TypeScript and navigation
     * behavior deterministic.
     */
    const selectedModel = activeModel
    const selectedResponseMode =
      responseMode
    const selectedReasoningEffort =
      reasoningEffort
    const assistantMessageId = crypto.randomUUID()
    const generationAbortController =
      new AbortController()

    generationAbortControllerRef.current =
      generationAbortController
    generationStoppedRef.current = false

    let assistantStarted = false
    let pendingStreamSources:
      SearchSource[] = []

    setError(null)
    setSending(true)
    setStreamingMessageId(null)
    setMessage('')

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: effectiveMessage,
      attachments:
        selectedAttachments.length > 0
          ? selectedAttachments.map(
              (attachment) => ({
                id: attachment.id,
                fileName:
                  attachment.fileName,
                mimeType:
                  attachment.mimeType,
                sizeBytes:
                  attachment.sizeBytes,
                attachmentType:
                  attachment.attachmentType,
                previewUrl:
                  attachment.previewUrl,
              })
            )
          : undefined,
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ])

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      if (!session?.access_token) {
        throw new Error(
          'Your login session has expired. Please log in again.'
        )
      }

      const response = await fetch(
        CHAT_STREAM_API_URL,
        {
          method: 'POST',
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            Accept:
              'application/x-ndjson, application/json',
          },
          body: JSON.stringify({
            modelId: selectedModel.id,
            message: effectiveMessage,
            conversationId,
            attachmentIds:
              selectedAttachments.map(
                (attachment) => attachment.id
              ),
            responseMode:
              selectedResponseMode,
            reasoningEffort:
              selectedReasoningEffort,
          }),
          signal:
            generationAbortController.signal,
        }
      )

      if (!response.ok) {
        const responseText =
          await response.text()

        let responseError =
          'The Claude request failed.'

        try {
          const result =
            JSON.parse(
              responseText
            ) as ChatErrorResponse

          if (result.error?.trim()) {
            responseError = result.error.trim()
          }
        } catch {
          if (responseText.trim()) {
            responseError = responseText.trim()
          }
        }

        throw new Error(responseError)
      }

      if (!response.body) {
        throw new Error(
          'The server did not return a response stream.'
        )
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      let buffer = ''

      const streamResult: {
        completion:
          | ChatStreamCompleteEvent
          | null
      } = {
        completion: null,
      }

      function applyStreamEvent(
        event: ChatStreamEvent
      ) {
        if (event.type === 'sources') {
          pendingStreamSources =
            normalizeSearchSources(
              event.sources
            )

          if (assistantStarted) {
            setMessages(
              (currentMessages) =>
                currentMessages.map(
                  (chatMessage) =>
                    chatMessage.id ===
                    assistantMessageId
                      ? {
                          ...chatMessage,
                          responseMode:
                            normalizeResponseMode(
                              event.responseMode
                            ),
                          sources:
                            pendingStreamSources,
                        }
                      : chatMessage
                )
            )
          }

          return
        }

        if (event.type === 'delta') {
          if (!event.delta) {
            return
          }

          if (!assistantStarted) {
            assistantStarted = true

            setStreamingMessageId(
              assistantMessageId
            )

            setMessages((currentMessages) => [
              ...currentMessages,
              {
                id: assistantMessageId,
                role: 'assistant',
                content: event.delta,
                responseMode:
                  selectedResponseMode,
                sources:
                  pendingStreamSources,
              },
            ])

            return
          }

          setMessages((currentMessages) =>
            currentMessages.map(
              (chatMessage) =>
                chatMessage.id ===
                assistantMessageId
                  ? {
                      ...chatMessage,
                      content:
                        chatMessage.content +
                        event.delta,
                    }
                  : chatMessage
            )
          )

          return
        }

        if (event.type === 'complete') {
          streamResult.completion = event

          const completedSources =
            normalizeSearchSources(
              event.sources
            )

          setMessages(
            (currentMessages) =>
              currentMessages.map(
                (chatMessage) =>
                  chatMessage.id ===
                  assistantMessageId
                    ? {
                        ...chatMessage,
                        responseMode:
                          normalizeResponseMode(
                            event.responseMode
                          ),
                        sources:
                          completedSources,
                      }
                    : chatMessage
              )
          )

          return
        }

        if (event.type === 'error') {
          throw new Error(
            event.error ||
              'Claude could not complete the response.'
          )
        }
      }

      function processLine(rawLine: string) {
        const line = rawLine.trim()

        if (!line) {
          return
        }

        let event: ChatStreamEvent

        try {
          event =
            JSON.parse(line) as ChatStreamEvent
        } catch {
          throw new Error(
            'The server returned an invalid streaming event.'
          )
        }

        applyStreamEvent(event)
      }

      try {
        while (true) {
          const { value, done } =
            await reader.read()

          if (done) {
            buffer += decoder.decode()
            break
          }

          buffer += decoder.decode(value, {
            stream: true,
          })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            processLine(line)
          }
        }

        if (buffer.trim()) {
          processLine(buffer)
        }
      } finally {
        reader.releaseLock()
      }

      const completion =
        streamResult.completion

      if (!completion) {
        throw new Error(
          'The response stream ended before completion.'
        )
      }

      if (!assistantStarted) {
        throw new Error(
          'Claude returned an empty response.'
        )
      }

      const returnedConversationId =
        completion.conversationId?.trim()

      if (!returnedConversationId) {
        throw new Error(
          'The server did not return a valid conversation ID.'
        )
      }

      loadedConversationIdRef.current =
        returnedConversationId

      setConversationId(returnedConversationId)

      if (!conversationTitle) {
        setConversationTitle(
          effectiveMessage.slice(0, 100)
        )
      }

      setCreditsRemaining(
        completion.creditsRemaining
      )

      if (completion.creditsRemaining <= 0) {
        setSubscriptionStatus('inactive')
      }

      setLastCreditsUsed(
        completion.creditsUsed
      )

      setStreamingMessageId(null)
      setPendingAttachments([])

      navigate(
        `/chat/${selectedModel.id}?conversation=${returnedConversationId}`,
        { replace: true }
      )

      await refreshConversationList(
        session.access_token
      )
    } catch (err) {
      const generationWasStopped =
        generationStoppedRef.current ||
        (
          err instanceof DOMException &&
          err.name === 'AbortError'
        )

      if (generationWasStopped) {
        setError(null)

        /*
         * Keep partial streamed text visible. When generation was
         * stopped before Claude produced any text, remove the
         * optimistic user message and restore the prompt.
         */
        if (!assistantStarted) {
          setMessages((currentMessages) =>
            currentMessages.filter(
              (chatMessage) =>
                chatMessage.id !== userMessage.id
            )
          )

          setMessage(cleanedMessage)
        }

        return
      }

      console.error(err)

      const errorMessage =
        err instanceof Error
          ? err.message
          : 'Could not send the message.'

      setError(errorMessage)

      /*
       * Keep partial streamed text visible. When generation never
       * started, remove the optimistic user message so the same
       * uploaded images can be retried from the composer.
       */
      if (!assistantStarted) {
        setMessages((currentMessages) =>
          currentMessages.filter(
            (chatMessage) =>
              chatMessage.id !== userMessage.id
          )
        )

        setMessage(cleanedMessage)
      }
    } finally {
      if (
        generationAbortControllerRef.current ===
        generationAbortController
      ) {
        generationAbortControllerRef.current = null
      }

      generationStoppedRef.current = false
      setStreamingMessageId(null)
      setSending(false)
    }
  }

  function stopGeneration() {
    if (!sending) {
      return
    }

    generationStoppedRef.current = true
    generationAbortControllerRef.current?.abort()
  }

  function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    void sendText(message.trim())
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLTextAreaElement>
  ) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey
    ) {
      event.preventDefault()
      sendMessage()
    }
  }

  function startNewChat(
    selectedModelId = activeModel?.id
  ) {
    if (!selectedModelId) {
      return
    }

    if (attachmentUploadInProgress) {
      setError(
        'Wait for the attachment upload to finish before starting a new chat.'
      )
      return
    }

    discardPendingAttachments()

    pendingPromptRef.current = null
    loadedConversationIdRef.current = null

    sessionStorage.removeItem(
      'claude_pending_prompt'
    )

    setMessages([])
    setMessage('')
    setConversationId(null)
    setConversationTitle(null)
    setError(null)
    setLastCreditsUsed(null)
    setSidebarOpen(false)
    setActiveModelId(selectedModelId)

    navigate(`/chat/${selectedModelId}`)
  }

  function changeModel(nextModelId: string) {
    const nextModel = models.find(
      (candidate) =>
        candidate.id === nextModelId
    )

    if (!nextModel || nextModel.id === activeModelId) {
      return
    }

    setActiveModelId(nextModel.id)

    const conversationQuery = conversationId
      ? `?conversation=${conversationId}`
      : ''

    navigate(
      `/chat/${nextModel.id}${conversationQuery}`,
      { replace: true }
    )
  }

  function openConversation(
    conversation: HistoryConversation
  ) {
    if (attachmentUploadInProgress) {
      setError(
        'Wait for the attachment upload to finish before opening another conversation.'
      )
      return
    }

    discardPendingAttachments()
    loadedConversationIdRef.current = null
    setSidebarOpen(false)

    navigate(
      `/chat/${conversation.model_id}?conversation=${conversation.id}`
    )
  }

  async function deleteConversation(
    conversation: HistoryConversation
  ) {
    if (
      deletingConversationId ||
      sending ||
      attachmentUploadInProgress
    ) {
      return
    }

    const title =
      conversation.title?.trim() ||
      'Untitled conversation'

    const confirmed = window.confirm(
      `Delete "${title}"?\n\nThis permanently removes the conversation, its messages, and its attachments.`
    )

    if (!confirmed) {
      return
    }

    try {
      setError(null)
      setDeletingConversationId(conversation.id)

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession()

      if (sessionError) {
        throw sessionError
      }

      if (!session?.access_token) {
        throw new Error(
          'Your login session has expired.'
        )
      }

      const response = await fetch(
        HISTORY_API_URL,
        {
          method: 'DELETE',
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            conversationId: conversation.id,
          }),
        }
      )

      let result: HistoryApiResponse

      try {
        result =
          (await response.json()) as
            HistoryApiResponse
      } catch {
        throw new Error(
          'The history server returned an invalid response.'
        )
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
            'Could not delete the conversation.'
        )
      }

      setConversations((current) =>
        current.filter(
          (item) =>
            item.id !== conversation.id
        )
      )

      if (conversation.id === conversationId) {
        startNewChat(
          activeModelId ||
            conversation.model_id
        )
      }
    } catch (deleteError) {
      console.error(deleteError)

      setError(
        deleteError instanceof Error
          ? deleteError.message
          : 'Could not delete the conversation.'
      )
    } finally {
      setDeletingConversationId(null)
    }
  }

  async function copyMessage(
    chatMessage: ChatMessage
  ) {
    try {
      await navigator.clipboard.writeText(
        chatMessage.content
      )

      setCopiedMessageId(chatMessage.id)

      window.setTimeout(() => {
        setCopiedMessageId((currentId) =>
          currentId === chatMessage.id
            ? null
            : currentId
        )
      }, 1500)
    } catch {
      setError(
        'Could not copy the response.'
      )
    }
  }

  async function handleSignOut() {
    try {
      setSigningOut(true)
      await supabase.auth.signOut()
      navigate('/login', { replace: true })
    } finally {
      setSigningOut(false)
    }
  }

  const selectedModelName =
    activeModel?.name.replace(
      /^Claude\s+/i,
      ''
    ) || 'Claude'

  const pageTitle =
    conversationTitle?.trim() ||
    (messages.length > 0
      ? 'Claude conversation'
      : 'New chat')

  const sidebar = (
    <div className="flex h-full flex-col bg-[#20201e] px-3 py-3">
      <div className="flex items-center justify-between px-1 py-1">
        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="text-[24px] leading-none text-[#f1eee8]"
          style={{
            fontFamily:
              'Georgia, Cambria, Times New Roman, serif',
          }}
        >
          Claude
        </button>

        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="rounded-lg p-2 text-[#d5cfc6] hover:bg-[#2b2b29] lg:hidden"
          aria-label="Close sidebar"
        >
          <Icon name="close" />
        </button>
      </div>

      <nav className="mt-4 space-y-1">
        <SidebarItem
          label="New chat"
          icon={<Icon name="plus" />}
          onClick={() => startNewChat()}
        />

        <SidebarItem
          label="Chats"
          icon={<Icon name="chat" />}
          active
        />

        <SidebarItem
          label="Projects"
          icon={<Icon name="folder" />}
          disabled
          badge="Next"
        />

        <SidebarItem
          label="Artifacts"
          icon={<Icon name="artifact" />}
          disabled
          badge="Next"
        />

        <SidebarItem
          label="Code"
          icon={<Icon name="code" />}
          disabled
          badge="Next"
        />

        <SidebarItem
          label="Customize"
          icon={<Icon name="sliders" />}
          disabled
          badge="Next"
        />
      </nav>

      <div className="mt-5 px-3 text-[11px] font-medium uppercase tracking-[0.12em] text-[#827d75]">
        Products
      </div>

      <div className="mt-1">
        <SidebarItem
          label="Design"
          icon={<Icon name="palette" />}
          disabled
          badge="Next"
        />
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#827d75]">
            Recents
          </p>

          <span className="text-[11px] text-[#777169]">
            {conversations.length}
          </span>
        </div>

        <div className="mt-2 min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
          {bootstrapLoading && (
            <div className="space-y-2 px-3 py-2">
              <div className="h-3 w-4/5 animate-pulse rounded bg-[#2f2f2c]" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-[#2b2b29]" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-[#2b2b29]" />
            </div>
          )}

          {!bootstrapLoading &&
            conversations.length === 0 && (
              <p className="px-3 py-3 text-xs leading-5 text-[#827d75]">
                Your conversations will appear here.
              </p>
            )}

          {!bootstrapLoading &&
            conversations.map((conversation) => {
              const isDeleting =
                deletingConversationId ===
                conversation.id

              return (
                <div
                  key={conversation.id}
                  className={[
                    'group flex items-center rounded-lg transition hover:bg-[#2b2b29]',
                    conversation.id === conversationId
                      ? 'bg-[#2b2b29]'
                      : '',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() =>
                      openConversation(conversation)
                    }
                    disabled={isDeleting}
                    className="min-w-0 flex-1 px-3 py-2 text-left disabled:cursor-wait disabled:opacity-55"
                  >
                    <p className="truncate text-sm text-[#ddd7ce]">
                      {conversation.title ||
                        'Untitled conversation'}
                    </p>

                    <p className="mt-1 text-[10px] text-[#817b73]">
                      {formatConversationDate(
                        conversation.created_at
                      )}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void deleteConversation(
                        conversation
                      )
                    }
                    disabled={
                      deletingConversationId !== null ||
                      sending ||
                      attachmentUploadInProgress
                    }
                    className="mr-2 rounded-md p-1.5 text-[#8c857d] opacity-70 transition hover:bg-red-950/40 hover:text-red-300 hover:opacity-100 focus:opacity-100 disabled:cursor-wait disabled:opacity-40"
                    aria-label={`Delete ${
                      conversation.title ||
                      'untitled conversation'
                    }`}
                    title="Delete conversation"
                  >
                    {isDeleting ? (
                      <span
                        className="block h-4 w-4 text-center text-xs leading-4"
                        aria-hidden="true"
                      >
                        …
                      </span>
                    ) : (
                      <Icon
                        name="trash"
                        className="h-4 w-4"
                      />
                    )}
                  </button>
                </div>
              )
            })}
        </div>
      </div>

      <div className="mt-3 border-t border-[#33322f] pt-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e5ded3] text-xs font-semibold text-[#2a2926]">
            {profile
              ? getInitials(profile.full_name)
              : 'U'}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[#eee9e1]">
              {profile?.full_name || 'Loading...'}
            </p>

            <p className="truncate text-[11px] text-[#8f8981]">
              {(creditsRemaining ?? 0).toLocaleString()}{' '}
              credits
            </p>
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="rounded-lg p-2 text-[#8f8981] transition hover:bg-[#2b2b29] hover:text-[#eee9e1] disabled:opacity-50"
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon
              name="logout"
              className="h-4 w-4"
            />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#1f1f1d] text-[#eee9e1]">
      <div className="min-h-screen lg:grid lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="hidden min-h-screen border-r border-[#33322f] lg:block">
          <div className="fixed inset-y-0 w-[288px]">
            {sidebar}
          </div>
        </aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/60"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close sidebar"
            />

            <aside className="relative h-full w-[288px] border-r border-[#33322f]">
              {sidebar}
            </aside>
          </div>
        )}

        <main className="relative flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 border-b border-[#30302d] bg-[#1f1f1d]/95 backdrop-blur">
            <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="rounded-lg p-2 text-[#cfc8bf] hover:bg-[#2b2b29] lg:hidden"
                  aria-label="Open sidebar"
                >
                  <Icon name="menu" />
                </button>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#e9e4dc]">
                    {pageTitle}
                  </p>

                  <p className="truncate text-[11px] text-[#7f7971]">
                    Claude {selectedModelName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden text-xs text-[#8e877f] sm:inline">
                  {(creditsRemaining ?? 0).toLocaleString()}{' '}
                  credits
                </span>

                <button
                  type="button"
                  onClick={() => startNewChat()}
                  disabled={
                    bootstrapLoading ||
                    !activeModel
                  }
                  className="rounded-lg border border-[#3b3a37] bg-[#292927] px-3 py-2 text-xs font-medium text-[#e9e4dc] transition hover:bg-[#333330] disabled:opacity-45"
                >
                  New chat
                </button>
              </div>
            </div>
          </header>

          <section className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[760px] px-5 pb-48 pt-10 sm:px-8">
              {bootstrapLoading && (
                <div className="space-y-8 py-8">
                  <div className="flex justify-end">
                    <div className="h-16 w-2/3 animate-pulse rounded-[20px] bg-[#292927]" />
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="h-7 w-7 animate-pulse rounded-full bg-[#302c28]" />

                    <div className="flex-1 space-y-3">
                      <div className="h-3 w-full animate-pulse rounded bg-[#292927]" />
                      <div className="h-3 w-5/6 animate-pulse rounded bg-[#292927]" />
                      <div className="h-3 w-2/3 animate-pulse rounded bg-[#292927]" />
                    </div>
                  </div>
                </div>
              )}

              {!bootstrapLoading &&
                conversationLoading && (
                  <div className="space-y-8 py-8">
                    <div className="flex justify-end">
                      <div className="h-14 w-1/2 animate-pulse rounded-[20px] bg-[#292927]" />
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="h-7 w-7 animate-pulse rounded-full bg-[#302c28]" />

                      <div className="flex-1 space-y-3">
                        <div className="h-3 w-full animate-pulse rounded bg-[#292927]" />
                        <div className="h-3 w-4/5 animate-pulse rounded bg-[#292927]" />
                      </div>
                    </div>
                  </div>
                )}

              {!bootstrapLoading &&
                !conversationLoading &&
                messages.length === 0 &&
                !sending && (
                  <div className="flex min-h-[54vh] flex-col items-center justify-center text-center">
                    <div className="text-[#df6b45]">
                      <Icon
                        name="spark"
                        className="h-10 w-10"
                      />
                    </div>

                    <h1
                      className="mt-5 text-4xl text-[#e5ded3]"
                      style={{
                        fontFamily:
                          'Georgia, Cambria, Times New Roman, serif',
                      }}
                    >
                      Start a conversation
                    </h1>

                    <p className="mt-3 max-w-md text-sm leading-6 text-[#8c857d]">
                      Ask Claude to write, analyze,
                      explain, plan, or help with code.
                    </p>
                  </div>
                )}

              {!bootstrapLoading &&
                !conversationLoading && (
                  <div className="space-y-9">
                    {messages.map((chatMessage) => (
                      <article
                        key={chatMessage.id}
                        className={
                          chatMessage.role === 'user'
                            ? 'flex justify-end'
                            : 'flex items-start gap-3'
                        }
                      >
                        {chatMessage.role ===
                          'assistant' && (
                          <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center text-[#df6b45]">
                            <Icon
                              name="spark"
                              className="h-6 w-6"
                            />
                          </div>
                        )}

                        <div
                          className={
                            chatMessage.role === 'user'
                              ? 'max-w-[86%] rounded-[20px] bg-[#2c2c29] px-5 py-3.5 text-[#eee9e1]'
                              : 'min-w-0 flex-1'
                          }
                        >
                          {chatMessage.attachments &&
                            chatMessage.attachments
                              .length > 0 && (
                              <div className="mb-3 grid max-w-[560px] grid-cols-1 gap-2 sm:grid-cols-2">
                                {chatMessage.attachments.map(
                                  (attachment) =>
                                    attachment.attachmentType ===
                                    'image' ? (
                                      <div
                                        key={
                                          attachment.id
                                        }
                                        className="overflow-hidden rounded-xl border border-[#44423e] bg-[#242422]"
                                      >
                                        {attachment.previewUrl ? (
                                          <img
                                            src={
                                              attachment.previewUrl
                                            }
                                            alt={
                                              attachment.fileName
                                            }
                                            className="h-36 w-full object-cover"
                                          />
                                        ) : (
                                          <div className="flex h-36 items-center justify-center px-3 text-center text-xs text-[#8f8981]">
                                            {
                                              attachment.fileName
                                            }
                                          </div>
                                        )}

                                        <div className="truncate px-3 py-2 text-[11px] text-[#aaa49c]">
                                          {
                                            attachment.fileName
                                          }
                                        </div>
                                      </div>
                                    ) : (
                                      <a
                                        key={
                                          attachment.id
                                        }
                                        href={
                                          attachment.previewUrl ||
                                          undefined
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                        className={[
                                          'flex min-w-0 items-center gap-3 rounded-xl border border-[#44423e] bg-[#242422] px-3 py-3 text-left',
                                          attachment.previewUrl
                                            ? 'transition hover:bg-[#2b2b28]'
                                            : 'cursor-default',
                                        ].join(' ')}
                                        onClick={(event) => {
                                          if (
                                            !attachment.previewUrl
                                          ) {
                                            event.preventDefault()
                                          }
                                        }}
                                      >
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#302f2c] text-[#d8d2c9]">
                                          <Icon
                                            name="file"
                                            className="h-5 w-5"
                                          />
                                        </span>

                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-sm text-[#e7e1d8]">
                                            {
                                              attachment.fileName
                                            }
                                          </span>

                                          <span className="mt-1 block text-[10px] uppercase tracking-[0.08em] text-[#817b73]">
                                            {getDocumentLabel(
                                              attachment.fileName
                                            )}{' '}
                                            ·{' '}
                                            {formatFileSize(
                                              attachment.sizeBytes
                                            )}
                                          </span>
                                        </span>
                                      </a>
                                    )
                                )}
                              </div>
                            )}

                          <div
                            aria-live={
                              chatMessage.id ===
                              streamingMessageId
                                ? 'polite'
                                : undefined
                            }
                          >
                            {chatMessage.role ===
                            'assistant' ? (
                              <>
                                {chatMessage.responseMode &&
                                  chatMessage.responseMode !==
                                    'chat' && (
                                  <div className="mb-2 inline-flex rounded-full border border-[#4a4741] bg-[#292927] px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[#bdb6ad]">
                                    {getResponseModeLabel(
                                      chatMessage.responseMode
                                    )}
                                  </div>
                                )}

                                <MarkdownMessage
                                  content={
                                    chatMessage.content
                                  }
                                  sources={
                                    chatMessage.sources
                                  }
                                />

                                <SourceList
                                  sources={
                                    chatMessage.sources ??
                                    []
                                  }
                                />
                              </>
                            ) : (
                              <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e1d8]">
                                {
                                  chatMessage.content
                                }
                              </div>
                            )}

                            {chatMessage.id ===
                              streamingMessageId && (
                              <span
                                className="mt-1 inline-block animate-pulse text-[#df6b45]"
                                aria-hidden="true"
                              >
                                ▍
                              </span>
                            )}
                          </div>

                          {chatMessage.role ===
                            'assistant' &&
                            chatMessage.id !==
                              streamingMessageId && (
                            <div className="mt-3 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  void copyMessage(
                                    chatMessage
                                  )
                                }
                                className="rounded-lg p-2 text-[#807a72] transition hover:bg-[#2b2b29] hover:text-[#cfc8bf]"
                                title="Copy response"
                                aria-label="Copy response"
                              >
                                <Icon
                                  name={
                                    copiedMessageId ===
                                    chatMessage.id
                                      ? 'check'
                                      : 'copy'
                                  }
                                  className="h-4 w-4"
                                />
                              </button>
                            </div>
                          )}
                        </div>
                      </article>
                    ))}

                    {sending &&
                      streamingMessageId === null && (
                      <div className="flex items-start gap-3">
                        <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center text-[#df6b45]">
                          <Icon
                            name="spark"
                            className="h-6 w-6"
                          />
                        </div>

                        <div className="pt-1 text-sm text-[#8f8981]">
                          Claude {selectedModelName} is{' '}
                          {responseMode === 'research'
                            ? 'researching'
                            : responseMode ===
                                'web_search'
                              ? 'searching the web'
                              : 'thinking'}
                          <span className="animate-pulse">
                            ...
                          </span>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                )}
            </div>
          </section>

          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[#1f1f1d] via-[#1f1f1d] to-transparent pb-4 pt-14 lg:left-[288px]">
            <div className="pointer-events-auto mx-auto w-full max-w-[780px] px-4 sm:px-6">
              {error && (
                <div className="mb-3 rounded-xl border border-red-900/60 bg-red-950/35 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {accessMessage && (
                <div className="mb-3 rounded-xl border border-amber-900/50 bg-amber-950/25 px-4 py-3 text-sm text-amber-200">
                  {accessMessage}
                </div>
              )}

              <form
                onSubmit={sendMessage}
                className="rounded-[22px] border border-[#3a3936] bg-[#2a2a28] p-3 shadow-[0_18px_55px_rgba(0,0,0,0.32)]"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,text/csv,application/json,.pdf,.docx,.txt,.md,.markdown,.csv,.json"
                  multiple
                  className="hidden"
                  onChange={
                    handleAttachmentSelection
                  }
                />

                {pendingAttachments.length > 0 && (
                  <div className="mb-3 grid grid-cols-2 gap-2 px-1 sm:grid-cols-4">
                    {pendingAttachments.map(
                      (attachment) => (
                        <div
                          key={attachment.localId}
                          className="relative overflow-hidden rounded-xl border border-[#44423e] bg-[#232321]"
                        >
                          {attachment.attachmentType ===
                          'image' ? (
                            <img
                              src={attachment.previewUrl}
                              alt={attachment.fileName}
                              className="h-24 w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-24 items-center justify-center bg-[#292927] text-[#d8d2c9]">
                              <div className="text-center">
                                <Icon
                                  name="file"
                                  className="mx-auto h-7 w-7"
                                />

                                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9a948c]">
                                  {getDocumentLabel(
                                    attachment.fileName
                                  )}
                                </p>
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() =>
                              void removePendingAttachment(
                                attachment
                              )
                            }
                            disabled={
                              attachment.status ===
                              'uploading'
                            }
                            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-sm text-white transition hover:bg-black disabled:cursor-wait disabled:opacity-50"
                            aria-label={`Remove ${attachment.fileName}`}
                            title={`Remove ${attachment.fileName}`}
                          >
                            ×
                          </button>

                          <div className="px-2 py-2">
                            <p className="truncate text-[11px] text-[#d9d3ca]">
                              {attachment.fileName}
                            </p>

                            <p
                              className={[
                                'mt-1 truncate text-[10px]',
                                attachment.status ===
                                'error'
                                  ? 'text-red-300'
                                  : 'text-[#817b73]',
                              ].join(' ')}
                              title={
                                attachment.error
                              }
                            >
                              {attachment.status ===
                              'uploading'
                                ? attachment.attachmentType ===
                                  'document'
                                  ? 'Extracting text...'
                                  : 'Uploading...'
                                : attachment.status ===
                                    'error'
                                  ? attachment.error ||
                                    'Upload failed'
                                  : formatFileSize(
                                      attachment.sizeBytes
                                    )}
                            </p>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                <textarea
                  value={message}
                  onChange={(event) =>
                    setMessage(event.target.value)
                  }
                  onKeyDown={handleKeyDown}
                  onPaste={handleComposerPaste}
                  placeholder={
                    pendingAttachments.length > 0
                      ? 'Ask Claude about the attached files...'
                      : responseMode === 'research'
                        ? 'Ask Claude to research a topic...'
                        : responseMode === 'web_search'
                          ? 'Ask Claude to search the web...'
                          : `Message Claude ${selectedModelName}...`
                  }
                  rows={2}
                  maxLength={10000}
                  disabled={
                    sending ||
                    bootstrapLoading ||
                    conversationLoading ||
                    !canSendMessages
                  }
                  className="max-h-48 min-h-[54px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-6 text-[#eee9e1] outline-none placeholder:text-[#8b857d] disabled:cursor-not-allowed disabled:opacity-60"
                />

                <div className="mt-2 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      fileInputRef.current?.click()
                    }
                    disabled={
                      sending ||
                      bootstrapLoading ||
                      conversationLoading ||
                      !canSendMessages ||
                      pendingAttachments.length >=
                        MAX_ATTACHMENTS_PER_MESSAGE
                    }
                    title="Attach files"
                    className="rounded-lg p-2 text-[#d8d2c9] transition hover:bg-[#363633] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Attach files"
                  >
                    <Icon name="plus" />
                  </button>

                  <div className="flex min-w-0 items-center gap-1">
                    <select
                      value={activeModelId}
                      onChange={(event) =>
                        changeModel(
                          event.target.value
                        )
                      }
                      disabled={
                        sending ||
                        bootstrapLoading ||
                        models.length === 0
                      }
                      className="max-w-[190px] cursor-pointer appearance-none bg-transparent px-2 py-2 text-right text-sm font-semibold text-[#eee9e1] outline-none disabled:opacity-50"
                      aria-label="Claude model"
                    >
                      {models.map(
                        (candidate) => (
                          <option
                            key={candidate.id}
                            value={candidate.id}
                            className="bg-[#2a2a28] text-[#eee9e1]"
                          >
                            {candidate.name.replace(
                              /^Claude\s+/i,
                              ''
                            )}
                          </option>
                        )
                      )}
                    </select>

                    <select
                      value={responseMode}
                      onChange={(event) =>
                        setResponseMode(
                          normalizeResponseMode(
                            event.target.value
                          )
                        )
                      }
                      disabled={
                        sending ||
                        bootstrapLoading ||
                        conversationLoading ||
                        !canSendMessages
                      }
                      title="Response mode"
                      aria-label="Response mode"
                      className="max-w-[125px] cursor-pointer appearance-none rounded-lg bg-[#333330] px-2.5 py-2 text-xs font-medium text-[#d8d2c9] outline-none transition hover:bg-[#3a3935] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option
                        value="chat"
                        className="bg-[#2a2a28]"
                      >
                        Chat
                      </option>
                      <option
                        value="web_search"
                        className="bg-[#2a2a28]"
                      >
                        Web Search
                      </option>
                      <option
                        value="research"
                        className="bg-[#2a2a28]"
                      >
                        Research
                      </option>
                    </select>

                    <select
                      value={reasoningEffort}
                      onChange={(event) => {
                        const nextReasoningEffort =
                          normalizeReasoningEffort(
                            event.target.value
                          )

                        setReasoningEffort(
                          nextReasoningEffort
                        )
                        storeReasoningEffort(
                          nextReasoningEffort
                        )
                      }}
                      disabled={
                        sending ||
                        bootstrapLoading ||
                        conversationLoading ||
                        !canSendMessages
                      }
                      title="Reasoning effort"
                      aria-label="Reasoning effort"
                      className="max-w-[105px] cursor-pointer appearance-none rounded-lg bg-[#333330] px-2.5 py-2 text-xs font-medium text-[#d8d2c9] outline-none transition hover:bg-[#3a3935] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option
                        value="low"
                        className="bg-[#2a2a28]"
                      >
                        Low
                      </option>
                      <option
                        value="medium"
                        className="bg-[#2a2a28]"
                      >
                        Medium
                      </option>
                      <option
                        value="high"
                        className="bg-[#2a2a28]"
                      >
                        High
                      </option>
                    </select>

                    <button
                      type="button"
                      disabled
                      title="Voice input is coming later"
                      className="rounded-lg p-2 text-[#aaa49c] opacity-50"
                    >
                      <Icon name="mic" />
                    </button>

                    {sending ? (
                      <button
                        type="button"
                        onClick={stopGeneration}
                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#eee9e1] text-[#272624] transition hover:bg-white"
                        aria-label="Stop generating"
                        title="Stop generating"
                      >
                        <span className="h-3 w-3 rounded-[2px] bg-[#272624]" />
                      </button>
                    ) : message.trim() ||
                    readyAttachments.length > 0 ? (
                      <button
                        type="submit"
                        disabled={
                          !canSubmitMessage
                        }
                        className="rounded-full bg-[#eee9e1] p-2 text-[#272624] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                        aria-label="Send message"
                      >
                        <Icon
                          name="send"
                          className="h-4 w-4"
                        />
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="Voice conversation is coming later"
                        className="rounded-lg p-2 text-[#aaa49c] opacity-50"
                      >
                        <Icon name="wave" />
                      </button>
                    )}
                  </div>
                </div>
              </form>

              <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-[#66615b]">
                <span>
                  Claude can make mistakes. Review
                  important information.
                </span>

                {lastCreditsUsed !== null && (
                  <>
                    <span>·</span>
                    <span>
                      Last response used{' '}
                      {lastCreditsUsed}{' '}
                      {lastCreditsUsed === 1
                        ? 'credit'
                        : 'credits'}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

export default Chat