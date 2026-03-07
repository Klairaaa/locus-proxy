const express = require("express");
const https = require("https");
const app = express();

app.use(express.json());

// ── env vars (set these in Render dashboard) ──────────────────────────────────
const FIREBASE_AUTH     = process.env.FIREBASE_AUTH;
const RTDB_HOST         = process.env.RTDB_HOST;
const FIRESTORE_PROJECT = process.env.FIRESTORE_PROJECT;
const FIRESTORE_REGION  = process.env.FIRESTORE_REGION;
// ─────────────────────────────────────────────────────────────────────────────

// ── Hardcoded UID (change this per device) ────────────────────────────────────
const USER_UID = "VrmRSByRHJbGSMiLcltAMvLDnMx2";
// ─────────────────────────────────────────────────────────────────────────────

// helper: make an HTTPS request and return body as string
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── GET /geo?type=school ──────────────────────────────────────────────────────
app.get("/geo", async (req, res) => {
  const { type } = req.query;
  if (!type) return res.status(400).send("missing type");

  const path = `/geofences/${USER_UID}/${type}.json?auth=${FIREBASE_AUTH}`;
  try {
    const result = await httpsRequest({
      hostname: RTDB_HOST,
      path,
      method: "GET",
    });
    res.status(result.status).send(result.body);
  } catch (e) {
    res.status(500).send("proxy error: " + e.message);
  }
});

// ── POST /track ───────────────────────────────────────────────────────────────
app.post("/track", async (req, res) => {
  const { lat, lng, battery, sos, signalStrength, reliability, timestamp } = req.body;
  if (lat === undefined || lng === undefined)
    return res.status(400).send("missing fields");

  const json = JSON.stringify({
    gps: { lat, lng, signalStrength: signalStrength || 0 },
    status: {
      battery: battery || 0,
      sos: sos || false,
      isActive: true,
      reliability: reliability || 100,
    },
    last_updated: String(timestamp || Date.now()),
  });

  const path = `/tracking/${USER_UID}.json?auth=${FIREBASE_AUTH}`;
  try {
    const result = await httpsRequest(
      {
        hostname: RTDB_HOST,
        path,
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(json),
        },
      },
      json
    );
    res.status(result.status).send(result.body);
  } catch (e) {
    res.status(500).send("proxy error: " + e.message);
  }
});

// ── GET /contact ──────────────────────────────────────────────────────────────
app.get("/contact", async (req, res) => {
  const path = `/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/users/${USER_UID}`;
  try {
    const result = await httpsRequest({
      hostname: "firestore.googleapis.com",
      path,
      method: "GET",
    });
    res.status(result.status).send(result.body);
  } catch (e) {
    res.status(500).send("proxy error: " + e.message);
  }
});

// ── health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("LOCUS proxy OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LOCUS proxy running on port ${PORT}`));
