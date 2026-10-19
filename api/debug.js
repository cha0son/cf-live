/**
 * GET /api/debug?id=1858B
 *
 * 排查用：把「我这台机器访问洛谷到底发生了什么」原样吐出来。
 * 线上出问题时不靠猜——看这个就知道是被限流、被验证、还是解析失败。
 *
 * 这个接口不缓存，也不走 CDN。
 */
const ORIGIN = "https://www.luogu.com.cn";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  Referer: "https://www.luogu.com.cn/",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function toPid(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z][A-Z0-9_]*\d[A-Z0-9_]*$/.test(s)) return s;
  const m = s.match(/^(\d+)[/-]?([A-Z]\d*)$/);
  if (m) return "CF" + m[1] + m[2];
  return null;
}

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const q = new URL(req.url, "http://localhost").searchParams;
  const pid = toPid(q.get("id") || "1858B");
  if (!pid) {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "题号格式不对" }));
    return;
  }

  const url = `${ORIGIN}/problem/${pid}`;
  const out = {
    region: process.env.VERCEL_REGION || "(local)",
    pid: pid,
    requestUrl: url,
    steps: [],
  };

  const doFetch = async (label, headers) => {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers, redirect: "manual" });
      let body = "";
      try { body = await r.text(); } catch (e) { body = "(读不到)"; }
      const title = (body.match(/<title>([\s\S]{0,120}?)<\/title>/i) || ["", ""])[1].trim();
      out.steps.push({
        step: label,
        status: r.status,
        ms: Date.now() - t0,
        server: r.headers.get("server"),
        cfRay: r.headers.get("cf-ray"),
        location: r.headers.get("location"),
        setCookie: (r.headers.get("set-cookie") || "").split(";")[0],
        contentType: r.headers.get("content-type"),
        bodyLength: body.length,
        bodyTitle: title,
        hasProblemData: /application\/json/.test(body) && /"problem"/.test(body),
        snippet: body.replace(/\s+/g, " ").slice(0, 220),
      });
      return r;
    } catch (e) {
      out.steps.push({ step: label, error: e.name + ": " + e.message });
      return null;
    }
  };

  const r1 = await doFetch("1. 直接请求", HEADERS);
  if (r1 && r1.status >= 300 && r1.status < 400) {
    const cookie = (r1.headers.get("set-cookie") || "").split(";")[0];
    if (cookie) {
      await doFetch("2. 带 cookie 重试", Object.assign({}, HEADERS, { Cookie: cookie }));
    }
  }

  res.statusCode = 200;
  res.end(JSON.stringify(out, null, 2));
};
