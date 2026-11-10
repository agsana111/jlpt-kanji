// Sends the daily "check now" push. The phone computes the actual reminder text.
// Env: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTIONS (one subscription JSON or a JSON array)
import webpush from "web-push";

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SUBSCRIPTIONS } = process.env;
if (!PUSH_SUBSCRIPTIONS) {
  console.log("No PUSH_SUBSCRIPTIONS secret yet; nothing to send.");
  process.exit(0);
}
webpush.setVapidDetails("https://agsana111.github.io/jlpt-kanji/", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const parsed = JSON.parse(PUSH_SUBSCRIPTIONS);
const subs = Array.isArray(parsed) ? parsed : [parsed];
let failed = 0;
for (const [i, sub] of subs.entries()) {
  try {
    const res = await webpush.sendNotification(sub, JSON.stringify({ type: "daily" }), { TTL: 6 * 3600, urgency: "normal" });
    console.log(`subscription ${i}: sent (${res.statusCode})`);
  } catch (e) {
    failed++;
    const gone = e.statusCode === 404 || e.statusCode === 410;
    console.log(`subscription ${i}: ${gone ? "expired - turn notifications on again in the app and re-register" : `failed (${e.statusCode ?? e.message})`}`);
  }
}
process.exit(failed === subs.length ? 1 : 0);
