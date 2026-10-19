/**
 * 从洛谷取 Codeforces 题面。
 *
 * 为什么不直接抓 codeforces.com：
 *   CF 站点在 Cloudflare 后面，会按 TLS 指纹拦非浏览器客户端。
 *   实测 Node 的 fetch 即使带完整 Chrome 请求头也只会拿到 403「Just a moment...」，
 *   而同机器上的 curl 能过。也就是说任何常规服务端 HTTP 客户端都会被拦。
 *
 * 洛谷镜像了 CF 的题目，且：
 *   1. 没有 Cloudflare，普通 HTTP 客户端可达（只需处理一次 302 + cookie）；
 *   2. 页面里内嵌了结构化 JSON（<script type="application/json">），
 *      包含题面 Markdown、样例、时限、难度、通过数，还有中英双语；
 *   3. 国内访问快。
 * 所以用洛谷做数据源。
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const ORIGIN = "https://www.luogu.com.cn";
const TIMEOUT_MS = 9000;

/** 题号归一化：1858B / CF1858B / 完整 CF 链接 / P1001 → 洛谷 pid */
function toLuoguPid(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase().replace(/\s+/g, "");

  // 完整 Codeforces 链接
  const u = s.match(/CODEFORCES\.COM\/PROBLEMSET\/PROBLEM\/(\d+)\/([A-Z]\d*)/);
  if (u) return "CF" + u[1] + u[2];

  // 完整洛谷链接
  const l = s.match(/LUOGU\.COM\.CN\/PROBLEM\/([A-Z0-9_]+)/);
  if (l) return l[1];

  // 已经是洛谷 pid：P1001 / CF1858B / AT_ABC123_A ...
  if (/^[A-Z][A-Z0-9_]*\d[A-Z0-9_]*$/.test(s)) return s;

  // 纯题号：1858B / 1858/B / 1858-B
  const m = s.match(/^(\d+)[/-]?([A-Z]\d*)$/);
  if (m) return "CF" + m[1] + m[2];

  return null;
}

/** 把洛谷 pid 还原成 CF 的 contestId / index（非 CF 题返回 null） */
function splitCfPid(pid) {
  const m = String(pid).match(/^CF(\d+)([A-Z]\d*)$/);
  if (!m) return null;
  return { cid: parseInt(m[1], 10), idx: m[2] };
}

async function fetchHtml(pid) {
  const url = `${ORIGIN}/problem/${pid}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  };

  try {
    // 洛谷对首次访问会 302 回同一地址并下发 C3VK cookie，
    // 带上 cookie 再请求一次即可。拦路的是这个，不是 UA。
    let r = await fetch(url, { headers, redirect: "manual", signal: controller.signal });
    if (r.status >= 300 && r.status < 400) {
      const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
      r = await fetch(url, {
        headers: Object.assign({}, headers, cookie ? { Cookie: cookie } : {}),
        redirect: "manual",
        signal: controller.signal,
      });
    }
    if (r.status === 404) {
      const err = new Error("洛谷上没有这道题");
      err.status = 404;
      throw err;
    }
    if (!r.ok) {
      const err = new Error(`洛谷返回 ${r.status}`);
      err.status = 502;
      throw err;
    }
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

/** 取出页面里内嵌的 SSR 数据（<script type="application/json">） */
function extractData(html) {
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const body = m[1].trim();
    if (!body.startsWith("{")) continue;
    try {
      const j = JSON.parse(body);
      if (j && j.data && j.data.problem) return j.data;
    } catch (e) {
      /* 不是我们要的那块，跳过 */
    }
  }
  return null;
}

/**
 * 洛谷的机翻文本末尾会带一行署名水印（如「由 ChatGPT 4.1 翻译」），
 * 那不是题面内容，展示时要剥掉。
 */
function cleanTranslated(s) {
  return String(s || "")
    .replace(/\s*由\s*ChatGPT[^\n]*翻译\s*$/i, "")
    .replace(/\s*由\s*AI[^\n]*翻译\s*$/i, "")
    .replace(/\s*Translated by[^\n]*$/i, "")
    .trim();
}

function pickLocale(data, want) {
  const tr = data.translations || {};
  const raw = (data.problem && data.problem.content) || {};
  // 优先用翻译；没有就退回题面自带的内容
  const order = want ? [want] : ["zh-CN", "en"];
  for (const loc of order) {
    if (tr[loc] && tr[loc].description) return { locale: loc, content: tr[loc] };
  }
  if (raw.description) return { locale: raw.locale || "en", content: raw };
  // 退而求其次：任意一个有内容的翻译
  for (const loc of Object.keys(tr)) {
    if (tr[loc] && tr[loc].description) return { locale: loc, content: tr[loc] };
  }
  return { locale: "en", content: raw };
}

async function getProblem(rawId, opts) {
  const pid = toLuoguPid(rawId);
  if (!pid) {
    const e = new Error("题号格式不对。支持 1858B、CF1858B、P1001 或完整链接");
    e.status = 400;
    throw e;
  }

  const html = await fetchHtml(pid);
  const data = extractData(html);
  if (!data) {
    const e = new Error("没能在页面里找到题目数据（洛谷结构可能变了）");
    e.status = 502;
    throw e;
  }

  const p = data.problem;
  const cf = splitCfPid(p.pid);
  const want = opts && opts.lang;
  const picked = pickLocale(data, want === "en" ? "en" : want === "zh" ? "zh-CN" : null);

  const limits = p.limits || {};
  const timeMs = Array.isArray(limits.time) ? limits.time[0] : limits.time;
  const memKb = Array.isArray(limits.memory) ? limits.memory[0] : limits.memory;

  // 中英文都给出去，前端可切换
  const translations = {};
  for (const loc of Object.keys(data.translations || {})) {
    const t = data.translations[loc];
    if (t && t.description) {
      const isZh = /zh/i.test(loc);
      const clean = isZh ? cleanTranslated : (x) => x || "";
      translations[loc] = {
        name: t.name || "",
        background: clean(t.background || ""),
        description: clean(t.description || ""),
        formatI: clean(t.formatI || ""),
        formatO: clean(t.formatO || ""),
        hint: clean(t.hint || ""),
      };
    }
  }

  const pickClean = /zh/i.test(picked.locale) ? cleanTranslated : (x) => x || "";
  const content = {
    locale: picked.locale,
    name: picked.content.name || "",
    background: pickClean(picked.content.background || ""),
    description: pickClean(picked.content.description || ""),
    formatI: pickClean(picked.content.formatI || ""),
    formatO: pickClean(picked.content.formatO || ""),
    hint: pickClean(picked.content.hint || ""),
  };

  return {
    id: p.pid,
    source: "luogu",
    cid: cf ? cf.cid : null,
    idx: cf ? cf.idx : null,
    title: p.name,
    difficulty: p.difficulty,          // 洛谷 1-7 难度
    tags: p.tags || [],
    submit: p.totalSubmit,
    accepted: p.totalAccepted,
    timeMs: timeMs,
    memoryKb: memKb,
    samples: (p.samples || []).map((s) => ({ input: s[0] || "", output: s[1] || "" })),
    content: content,
    translations,
    url: `${ORIGIN}/problem/${p.pid}`,
    cfUrl: cf ? `https://codeforces.com/problemset/problem/${cf.cid}/${cf.idx}` : null,
    fetchedAt: Date.now(),
  };
}

module.exports = { getProblem, toLuoguPid, splitCfPid };
