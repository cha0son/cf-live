/* 本地开发/联调用的极简服务器：把 api/problem.js 挂到 /api/problem，
   其余请求当静态文件。没有装 vercel CLI 时可以直接 node _serve.js。 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const handler = require("./api/problem");

const PORT = process.env.PORT || 8787;

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/problem")) {
    handler(req, res);
    return;
  }
  const rel = req.url === "/" ? "index.html" : req.url.split("?")[0].slice(1);
  const file = path.join(__dirname, rel);
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const type = file.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";
    res.setHeader("Content-Type", type);
    res.end(fs.readFileSync(file));
  } else {
    res.statusCode = 404;
    res.end("not found");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`listening on http://127.0.0.1:${PORT}`);
});
