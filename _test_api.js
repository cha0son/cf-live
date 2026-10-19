/* 真联网测 /api/problem（洛谷数据源）。 */
const handler = require("./api/problem");

function fakeRes() {
  const r = { statusCode: 0, headers: {}, body: null };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = (s) => { r.body = s; };
  return r;
}

async function call(url) {
  const res = fakeRes();
  await handler({ method: "GET", url, headers: {} }, res);
  return { status: res.statusCode, headers: res.headers, json: JSON.parse(res.body) };
}

const results = [];
function check(name, cond, detail) {
  results.push([name, !!cond]);
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
}

(async () => {
  console.log("node", process.version, "\n");

  // ---------- 1. CF 题（英文 + 中文翻译） ----------
  const a = await call("/api/problem?id=1858B");
  check("1858B -> 200", a.status === 200, "status " + a.status + " " + (a.json.error || ""));
  if (a.status === 200) {
    check("标题", a.json.title === "The Walkway", a.json.title);
    check("pid", a.json.id === "CF1858B", a.json.id);
    check("还原出 cid/idx", a.json.cid === 1858 && a.json.idx === "B", a.json.cid + "/" + a.json.idx);
    check("时限 1000ms", a.json.timeMs === 1000, String(a.json.timeMs));
    check("内存 256000KB", a.json.memoryKb === 256000, String(a.json.memoryKb));
    check("有难度", typeof a.json.difficulty === "number", String(a.json.difficulty));
    check("有通过数", a.json.submit > 0 && a.json.accepted > 0,
          a.json.accepted + "/" + a.json.submit);
    check("题面正文非空", (a.json.content.description || "").length > 200,
          (a.json.content.description || "").length + " 字符");
    check("输入格式非空", (a.json.content.formatI || "").length > 50);
    check("样例 1 组", a.json.samples.length === 1, a.json.samples.length + " 组");
    check("样例输入 17 行", a.json.samples[0].input.split("\n").length === 17,
          a.json.samples[0].input.split("\n").length + " 行");
    check("样例输出 8 行", a.json.samples[0].output.split("\n").length === 8);
    check("有中文翻译", !!(a.json.translations && a.json.translations["zh-CN"]),
          Object.keys(a.json.translations || {}).join(","));
    check("中文翻译是中文", /[\u4e00-\u9fa5]/.test(
          (a.json.translations["zh-CN"] || {}).description || ""), "");
    check("有 CF 原站链接", /codeforces\.com\/problemset\/problem\/1858\/B/.test(a.json.cfUrl || ""),
          a.json.cfUrl);
    check("CDN 缓存头", /s-maxage=604800/.test(a.headers["cache-control"] || ""),
          a.headers["cache-control"]);
    check("允许跨域", a.headers["access-control-allow-origin"] === "*");
  }

  // ---------- 2. 带 hint 的题 ----------
  const b = await call("/api/problem?id=1407C");
  check("1407C -> 200", b.status === 200, "status " + b.status);
  if (b.status === 200) {
    check("1407C 标题", b.json.title === "Chocolate Bunny", b.json.title);
    check("1407C 有提示字段", typeof b.json.content.hint === "string",
          JSON.stringify(b.json.content.hint).slice(0, 40));
    check("机翻署名水印已剥离", !/由\s*ChatGPT|Translated by/i.test(JSON.stringify(b.json)), "");
    check("英文原文完整", (b.json.translations.en.description || "").length > 300,
          (b.json.translations.en.description || "").length + " 字符");
  }

  // ---------- 3. 洛谷原生题 ----------
  const c = await call("/api/problem?id=P1001");
  check("P1001(洛谷原生) -> 200", c.status === 200, "status " + c.status);
  if (c.status === 200) {
    check("P1001 标题非空", !!c.json.title, c.json.title);
    check("P1001 没有 CF 链接", c.json.cfUrl === null, String(c.json.cfUrl));
  }

  // ---------- 4. 非法题号 ----------
  const d = await call("/api/problem?id=!!!");
  check("非法题号 -> 400", d.status === 400, "status " + d.status);
  check("400 有中文提示", /格式/.test(d.json.error || ""), d.json.error);

  // ---------- 5. 不存在的题 ----------
  const e = await call("/api/problem?id=1999999Z");
  check("不存在的题 -> 4xx/502", e.status >= 400, "status " + e.status + " " + e.json.error);

  // ---------- 6. 完整 CF 链接传参 ----------
  const f = await call("/api/problem?url=" +
    encodeURIComponent("https://codeforces.com/problemset/problem/4/A"));
  check("完整 CF 链接 -> 200", f.status === 200, "status " + f.status);
  if (f.status === 200) check("4A 标题", /Watermelon/.test(f.json.title), f.json.title);

  const ok = results.every((r) => r[1]);
  console.log(`\n${results.length} 项断言 · ` + (ok ? "全部通过" : "有失败项"));
  process.exit(ok ? 0 : 1);
})();
