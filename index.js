const express = require("express");
const https = require("https");
const app = express();

app.use(express.json());

// ── env vars (set these in Render dashboard) ──────────────────────────────────
const FIREBASE_AUTH   = process.env.FIREBASE_AUTH;   // your ?auth= token
const RTDB_HOST       = process.env.RTDB_HOST;       // locus-1bcc8-default-rtdb.asia-southeast1.firebasedatabase.app
const FIRESTORE_PROJECT = process.env.FIRESTORE_PROJECT; // locus-1bcc8
const FIRESTORE_REGION  = process.env.FIRESTORE_REGION;  // asia-southeast1
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

// ── GET /geo?uid=VrmRSByRHJbGSMiLcltAMvLDnMx2&type=school ───────────────────
// Fetches geofence from Realtime DB
app.get("/geo", async (req, res) => {
  const { uid, type } = req.query; // type = "school" or "home"
  if (!uid || !type) return res.status(400).send("missing uid or type");

  const path = `/geofences/${uid}/${type}.json?auth=${FIREBASE_AUTH}`;
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
// Body: { uid, lat, lng, battery, sos, signalStrength, reliability, timestamp }
// Forwards a PATCH to Realtime DB tracking node
app.post("/track", async (req, res) => {
  const { uid, lat, lng, battery, sos, signalStrength, reliability, timestamp } = req.body;
  if (!uid || lat === undefined || lng === undefined)
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

  const path = `/tracking/${uid}.json?auth=${FIREBASE_AUTH}`;
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

// ── GET /contact?uid=VrmRSByRHJbGSMiLcltAMvLDnMx2 ───────────────────────────
// Fetches contact_number from Firestore
app.get("/contact", async (req, res) => {
  const { uid } = req.query;
  if (!uid) return res.status(400).send("missing uid");

  const path = `/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/users/${uid}`;
  try {
    const result = await httpsRequest({
      hostname: `firestore.googleapis.com`,
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
