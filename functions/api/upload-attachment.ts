import { createClient } from '@supabase/supabase-js'

type Environment = {
  SUPABASE_URL?: string
  SUPABASE_SECRET_KEY?: string
}

type FunctionContext = {
  request: Request
  env: Environment
}

type AttachmentType = 'image' | 'document'

type UploadedAttachment = {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  attachmentType: AttachmentType
  conversationId: string | null
  status: 'pending'
}

const BUCKET_NAME = 'chat-attachments'
const MAX_FILE_SIZE_BYTES = 6 * 1024 * 1024

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://ai-tools-portal-9h5.pages.dev',
]

const allowedMimeTypes = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/rtf',
  'text/rtf',
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

function getCorsHeaders(request: Request): Record<string, string> {
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

function getAttachmentType(
  mimeType: string
): AttachmentType {
  return mimeType.startsWith('image/')
    ? 'image'
    : 'document'
}

function getBearerToken(request: Request): string | null {
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
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'Authentication is required.',
        },
        401
      )
    }

    const contentType =
      context.request.headers.get('Content-Type') ?? ''

    if (
      !contentType
        .toLowerCase()
        .startsWith('multipart/form-data')
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The upload request must use multipart/form-data.',
        },
        415
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
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'Your login session is invalid or has expired.',
        },
        401
      )
    }

    const authenticatedUserId = user.id
    const formData =
      await context.request.formData()

    const fileEntry = formData.get('file')

    if (
      !fileEntry ||
      typeof fileEntry === 'string'
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'No file was provided.',
        },
        400
      )
    }

    const file = fileEntry
    const mimeType = file.type
      .trim()
      .toLowerCase()

    if (!mimeType) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The selected file does not have a valid MIME type.',
        },
        400
      )
    }

    if (!allowedMimeTypes.has(mimeType)) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'This file type is not supported.',
          allowedMimeTypes:
            Array.from(allowedMimeTypes),
        },
        415
      )
    }

    if (file.size <= 0) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error: 'The selected file is empty.',
        },
        400
      )
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The selected file is larger than the 6 MB limit.',
          maximumBytes: MAX_FILE_SIZE_BYTES,
        },
        413
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
      !isValidUuid(requestedConversationId)
    ) {
      return jsonResponse(
        context.request,
        {
          success: false,
          error:
            'The conversation ID is invalid.',
        },
        400
      )
    }

    if (requestedConversationId) {
      const {
        data: conversation,
        error: conversationError,
      } = await supabaseAdmin
        .from('conversations')
        .select('id')
        .eq('id', requestedConversationId)
        .eq('user_id', authenticatedUserId)
        .maybeSingle()

      if (conversationError) {
        throw new Error(
          `Could not verify the conversation: ${conversationError.message}`
        )
      }

      if (!conversation) {
        return jsonResponse(
          context.request,
          {
            success: false,
            error:
              'The conversation was not found or access was denied.',
          },
          404
        )
      }
    }

    const attachmentId = crypto.randomUUID()
    const safeFileName =
      sanitizeFileName(file.name)

    const storagePath =
      `${authenticatedUserId}/${attachmentId}/${safeFileName}`

    const fileBytes = await file.arrayBuffer()

    const {
      error: uploadError,
    } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(
        storagePath,
        new Uint8Array(fileBytes),
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

    const attachmentType =
      getAttachmentType(mimeType)

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
        attachment_type: attachmentType,
        status: 'pending',
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

    const attachment: UploadedAttachment = {
      id: attachmentId,
      fileName: safeFileName,
      mimeType,
      sizeBytes: file.size,
      attachmentType,
      conversationId:
        requestedConversationId,
      status: 'pending',
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

    console.error(
      'ATTACHMENT UPLOAD ERROR:',
      message
    )

    if (uploadedStoragePath) {
      try {
        const supabaseUrl = requireEnv(
          context.env.SUPABASE_URL,
          'SUPABASE_URL'
        ).replace(/\/$/, '')

        const supabaseSecretKey = requireEnv(
          context.env.SUPABASE_SECRET_KEY,
          'SUPABASE_SECRET_KEY'
        )

        const cleanupClient = createClient(
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

        await cleanupClient.storage
          .from(BUCKET_NAME)
          .remove([uploadedStoragePath])
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
      500
    )
  }
}