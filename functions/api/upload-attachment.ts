import { createClient } from '@supabase/supabase-js'
import { unzipSync, strFromU8 } from 'fflate'

type Environment = {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
}

type AttachmentType = 'image' | 'document'

type ExtractionStatus =
  | 'not_required'
  | 'pending'
  | 'ready'
  | 'failed'

type ExtractedDocument = {
  text: string
  extractedCharacters: number
  textTruncated: boolean
}

type UploadedAttachment = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  attachmentType: AttachmentType
  conversationId: string | null
  status: 'pending'
  extractionStatus: ExtractionStatus
  extractedCharacters: number
  textTruncated: boolean
}

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

const BUCKET_NAME = 'chat-attachments'

const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024
const MAX_EXTRACTED_CHARACTERS = 80_000
const MAX_PDF_PAGES = 100
const MAX_DOCX_XML_BYTES = 12 * 1024 * 1024

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://ai-tools-portal-9h5.pages.dev',
]

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

const docxTextEntryNames = new Set([
  'word/document.xml',
  'word/footnotes.xml',
  'word/endnotes.xml',
])

function requireEnv(
  value: string | undefined,
  variableName: string
): string {
  const cleanedValue = value?.trim()

  if (!cleanedValue) {
    throw new Error(
      `${variableName} is missing from the Cloudflare environment.`
    )
  }

  return cleanedValue
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

function getCorsHeaders(
  request: Request
): Record<string, string> {
  const origin = request.headers.get('Origin')

  const allowedOrigin =
    origin && allowedOrigins.includes(origin)
      ? origin
      : 'https://ai-tools-portal-9h5.pages.dev'

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}

function jsonResponse(
  request: Request,
  body: unknown,
  status = 200
): Response {
  return Response.json(body, {
    status,
    headers: getCorsHeaders(request),
  })
}

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '_')
    .trim()

  const safeName = trimmed
    .replace(/[^a-zA-Z0-9._()\- ]+/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .slice(0, 160)

  return safeName || 'attachment'
}

function getFileExtension(fileName: string): string {
  const normalizedName = fileName
    .trim()
    .toLowerCase()

  const lastDot = normalizedName.lastIndexOf('.')

  if (lastDot < 0) {
    return ''
  }

  return normalizedName.slice(lastDot)
}

function resolveMimeType(file: File): string {
  const suppliedMimeType = file.type
    .trim()
    .toLowerCase()

  const inferredMimeType =
    extensionMimeTypes[
      getFileExtension(file.name)
    ]

  if (
    !suppliedMimeType ||
    suppliedMimeType ===
      'application/octet-stream'
  ) {
    return inferredMimeType ?? ''
  }

  return suppliedMimeType
}

function getAttachmentType(
  mimeType: string
): AttachmentType {
  return supportedImageMimeTypes.has(mimeType)
    ? 'image'
    : 'document'
}

function getBearerToken(
  request: Request
): string | null {
  const authorization =
    request.headers.get('Authorization')

  if (
    !authorization ||
    !authorization.startsWith('Bearer ')
  ) {
    return null
  }

  return authorization
    .slice('Bearer '.length)
    .trim() || null
}

function startsWithBytes(
  bytes: Uint8Array,
  expected: number[],
  offset = 0
): boolean {
  if (
    offset < 0 ||
    bytes.length < offset + expected.length
  ) {
    return false
  }

  for (
    let index = 0;
    index < expected.length;
    index += 1
  ) {
    if (
      bytes[offset + index] !== expected[index]
    ) {
      return false
    }
  }

  return true
}

function bytesToAscii(
  bytes: Uint8Array,
  start: number,
  end: number
): string {
  let value = ''

  const safeEnd = Math.min(
    end,
    bytes.length
  )

  for (
    let index = start;
    index < safeEnd;
    index += 1
  ) {
    value += String.fromCharCode(bytes[index])
  }

  return value
}

function validateImageSignature(
  bytes: Uint8Array,
  mimeType: string
) {
  let valid = false

  switch (mimeType) {
    case 'image/png':
      valid = startsWithBytes(bytes, [
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ])
      break

    case 'image/jpeg':
      valid = startsWithBytes(bytes, [
        0xff,
        0xd8,
        0xff,
      ])
      break

    case 'image/gif': {
      const signature =
        bytesToAscii(bytes, 0, 6)

      valid =
        signature === 'GIF87a' ||
        signature === 'GIF89a'
      break
    }

    case 'image/webp':
      valid =
        bytesToAscii(bytes, 0, 4) ===
          'RIFF' &&
        bytesToAscii(bytes, 8, 12) ===
          'WEBP'
      break

    default:
      valid = false
  }

  if (!valid) {
    throw new HttpError(
      415,
      'The selected image does not match its declared file type.'
    )
  }
}

