const http  = require("http");
const https = require("https");

const WORKER_HOST = "lcs.kylaroxannemaghari.workers.dev";
const WORKER_PATH = "/";
const API_KEY     = process.env.API_KEY || "locus2024";

const server = http.createServer((req, res) => {

  // Health check
  if (req.method === "GET") {
    res.writeHead(200);
    res.end("OK");
    return;
  }

  if (req.method !== "POST") {
    res.writeHead(405);
    res.end("Method Not Allowed");
    return;
  }

  let body = "";
  req.on("data", chunk => { body += chunk.toString(); });
  req.on("end", () => {
    console.log(`[PROXY] → ${body}`);

    const options = {
      hostname: WORKER_HOST,
      path:     WORKER_PATH,
      method:   "POST",
      headers: {
        "Content-Type":   "application/json",
        "X-API-Key":      API_KEY,
        "Content-Length": Buffer.byteLength(body)
      }
    };

    const proxyReq = https.request(options, (proxyRes) => {
      let data = "";
      proxyRes.on("data", chunk => { data += chunk; });
      proxyRes.on("end", () => {
        console.log(`[PROXY] ← ${proxyRes.statusCode}: ${data}`);
        // ✅ Never redirect - always return data directly
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(data);
      });
    });

    proxyReq.on("error", (err) => {
      console.error("[PROXY] Error:", err.message);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    });

    proxyReq.write(body);
    proxyReq.end();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ LOCUS Proxy running on port ${PORT}`);
});
