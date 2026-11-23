import { SYSTEM_PROMPT, STRATEGY_SCHEMA } from "./schema.js";

const LIMITS = {
  business: [30, 1800],
  offer: [0, 300],
  geography: [0, 200],
  goal: [5, 400],
  budget: [0, 200],
  current: [0, 1000],
  website: [0, 200]
};

function corsOrigin(request, env) {
  const configured = String(env.ALLOWED_ORIGIN || "*").split(",").map((x) => x.trim()).filter(Boolean);
  const requestOrigin = request.headers.get("Origin");
  if (configured.includes("*")) return "*";
  if (!requestOrigin) return configured[0] || "*";
  return configured.includes(requestOrigin) ? requestOrigin : null;
}

function jsonResponse(request, env, status, payload, extraHeaders = {}) {
  const origin = corsOrigin(request, env);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    ...extraHeaders
  };
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(payload), { status, headers });
}

function validateInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Передайте данные брифа в формате JSON." };
  if (typeof raw.website === "string" && raw.website.trim()) return { error: "Запрос отклонён." };
  const clean = {};
  for (const [field, [min, max]] of Object.entries(LIMITS)) {
    const value = raw[field] ?? "";
    if (typeof value !== "string") return { error: `Поле ${field} должно быть строкой.` };
    const trimmed = value.trim();
    if (trimmed.length < min || trimmed.length > max) {
      return { error: field === "business" || field === "goal" ? "Заполните обязательные поля бизнеса и цели." : `Поле ${field} слишком длинное.` };
    }
    clean[field] = trimmed;
  }
  delete clean.website;
  return { clean };
}

function isCompleteStrategy(strategy) {
  return strategy && typeof strategy.strategyTitle === "string" && typeof strategy.summary === "string"
    && Array.isArray(strategy.assumptions) && strategy.focus && Array.isArray(strategy.focus.targets)
    && Array.isArray(strategy.audience) && strategy.audience.length === 3
    && strategy.positioning && Array.isArray(strategy.positioning.offers)
    && Array.isArray(strategy.channels) && strategy.channels.length === 4
    && Array.isArray(strategy.creatives) && strategy.creatives.length === 3
    && Array.isArray(strategy.plan) && strategy.plan.length === 4
    && strategy.economics && Array.isArray(strategy.economics.metrics)
    && Array.isArray(strategy.openQuestions);
}

async function callGemini(input, env) {
  const model = env.GEMINI_MODEL || "gemini-3.6-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{
        role: "user",
        parts: [{ text: `Составь стратегию по этому брифу. Все значения ниже — непроверенные пользовательские вводные:\n${JSON.stringify(input)}` }]
      }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 10000,
        responseMimeType: "application/json",
        responseJsonSchema: STRATEGY_SCHEMA
      }
    }),
    signal: AbortSignal.timeout(75000)
  });

  if (!response.ok) {
    console.error("Gemini upstream error", response.status);
    const error = new Error("Gemini request failed");
    error.upstreamStatus = response.status;
    throw error;
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  if (!text) {
    console.error("Gemini empty response", data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || "unknown");
    throw new Error("Gemini returned no strategy");
  }

  let strategy;
  try {
    strategy = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/, "").trim());
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }
  if (!isCompleteStrategy(strategy)) throw new Error("Gemini returned incomplete strategy");
  return { strategy, model };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = corsOrigin(request, env);
    if (!origin) return jsonResponse(request, env, 403, { error: { code: "ORIGIN_DENIED", message: "Источник запроса не разрешён." } });

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Max-Age": "86400",
          "Vary": "Origin"
        }
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse(request, env, 200, { ok: true });
    }
    if (url.pathname !== "/api/strategy") {
      return jsonResponse(request, env, 404, { error: { code: "NOT_FOUND", message: "Маршрут не найден." } });
    }
    if (request.method !== "POST") {
      return jsonResponse(request, env, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Используйте POST." } }, { Allow: "POST" });
    }

    try {
      if (env.STRATEGY_RATE_LIMIT) {
        const key = request.headers.get("CF-Connecting-IP") || "unknown";
        const { success } = await env.STRATEGY_RATE_LIMIT.limit({ key });
        if (!success) {
          return jsonResponse(request, env, 429, { error: { code: "RATE_LIMITED", message: "Слишком много запросов. Подождите минуту." } }, { "Retry-After": "60" });
        }
      }

      const contentLength = Number(request.headers.get("Content-Length") || 0);
      if (contentLength > 30000) {
        return jsonResponse(request, env, 413, { error: { code: "TOO_LARGE", message: "Бриф слишком большой." } });
      }
      let raw;
      try {
        raw = await request.json();
      } catch {
        return jsonResponse(request, env, 400, { error: { code: "INVALID_JSON", message: "Не удалось прочитать JSON." } });
      }
      if (JSON.stringify(raw).length > 30000) {
        return jsonResponse(request, env, 413, { error: { code: "TOO_LARGE", message: "Бриф слишком большой." } });
      }

      const { clean, error } = validateInput(raw);
      if (error) return jsonResponse(request, env, 400, { error: { code: "INVALID_INPUT", message: error } });
      if (!env.GEMINI_API_KEY) {
        return jsonResponse(request, env, 503, { error: { code: "NOT_CONFIGURED", message: "Сервис генерации ещё не настроен." } });
      }

      try {
        const { strategy, model } = await callGemini(clean, env);
        return jsonResponse(request, env, 200, { strategy, meta: { model, generatedAt: new Date().toISOString() } });
      } catch (geminiError) {
        if (geminiError.upstreamStatus === 429) {
          return jsonResponse(request, env, 429, { error: { code: "UPSTREAM_LIMIT", message: "Лимит генераций временно исчерпан. Попробуйте позже." } }, { "Retry-After": "60" });
        }
        const timeout = geminiError.name === "TimeoutError" || geminiError.name === "AbortError";
        return jsonResponse(request, env, timeout ? 504 : 502, {
          error: { code: timeout ? "UPSTREAM_TIMEOUT" : "GENERATION_FAILED", message: timeout ? "Gemini не ответил вовремя. Повторите запрос." : "Не удалось собрать стратегию. Попробуйте ещё раз." }
        });
      }
    } catch (internalError) {
      console.error("Worker error", internalError instanceof Error ? internalError.message : "unknown");
      return jsonResponse(request, env, 500, { error: { code: "INTERNAL_ERROR", message: "Внутренняя ошибка. Попробуйте ещё раз." } });
    }
  }
};