function validatePdfSignature(
  bytes: Uint8Array
) {
  const header = bytesToAscii(
    bytes,
    0,
    Math.min(bytes.length, 1024)
  )

  if (!header.includes('%PDF-')) {
    throw new HttpError(
      415,
      'The selected file is not a valid PDF document.'
    )
  }
}

function validateTextBytes(
  bytes: Uint8Array
) {
  const inspectionLength = Math.min(
    bytes.length,
    4096
  )

  for (
    let index = 0;
    index < inspectionLength;
    index += 1
  ) {
    if (bytes[index] === 0) {
      throw new HttpError(
        415,
        'The selected text document appears to contain binary data.'
      )
    }
  }
}

function decodeXmlEntities(
  value: string
): string {
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-fA-F]+)|amp|lt|gt|quot|apos);/g,
    (
      entity,
      decimalCode: string | undefined,
      hexadecimalCode: string | undefined
    ) => {
      if (decimalCode) {
        const codePoint = Number.parseInt(
          decimalCode,
          10
        )

        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : ''
      }

      if (hexadecimalCode) {
        const codePoint = Number.parseInt(
          hexadecimalCode,
          16
        )

        return Number.isFinite(codePoint)
          ? String.fromCodePoint(codePoint)
          : ''
      }

      switch (entity) {
        case '&amp;':
          return '&'
        case '&lt;':
          return '<'
        case '&gt;':
          return '>'
        case '&quot;':
          return '"'
        case '&apos;':
          return "'"
        default:
          return ''
      }
    }
  )
}

function extractTextFromDocxXml(
  xml: string
): string {
  const output: string[] = []

  const tokenPattern =
    /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>|<\/w:tc>|<\/w:tr>|<\/w:p>/gi

  let match: RegExpExecArray | null

  while (
    (match = tokenPattern.exec(xml)) !== null
  ) {
    const token = match[0]

    if (
      token
        .toLowerCase()
        .startsWith('<w:t')
    ) {
      output.push(
        decodeXmlEntities(match[1] ?? '')
      )
      continue
    }

    if (
      /^<w:tab\b/i.test(token)
    ) {
      output.push('\t')
      continue
    }

    if (
      /^<w:(?:br|cr)\b/i.test(token)
    ) {
      output.push('\n')
      continue
    }

    if (
      /^<\/w:tc>/i.test(token)
    ) {
      output.push('\t')
      continue
    }

    if (
      /^<\/w:tr>/i.test(token)
    ) {
      output.push('\n')
      continue
    }

    if (
      /^<\/w:p>/i.test(token)
    ) {
      output.push('\n\n')
    }
  }

  return output.join('')
}

function normalizeExtractedText(
  value: string
): string {
  return value
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

function limitExtractedText(
  value: string
): ExtractedDocument {
  const normalized =
    normalizeExtractedText(value)

  if (!normalized) {
    throw new HttpError(
      422,
      'No readable text could be extracted from this document.'
    )
  }

  const textTruncated =
    normalized.length >
    MAX_EXTRACTED_CHARACTERS

  const text = textTruncated
    ? normalized.slice(
        0,
        MAX_EXTRACTED_CHARACTERS
      )
    : normalized

  return {
    text,
    extractedCharacters: text.length,
    textTruncated,
  }
}

function extractProvidedPdfDocument(
  bytes: Uint8Array,
  providedText: string | null,
  providedTextTruncated: boolean
): ExtractedDocument {
  validatePdfSignature(bytes)

  if (!providedText?.trim()) {
    throw new HttpError(
      422,
      'No readable text could be extracted from this PDF in the browser.'
    )
  }

  if (providedText.length > 100_000) {
    throw new HttpError(
      413,
      'The extracted PDF text is larger than the permitted processing limit.'
    )
  }

  const extracted =
    limitExtractedText(providedText)

  return {
    ...extracted,
    textTruncated:
      extracted.textTruncated ||
      providedTextTruncated,
  }
}

function extractDocxDocument(
  bytes: Uint8Array
): ExtractedDocument {
  if (
    !startsWithBytes(bytes, [
      0x50,
      0x4b,
    ])
  ) {
    throw new HttpError(
      415,
      'The selected file is not a valid DOCX document.'
    )
  }

  let selectedUncompressedBytes = 0

  let entries: Record<string, Uint8Array>

  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        if (
          !docxTextEntryNames.has(file.name)
        ) {
          return false
        }

        if (
          file.originalSize >
          MAX_DOCX_XML_BYTES
        ) {
          throw new HttpError(
            422,
            'The DOCX document is too complex to process safely.'
          )
        }

        selectedUncompressedBytes +=
          file.originalSize

        if (
          selectedUncompressedBytes >
          MAX_DOCX_XML_BYTES
        ) {
          throw new HttpError(
            422,
            'The DOCX document is too complex to process safely.'
          )
        }

        return true
      },
    })
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }

    throw new HttpError(
      422,
      'The DOCX document could not be opened.'
    )
  }

  const documentXml =
    entries['word/document.xml']

  if (!documentXml) {
    throw new HttpError(
      422,
      'The DOCX document does not contain readable document content.'
    )
  }

  const orderedEntryNames = [
    'word/document.xml',
    'word/footnotes.xml',
    'word/endnotes.xml',
  ]

  const extractedParts: string[] = []

  for (
    const entryName of orderedEntryNames
  ) {
    const entry = entries[entryName]

    if (!entry) {
      continue
    }

    const xml = strFromU8(entry)

    const extracted =
      extractTextFromDocxXml(xml)

    if (extracted.trim()) {
      extractedParts.push(extracted)
    }
  }

  return limitExtractedText(
    extractedParts.join('\n\n')
  )
}

