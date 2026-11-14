import { handleGeminiRequest } from './aiHandler';
import { deepHealth, deepHealthAllowed, hasConfiguredAiKey } from './aiProviders';
import { writerChain } from './textChain';

/** The AI secrets the server looks for (names only). */
export const AI_KEY_NAMES = ['NVIDIA_API_KEY', 'NVIDIA_CHECKER_API_KEY', 'GROQ_API_KEY', 'GROQ_API_KEY_2', 'GEMINI_API_KEY'];
let lastEnvNames: string[] = [];

/**
 * Serverless Web Request -> Express API dispatcher for Netlify Functions & Cloudflare Workers (`/api/*`).
 */
export async function dispatchServerlessApi(
  webReq: globalThis.Request,
  clientIp: string = "127.0.0.1",
  env?: Record<string, any>
): Promise<globalThis.Response> {
  lastEnvNames = env && typeof env === "object" ? Object.keys(env) : [];
  if (env && typeof env === "object") {
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === "string" && v.length > 0) {
        process.env[k] = v;
      }
    }
  }
  const url = new URL(webReq.url);
  // Package A2: /api/health?deep=1 checks each AI provider, for whoever holds HEALTH_CHECK_TOKEN.
  if (url.pathname === "/api/health" && url.searchParams.get("deep") === "1") {
    if (!deepHealthAllowed(webReq.headers.get("authorization"))) {
      return new globalThis.Response(JSON.stringify({ error: "Deep health needs the health check token." }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    }
    const providers = await deepHealth();
    const ok = Object.values(providers).some((p) => p.ok);
    return new globalThis.Response(JSON.stringify({ status: ok ? "ok" : "degraded", app: "grammar-casino", providers }), {
      status: ok ? 200 : 503,
      headers: { "Content-Type": "application/json" },
    });
  }
  let parsedBody: any = {};
  if (webReq.method !== "GET" && webReq.method !== "HEAD") {
    try {
      parsedBody = await webReq.json();
    } catch {
      parsedBody = {};
    }
  }

  const headersObj: Record<string, string> = {};
  webReq.headers.forEach((value, key) => {
    headersObj[key.toLowerCase()] = value;
  });
  if (!headersObj["x-forwarded-for"] && clientIp) {
    headersObj["x-forwarded-for"] = clientIp;
  }

  const queryObj: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    queryObj[key] = value;
  });

  return await new Promise<globalThis.Response>((resolve) => {
    let statusCode = 200;
    const respHeaders: Record<string, string> = {
      "content-type": "application/json; charset=utf-8",
    };

    const mockReq: any = {
      method: webReq.method,
      url: url.pathname + url.search,
      path: url.pathname,
      headers: headersObj,
      body: parsedBody,
      query: queryObj,
      params: {},
      socket: { remoteAddress: clientIp },
    };

    const mockRes: any = {
      status(code: number) {
        statusCode = code;
        return mockRes;
      },
      setHeader(name: string, value: string) {
        respHeaders[name.toLowerCase()] = String(value);
        return mockRes;
      },
      json(payload: any) {
        resolve(
          new globalThis.Response(JSON.stringify(payload), {
            status: statusCode,
            headers: respHeaders,
          })
        );
        return mockRes;
      },
      send(payload: any) {
        const bodyStr = typeof payload === "string" ? payload : JSON.stringify(payload);
        resolve(
          new globalThis.Response(bodyStr, {
            status: statusCode,
            headers: respHeaders,
          })
        );
        return mockRes;
      },
    };

    if (url.pathname === "/api/gemini" && webReq.method === "POST") {
      handleGeminiRequest(mockReq, mockRes).catch((err) => {
        resolve(
          new globalThis.Response(
            JSON.stringify({ fallback: true, error: err?.message || "Serverless handler error." }),
            { status: 200, headers: respHeaders }
          )
        );
      });
      return;
    }

    if (url.pathname === "/api/health") {
      // Package T6: whether AI sentences are on (a yes or no, never the key).
      // Which AI keys the server receives and the writers in use, by name only (never a value),
      // so a missing secret can be found from the browser.
      mockRes.json({
        status: "ok",
        app: "grammar-casino",
        aiConfigured: hasConfiguredAiKey(),
        aiChain: writerChain().map((m) => m.breaker),
        aiKeys: Object.fromEntries(AI_KEY_NAMES.map((name) => [name, { fromCloudflare: lastEnvNames.includes(name), set: String(process.env[name] || "").trim().length > 5 }])),
      });
      return;
    }

    resolve(
      new globalThis.Response(JSON.stringify({ error: `Not found: ${url.pathname}` }), {
        status: 404,
        headers: respHeaders,
      })
    );
  });
}
