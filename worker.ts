import { dispatchServerlessApi } from "./server";

export interface Env {
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
  GROQ_API_KEY?: string;
  GROQ_API_KEY_2?: string;
  GROQ_TTS_VOICE?: string;
  GEMINI_API_KEY?: string;
  TEACHER_PIN?: string;
  [key: string]: any;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      const clientIp =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "127.0.0.1";
      return await dispatchServerlessApi(request, clientIp, env);
    }
    if (env.ASSETS) {
      return await env.ASSETS.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  },
};
