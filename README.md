# 题面速读

输入题号，**实时**读取题目描述、样例、时限。给别人用的在线工具，没有离线数据。

```
https://<你的域名>/?id=1858B
```

支持 Codeforces 题号（`1858B`）、洛谷题号（`P1001`）、以及完整链接。

## 为什么需要 Vercel（不能纯 GitHub Pages）

这不是偷懒，是一个硬约束。Codeforces 的题目页：

- **不发** `Access-Control-Allow-Origin` → 浏览器 `fetch` 被跨域拦截
- **带** `X-Frame-Options: sameorigin` → `iframe` 也被拦

所以「打开网页就能读题」必须有服务端代取，静态托管做不到。

## 为什么数据源是洛谷而不是直接抓 CF

这条更关键。CF 站点在 Cloudflare 后面，会按 **TLS 指纹**拦截非浏览器客户端，实测：

| 客户端 | 结果 |
|---|---|
| Node `fetch`，仅 UA | `403 Just a moment...` |
| Node `fetch`，完整 Chrome 请求头 | `403 Just a moment...` |
| 同机器 `curl`，同样的头 | `200` |

也就是说**问题不在请求头，在 TLS 层**——Node、PowerShell、Python `requests` 用的 TLS 栈都会被判定为 bot。任何常规服务端 HTTP 客户端都过不去。

洛谷镜像了 CF 题目，且：

1. 没有 Cloudflare，普通 HTTP 客户端可达（只需处理一次 302 + cookie）
2. 页面里内嵌了结构化 JSON（`<script type="application/json">`），直接给出
   题面 Markdown、样例、时限、通过数
3. **自带中英双语**，中文是机翻但可切换回英文原文
4. 国内访问快

所以数据源用洛谷。代价是：洛谷没收录的 CF 题就查不到（会明确提示）。

## 部署（Vercel，免费）

1. 把本目录推到一个 GitHub 仓库
2. 打开 <https://vercel.com/new>，选那个仓库，一路默认（会自动识别 `api/` 目录）
3. 拿到域名就能用：`https://xxx.vercel.app/?id=1858B`

不需要数据库、不需要环境变量、不需要构建步骤。

## API

也可以直接当接口用（已开 CORS，别人能调）：

```
GET /api/problem?id=1858B
GET /api/problem?id=P1001
GET /api/problem?url=https://codeforces.com/problemset/problem/1858/B
```

返回：

```jsonc
{
  "id": "CF1858B",
  "cid": 1858, "idx": "B",
  "title": "The Walkway",
  "difficulty": 3,              // 洛谷 1-7 难度
  "timeMs": 1000, "memoryKb": 256000,
  "submit": 566, "accepted": 273,
  "content": {                  // 按默认语言挑好的正文
    "locale": "zh-CN",
    "description": "...", "formatI": "...", "formatO": "...", "hint": "..."
  },
  "translations": {             // 中英都返回，前端可即时切换
    "zh-CN": { "description": "..." },
    "en":    { "description": "..." }
  },
  "samples": [{ "input": "...", "output": "..." }],
  "url": "https://www.luogu.com.cn/problem/CF1858B",
  "cfUrl": "https://codeforces.com/problemset/problem/1858/B"
}
```

错误码：`400` 题号格式不对 / `404` 洛谷没有这道题 / `502` 抓取失败 / `504` 超时。

## 缓存策略（别把洛谷打爆）

- CDN：`s-maxage=604800`（一周）+ `stale-while-revalidate`，同一题号只回源一次
- 函数内还有一层 6 小时的进程内缓存，热实例直接命中

题面几乎不会变，缓存一周完全没问题。

## 本地开发

```powershell
npm i -g vercel
vercel dev          # 起本地服务，前后端一起跑
```

不想装 vercel CLI 的话，仓库里有个极简适配器：

```powershell
node _serve.js      # http://127.0.0.1:8787
```

直接双击 `index.html` 不行——`api/` 是服务端路由，必须经 HTTP 服务。

## 测试

```powershell
node _test_api.js   # 31 项：真联网打洛谷，验证解析与错误码
node _test_ui.js    # 20 项：DOM 垫片跑页面脚本，验证渲染
```

`_test_api.js` 会真的访问洛谷，属于集成测试，需要联网。

## 已知限制

- 只覆盖洛谷收录了的题；冷门 CF 题可能查不到
- 依赖洛谷的页面结构（内嵌 JSON），洛谷改版需要跟着改
- 中文翻译是机翻，已剥掉「由 ChatGPT 翻译」这类署名水印；
  读题时如果语义存疑，切回 English 看原文

## 版权

题目版权归 Codeforces / 洛谷及各题作者所有。本项目只做实时转发与展示，
不存储、不重新分发题面内容。
