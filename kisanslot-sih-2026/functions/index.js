const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const twilio = require("twilio");

admin.initializeApp();

setGlobalOptions({
  maxInstances: 10,
  region: "us-central1"
});

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const smsFrom = process.env.TWILIO_PHONE_NUMBER;
const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;

const client = accountSid && authToken ? twilio(accountSid, authToken) : null;

async function getUserRole(uid) {
  const snap = await admin.firestore().collection("farmers").doc(uid).get();
  return snap.exists ? snap.data().role : null;
}

exports.notify = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Login required");
  }

  const { farmerId, message, channel = "sms" } = request.data || {};

  if (!farmerId || !message) {
    throw new HttpsError("invalid-argument", "farmerId and message are required");
  }

  const callerRole = await getUserRole(request.auth.uid);
  const isStaff = ["officer", "admin"].includes(callerRole);

  if (request.auth.uid !== farmerId && !isStaff) {
    throw new HttpsError("permission-denied", "Not allowed to notify this farmer");
  }

  const farmerSnap = await admin.firestore().collection("farmers").doc(farmerId).get();

  if (!farmerSnap.exists) {
    throw new HttpsError("not-found", "Farmer not found");
  }

  const mobile = farmerSnap.data().mobile;

  if (!mobile) {
    throw new HttpsError("failed-precondition", "Farmer mobile number not found");
  }

  if (!client) {
    return {
      success: true,
      mode: "mock",
      reason: "Twilio credentials not configured"
    };
  }

  let from = smsFrom;
  let to = mobile;

  if (channel === "whatsapp") {
    from = `whatsapp:${whatsappFrom}`;
    to = `whatsapp:${mobile}`;
  }

  const result = await client.messages.create({
    from,
    to,
    body: message
  });

  return {
    success: true,
    sid: result.sid,
    status: result.status
  };
});