/**
 * GET /api/debug?id=1858B
 *
 * 排查用：把「这台机器访问洛谷到底发生了什么」原样吐出来。
 *
 * 会用两套请求头各跑一遍完整握手（请求 → 跟 302 → 带 cookie 重试），
 * 因为「声明自己是 Chrome 但 TLS 是 undici」的指纹不一致本身就可能触发 WAF，
 * 需要区分是「IP 被拦」还是「头被拦」。
 */
const ORIGIN = "https://www.luogu.com.cn";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const MIN = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

const FULL = Object.assign({}, MIN, {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  Referer: ORIGIN + "/",
  "sec-ch-ua": '"Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
});

function toPid(raw) {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z][A-Z0-9_]*\d[A-Z0-9_]*$/.test(s)) return s;
  const m = s.match(/^(\d+)[/-]?([A-Z]\d*)$/);
  if (m) return "CF" + m[1] + m[2];
  return null;
}

async function probe(url, headers, label) {
  const t0 = Date.now();
  const one = async (extra) => {
    try {
      const r = await fetch(url, {
        headers: Object.assign({}, headers, extra || {}),
        redirect: "manual",
      });
      let body = "";
      try { body = await r.text(); } catch (e) { body = ""; }
      return {
        status: r.status,
        ms: Date.now() - t0,
        server: r.headers.get("server") || "",
        cfRay: r.headers.get("cf-ray") || "",
        location: r.headers.get("location") || "",
        setCookie: (r.headers.get("set-cookie") || "").split(";")[0],
        contentType: r.headers.get("content-type") || "",
        len: body.length,
        title: ((body.match(/<title>([\s\S]{0,120}?)<\/title>/i) || ["", ""])[1] || "").trim(),
        hasData: /"problem"/.test(body) && /application\/json/.test(body),
        snippet: body.replace(/\s+/g, " ").slice(0, 240),
      };
    } catch (e) {
      return { error: e.name + ": " + e.message, ms: Date.now() - t0 };
    }
  };

  const first = await one();
  const out = { headers: label, first };
  if (first.status >= 300 && first.status < 400 && first.setCookie) {
    out.retryWithCookie = await one({ Cookie: first.setCookie });
  }
  return out;
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
  const result = {
    region: process.env.VERCEL_REGION || "(local)",
    pid,
    url,
    probes: [],
  };

  result.probes.push(await probe(url, MIN, "minimal(仅 UA)"));
  result.probes.push(await probe(url, FULL, "full(完整浏览器头)"));
  result.hint =
    "如果两个 probe 都是 403，且 server 是 nginx/Tengine，基本可以确认是洛谷按机房 IP 拦；" +
    "如果 minimal 能过而 full 403，则是请求头指纹不一致触发的 WAF。";

  res.statusCode = 200;
  res.end(JSON.stringify(result, null, 2));
};
