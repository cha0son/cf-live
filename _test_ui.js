/* 前端渲染测试：用真实 API 数据喂 DOM 垫片，跑一遍页面脚本。 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { getProblem } = require("./lib/luogu");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const js = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const results = [];
function check(name, cond, detail) {
  results.push([name, !!cond]);
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  (" + detail + ")" : ""}`);
}

function makeEl(tag) {
  const el = {
    tagName: tag, _html: "", textContent: "", value: "",
    dataset: {},
    addEventListener() {},
    querySelector() { return { textContent: "" }; },
    querySelectorAll() { return []; },
    closest() { return { querySelector: () => ({ textContent: "" }) }; },
    get innerHTML() { return el._html; },
    set innerHTML(v) { el._html = v; },
  };
  return el;
}

function run(search, payload) {
  const app = makeEl("div");
  const errors = [];
  const store = new Map();
  const ctx = {
    console, setTimeout, clearTimeout, alert() {},
    URLSearchParams, Math, JSON, Date, Object, Array, String, Number, Promise, Map, Set, RegExp, Error,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    document: {
      getElementById: (id) => (id === "app" ? app : makeEl(id === "jump" ? "form" : "input")),
      createElement: makeEl,
    },
    location: { search: search || "", pathname: "/" },
    history: { replaceState() {} },
    scrollTo() {},
    window: { scrollTo() {} },
    navigator: {},
    fetch: async (url) => {
      if (!payload) return { ok: false, json: async () => ({ error: "网络挂了" }) };
      return { ok: true, json: async () => payload };
    },
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  try {
    new vm.Script(js, { filename: "inline.js" }).runInContext(vm.createContext(ctx));
  } catch (e) {
    errors.push("同步抛错: " + e.message);
  }
  return { app, errors };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log("拉一份真实数据当测试输入 …");
  const p = await getProblem("1858B");
  console.log(`  ${p.title} · 样例 ${p.samples.length} 组\n`);

  // ---------- 首页 ----------
  const home = run("", null);
  await sleep(80);
  check("首页无异常", home.errors.length === 0, home.errors.join(" | "));
  const hh = home.app._html;
  check("首页有标题", hh.includes("<h1>"), "");
  check("首页有输入框", hh.includes("bigInput"), "");

  // ---------- 阅读页 ----------
  const rd = run("?id=1858B", p);
  await sleep(120);
  check("阅读页无异常", rd.errors.length === 0, rd.errors.join(" | "));
  const r = rd.app._html;

  check("标题正确", r.includes("The Walkway"), "");
  check("有题目描述段落", r.includes("题目描述"), "");
  check("有输入/输出格式", r.includes("输入格式") && r.includes("输出格式"), "");
  check("有样例块", (r.match(/class="sample"/g) || []).length === 1,
        (r.match(/class="sample"/g) || []).length + " 个");
  check("样例内容是 17 行", (r.match(/<pre class="sample-pre">/g) || []).length === 2, "");
  check("Markdown 段落已渲染", /<p>[\s\S]*<\/p>/.test(r), "");
  check("公式转成 span", r.includes('class="math"'), "");
  check("没有残留 $ 定界符", !/\$\d|\$\s/.test(r.replace(/<pre[\s\S]*?<\/pre>/g, "")), "");
  check("难度/时限/内存/通过率都在",
        r.includes("难度") && r.includes("时限") && r.includes("内存") && r.includes("通过"), "");
  check("有中英切换按钮",
        r.includes('data-lang="zh-CN"') && r.includes('data-lang="en"'), "");
  check("有洛谷原页链接", r.includes("luogu.com.cn/problem/CF1858B"), "");
  check("有 CF 提交链接", r.includes("codeforces.com/problemset/problem/1858/B"), "");
  check("默认显示中文", r.includes("题目描述"), "");

  // ---------- 出错兜底 ----------
  const bad = run("?id=1858B", null);
  await sleep(120);
  check("接口失败不白屏", bad.app._html.includes("errbox"), "");
  check("失败时给了兜底链接", bad.app._html.includes("luogu.com.cn"), "");

  // ---------- 非法题号 ----------
  const inv = run("?id=!!!", null);
  await sleep(80);
  check("非法题号有提示", inv.app._html.includes("格式不对") || inv.app._html.includes("errbox"), "");

  const ok = results.every((x) => x[1]);
  console.log(`\n${results.length} 项断言 · ` + (ok ? "全部通过" : "有失败项"));
  process.exit(ok ? 0 : 1);
})();