function extractTextDocument(
  bytes: Uint8Array,
  mimeType: string
): ExtractedDocument {
  validateTextBytes(bytes)

  let decoded: string

  try {
    decoded = new TextDecoder(
      'utf-8',
      {
        fatal: true,
      }
    ).decode(bytes)
  } catch {
    throw new HttpError(
      422,
      'The text document must use UTF-8 encoding.'
    )
  }

  if (mimeType === 'application/json') {
    try {
      const parsed = JSON.parse(decoded)

      decoded = JSON.stringify(
        parsed,
        null,
        2
      )
    } catch {
      throw new HttpError(
        422,
        'The selected JSON document is not valid JSON.'
      )
    }
  }

  return limitExtractedText(decoded)
}

async function extractDocument(
  bytes: Uint8Array,
  mimeType: string,
  providedPdfText: string | null,
  providedPdfTextTruncated: boolean
): Promise<ExtractedDocument> {
  if (mimeType === 'application/pdf') {
    return extractProvidedPdfDocument(
      bytes,
      providedPdfText,
      providedPdfTextTruncated
    )
  }

  if (
    mimeType ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return extractDocxDocument(bytes)
  }

  if (
    mimeType === 'text/plain' ||
    mimeType === 'text/markdown' ||
    mimeType === 'text/csv' ||
    mimeType === 'application/json'
  ) {
    return extractTextDocument(
      bytes,
      mimeType
    )
  }

  throw new HttpError(
    415,
    'This document type is not supported for text extraction.'
  )
}

export async function onRequestOptions(
  context: FunctionContext
): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context.request),
  })
}

