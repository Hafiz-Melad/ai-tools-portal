import { onRequestOptions as __api_chat_ts_onRequestOptions } from "C:\\Projects\\ai-tools-portal\\functions\\api\\chat.ts"
import { onRequestPost as __api_chat_ts_onRequestPost } from "C:\\Projects\\ai-tools-portal\\functions\\api\\chat.ts"
import { onRequestOptions as __api_chat_stream_ts_onRequestOptions } from "C:\\Projects\\ai-tools-portal\\functions\\api\\chat-stream.ts"
import { onRequestPost as __api_chat_stream_ts_onRequestPost } from "C:\\Projects\\ai-tools-portal\\functions\\api\\chat-stream.ts"
import { onRequestGet as __api_history_ts_onRequestGet } from "C:\\Projects\\ai-tools-portal\\functions\\api\\history.ts"
import { onRequestOptions as __api_history_ts_onRequestOptions } from "C:\\Projects\\ai-tools-portal\\functions\\api\\history.ts"
import { onRequestGet as __api_models_ts_onRequestGet } from "C:\\Projects\\ai-tools-portal\\functions\\api\\models.ts"
import { onRequestPost as __api_sync_models_ts_onRequestPost } from "C:\\Projects\\ai-tools-portal\\functions\\api\\sync-models.ts"
import { onRequestOptions as __api_upload_attachment_ts_onRequestOptions } from "C:\\Projects\\ai-tools-portal\\functions\\api\\upload-attachment.ts"
import { onRequestPost as __api_upload_attachment_ts_onRequestPost } from "C:\\Projects\\ai-tools-portal\\functions\\api\\upload-attachment.ts"

export const routes = [
    {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_chat_ts_onRequestOptions],
    },
  {
      routePath: "/api/chat",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_chat_ts_onRequestPost],
    },
  {
      routePath: "/api/chat-stream",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_chat_stream_ts_onRequestOptions],
    },
  {
      routePath: "/api/chat-stream",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_chat_stream_ts_onRequestPost],
    },
  {
      routePath: "/api/history",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_history_ts_onRequestGet],
    },
  {
      routePath: "/api/history",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_history_ts_onRequestOptions],
    },
  {
      routePath: "/api/models",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_models_ts_onRequestGet],
    },
  {
      routePath: "/api/sync-models",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_sync_models_ts_onRequestPost],
    },
  {
      routePath: "/api/upload-attachment",
      mountPath: "/api",
      method: "OPTIONS",
      middlewares: [],
      modules: [__api_upload_attachment_ts_onRequestOptions],
    },
  {
      routePath: "/api/upload-attachment",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_upload_attachment_ts_onRequestPost],
    },
  ]