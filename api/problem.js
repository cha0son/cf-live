/**
 * GET /api/problem?id=1858B[&lang=zh|en]
 *
 * 实时从洛谷取题面并返回结构化 JSON。
 * 数据源选择的原因见 lib/luogu.js 顶部注释（一句话：CF 被 Cloudflare 按 TLS 指纹拦，
 * 洛谷有镜像且可达，还自带中英双语）。
 */
const { getProblem } = require("../lib/luogu");

// 进程内小缓存：同一台实例上重复请求不再回源
const cache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;   // 6 小时
const CACHE_MAX = 200;

function send(res, status, body, cacheHeader) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", cacheHeader || "no-store");
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.statusCode = 204;
    res.end();
    return;
  }

  let query;
  try {
    query = new URL(req.url, "http://localhost").searchParams;
  } catch (e) {
    send(res, 400, { error: "无法解析请求" });
    return;
  }

  const raw = query.get("id") || query.get("url") || query.get("pid");
  if (!raw) {
    send(res, 400, { error: "缺少参数 id，例如 /api/problem?id=1858B" });
    return;
  }
  const lang = query.get("lang") || undefined;

  const key = raw.toUpperCase() + "|" + (lang || "");
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL) {
    send(res, 200, hit.data, "public, s-maxage=604800, stale-while-revalidate=86400");
    return;
  }

  try {
    const data = await getProblem(raw, { lang });
    if (cache.size >= CACHE_MAX) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (oldest) cache.delete(oldest[0]);
    }
    cache.set(key, { at: now, data });
    // 题面基本不变，交给 CDN 缓存一周
    send(res, 200, data, "public, s-maxage=604800, stale-while-revalidate=86400");
  } catch (e) {
    const status = e.status || 502;
    send(res, status, {
      error: e.message || "抓取失败",
      hint: status === 404 ? "检查题号是否存在" : "稍后重试，或直接去洛谷/Codeforces 打开",
    });
  }
};
