// Web Push subscription for the daily reminder.
// The public key is safe to ship; the private key lives only in GitHub Actions secrets.
export const VAPID_PUBLIC_KEY = "BKCE-6y_H8kKCyPzXI3jWapLDTlqzugNsDlv8zBdRNC59O9v2vTBbJz6iIHtRnPjTsb1mBDutMUo6FNH2WOWkLI";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) throw new Error("앱이 아직 준비 중이에요. 잠시 후 다시 눌러 주세요.");
  return reg;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask permission and subscribe. Returns the registration code to hand over. */
export async function subscribe(): Promise<string> {
  if (!pushSupported()) throw new Error("이 브라우저는 알림을 지원하지 않아요. 크롬에서 설치한 앱으로 열어 주세요.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("알림 권한이 꺼져 있어요. 폰 설정 → 앱 → 크롬(또는 JLPT 한자) → 알림에서 켜 주세요.");
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) }));
  return JSON.stringify(sub.toJSON());
}

export async function unsubscribe() {
  const sub = await currentSubscription();
  await sub?.unsubscribe();
}

/** Show today's reminder right now, using the same code path as the daily push. */
export async function testReminder() {
  const reg = await registration();
  (reg.active ?? reg.waiting ?? reg.installing)?.postMessage({ type: "TEST_REMINDER" });
}
