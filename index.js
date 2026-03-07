const express = require("express");
const https = require("https");
const app = express();

app.use(express.json());

// ── env vars (set in Render dashboard) ────────────────────────────────────────
const FIREBASE_AUTH     = process.env.FIREBASE_AUTH;
const RTDB_HOST         = process.env.RTDB_HOST;
const FIRESTORE_PROJECT = process.env.FIRESTORE_PROJECT;
// ─────────────────────────────────────────────────────────────────────────────

// helper: HTTPS request
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

// deviceCode → userUID map
// Add one entry per physical device
const DEVICE_MAP = {
  "d1": "VZ0Ws4kimUUebSlpz70xX2FmVc42",
};

function getUID(deviceCode) {
  return DEVICE_MAP[deviceCode] || null;
}

// ── GET /geo?device=d1&type=school ────────────────────────────────────────────
// Reads from Firestore: users/{uid}/geofences/{type}
// Returns: {"lat":14.73,"lng":121.01,"radius":40}
app.get("/geo", async (req, res) => {
  const { device, type } = req.query;
  if (!device || !type) return res.status(400).send("missing device or type");

  const uid = getUID(device);
  if (!uid) return res.status(404).send("unknown device");

  const path = `/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/users/${uid}/geofences/${type}`;
  try {
    const result = await httpsRequest({
      hostname: "firestore.googleapis.com",
      path,
      method: "GET",
    });

    // Parse Firestore response and return clean JSON
    const doc = JSON.parse(result.body);
    if (!doc.fields) return res.status(404).send("no fields");

    const lat    = doc.fields.latitude?.doubleValue  || doc.fields.latitude?.integerValue  || 0;
    const lng    = doc.fields.longitude?.doubleValue || doc.fields.longitude?.integerValue || 0;
    const radius = doc.fields.radius?.doubleValue    || doc.fields.radius?.integerValue    || 0;

    res.json({ lat, lng, radius });
  } catch (e) {
    res.status(500).send("proxy error: " + e.message);
  }
});

// ── GET /contact?device=d1 ────────────────────────────────────────────────────
// Reads contact_number from Firestore users/{uid}
// Returns: {"contact":"09276481540"}
app.get("/contact", async (req, res) => {
  const { device } = req.query;
  if (!device) return res.status(400).send("missing device");

  const uid = getUID(device);
  if (!uid) return res.status(404).send("unknown device");

  const path = `/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/users/${uid}`;
  try {
    const result = await httpsRequest({
      hostname: "firestore.googleapis.com",
      path,
      method: "GET",
    });

    const doc = JSON.parse(result.body);
    if (!doc.fields) return res.status(404).send("no fields");

    const contact = doc.fields.contact_number?.stringValue || "";
    res.json({ contact });
  } catch (e) {
    res.status(500).send("proxy error: " + e.message);
  }
});

// ── POST /track?device=d1 ─────────────────────────────────────────────────────
// Writes GPS data to Realtime Database tracking/{uid}
// Body: { lat, lng, battery, sos, signalStrength, reliability, timestamp }
app.post("/track", async (req, res) => {
  const { device } = req.query;
  if (!device) return res.status(400).send("missing device");

  const uid = getUID(device);
  if (!uid) return res.status(404).send("unknown device");

  const { lat, lng, battery, sos, signalStrength, reliability, timestamp } = req.body;
  if (lat === undefined || lng === undefined)
    return res.status(400).send("missing lat/lng");

  const json = JSON.stringify({
    user_uid: uid,
    gps: {
      lat,
      lng,
      signalStrength: signalStrength || 0,
    },
    status: {
      battery:     battery     || 0,
      sos:         sos         || false,
      isActive:    true,
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
          "Content-Type":  "application/json",
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

// ── health check ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.send("LOCUS proxy OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`LOCUS proxy running on port ${PORT}`));