export async function onRequestPost(
  context: FunctionContext
): Promise<Response> {
  let uploadedStoragePath: string | null = null

  try {
    const accessToken = getBearerToken(
      context.request
    )

    if (!accessToken) {
      throw new HttpError(
        401,
        'Authentication is required.'
      )
    }

    const contentType =
      context.request.headers.get(
        'Content-Type'
      ) ?? ''

    if (
      !contentType
        .toLowerCase()
        .startsWith(
          'multipart/form-data'
        )
    ) {
      throw new HttpError(
        415,
        'The upload request must use multipart/form-data.'
      )
    }

    const supabaseUrl = requireEnv(
      context.env.SUPABASE_URL,
      'SUPABASE_URL'
    ).replace(/\/$/, '')

    const supabaseSecretKey = requireEnv(
      context.env.SUPABASE_SECRET_KEY,
      'SUPABASE_SECRET_KEY'
    )

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseSecretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    )

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(
      accessToken
    )

    if (userError || !user) {
      throw new HttpError(
        401,
        'Your login session is invalid or has expired.'
      )
    }

    const authenticatedUserId = user.id

    const formData =
      await context.request.formData()

    const rawExtractedText =
      formData.get('extractedText')

    const providedPdfText =
      typeof rawExtractedText === 'string'
        ? rawExtractedText
        : null

    const providedPdfTextTruncated =
      formData.get('textTruncated') ===
      'true'

    const fileEntry =
      formData.get('file')

    if (
      !fileEntry ||
      typeof fileEntry === 'string'
    ) {
      throw new HttpError(
        400,
        'No file was provided.'
      )
    }

    const file = fileEntry
    const mimeType =
      resolveMimeType(file)

    const supported =
      supportedImageMimeTypes.has(
        mimeType
      ) ||
      supportedDocumentMimeTypes.has(
        mimeType
      )

    if (!supported) {
      throw new HttpError(
        415,
        'This file type is not supported. Use PNG, JPEG, WebP, GIF, PDF, DOCX, TXT, Markdown, CSV, or JSON.'
      )
    }

    if (file.size <= 0) {
      throw new HttpError(
        400,
        'The selected file is empty.'
      )
    }

    if (
      file.size >
      MAX_FILE_SIZE_BYTES
    ) {
      throw new HttpError(
        413,
        'The selected file is larger than the 6 MB limit.'
      )
    }

    const rawConversationId =
      formData.get('conversationId')

    const requestedConversationId =
      typeof rawConversationId === 'string'
        ? rawConversationId.trim() || null
        : null

    if (
      requestedConversationId &&
      !isValidUuid(
        requestedConversationId
      )
    ) {
      throw new HttpError(
        400,
        'The conversation ID is invalid.'
      )
    }

    if (requestedConversationId) {
      const {
        data: conversation,
        error: conversationError,
      } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq(
          'id',
          requestedConversationId
        )
        .eq(
          'user_id',
          authenticatedUserId
        )
        .maybeSingle()

      if (conversationError) {
        throw new Error(
          `Could not verify the conversation: ${conversationError.message}`
        )
      }

      if (!conversation) {
        throw new HttpError(
          404,
          'The conversation was not found or access was denied.'
        )
      }
    }

    const attachmentType =
      getAttachmentType(mimeType)

    const fileBuffer =
      await file.arrayBuffer()

    const fileBytes =
      new Uint8Array(fileBuffer)

    let extractedDocument:
      | ExtractedDocument
      | null = null

    if (attachmentType === 'image') {
      validateImageSignature(
        fileBytes,
        mimeType
      )
    } else {
      extractedDocument =
        await extractDocument(
          fileBytes,
          mimeType,
          providedPdfText,
          providedPdfTextTruncated
        )
    }

    const attachmentId =
      crypto.randomUUID()

    const safeFileName =
      sanitizeFileName(file.name)

    const storagePath =
      `${authenticatedUserId}/${attachmentId}/${safeFileName}`

    const {
      error: uploadError,
    } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(
        storagePath,
        fileBytes,
        {
          contentType: mimeType,
          cacheControl: '3600',
          upsert: false,
        }
      )

    if (uploadError) {
      throw new Error(
        `Could not upload the file: ${uploadError.message}`
      )
    }

    uploadedStoragePath = storagePath

    const extractionStatus:
      ExtractionStatus =
      attachmentType === 'image'
        ? 'not_required'
        : 'ready'

    const {
      error: insertError,
    } = await supabaseAdmin
      .from('chat_attachments')
      .insert({
        id: attachmentId,
        user_id: authenticatedUserId,
        conversation_id:
          requestedConversationId,
        message_id: null,
        storage_path: storagePath,
        file_name: safeFileName,
        mime_type: mimeType,
        size_bytes: file.size,
        attachment_type:
          attachmentType,
        status: 'pending',
        extracted_text:
          extractedDocument?.text ??
          null,
        extraction_status:
          extractionStatus,
        extraction_error: null,
        extracted_characters:
          extractedDocument
            ?.extractedCharacters ?? 0,
        text_truncated:
          extractedDocument
            ?.textTruncated ?? false,
      })

    if (insertError) {
      await supabaseAdmin.storage
        .from(BUCKET_NAME)
        .remove([storagePath])

      uploadedStoragePath = null

      throw new Error(
        `Could not save the attachment record: ${insertError.message}`
      )
    }

    const attachment:
      UploadedAttachment = {
      id: attachmentId,
      fileName: safeFileName,
      mimeType,
      sizeBytes: file.size,
      attachmentType,
      conversationId:
        requestedConversationId,
      status: 'pending',
      extractionStatus,
      extractedCharacters:
        extractedDocument
          ?.extractedCharacters ?? 0,
      textTruncated:
        extractedDocument
          ?.textTruncated ?? false,
    }

    return jsonResponse(
      context.request,
      {
        success: true,
        attachment,
      },
      201
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'An unknown upload error occurred.'

    const status =
      error instanceof HttpError
        ? error.status
        : 500

    console.error(
      'ATTACHMENT UPLOAD ERROR:',
      message
    )

    if (uploadedStoragePath) {
      try {
        const supabaseUrl =
          requireEnv(
            context.env.SUPABASE_URL,
            'SUPABASE_URL'
          ).replace(/\/$/, '')

        const supabaseSecretKey =
          requireEnv(
            context.env
              .SUPABASE_SECRET_KEY,
            'SUPABASE_SECRET_KEY'
          )

        const cleanupClient =
          createClient(
            supabaseUrl,
            supabaseSecretKey,
            {
              auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl:
                  false,
              },
            }
          )

        await cleanupClient.storage
          .from(BUCKET_NAME)
          .remove([
            uploadedStoragePath,
          ])
      } catch (cleanupError) {
        console.error(
          'ATTACHMENT CLEANUP ERROR:',
          cleanupError
        )
      }
    }

    return jsonResponse(
      context.request,
      {
        success: false,
        error: message,
      },
      status
    )
  }
}