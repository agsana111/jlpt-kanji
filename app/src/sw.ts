/// <reference lib="webworker" />
// Custom service worker: offline caching (Workbox) + the daily study reminder.
// A daily push from GitHub Actions only says "check now"; the numbers in the
// notification are computed here from the study records stored on the phone.
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { allProgress, getMeta } from "./db";
import { dayKey, endOfDay } from "./srs";
import type { BreakPlan, DeckState, Settings } from "./types";

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL("index.html")));

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "TEST_REMINDER") event.waitUntil(showReminder(true));
});

self.addEventListener("push", (event) => {
  event.waitUntil(showReminder(false));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows[0]) return windows[0].focus();
      await self.clients.openWindow(self.registration.scope);
    })(),
  );
});

async function summary() {
  const today = dayKey();
  const eod = endOfDay().getTime();
  const decks = (await getMeta<Record<string, DeckState>>("decks")) ?? {};
  const settings = await getMeta<Settings>("settings");
  const plan = (await getMeta<BreakPlan | null>("breakPlan")) ?? null;
  const active = new Set(Object.values(decks).filter((d) => d.startedAt && !d.graduatedAt).map((d) => d.id));
  let due = 0;
  let done = 0;
  let tomorrow = 0;
  for (const p of await allProgress()) {
    if (!active.has(p.deck)) continue;
    const dueAt = new Date(p.fsrs.due).getTime();
    if (p.history.some((h) => h.d === today)) {
      done++;
      if (dueAt < eod + 86400_000) tomorrow++;
    } else if (dueAt < eod) due++;
    else if (dueAt < eod + 86400_000) tomorrow++;
  }
  const onBreak = !!plan && today >= plan.start && today <= plan.end;
  return { started: active.size > 0, due, done, tomorrow, onBreak, newPerBatch: settings?.newPerBatch ?? 10 };
}

async function showReminder(isTest: boolean) {
  const s = await summary();
  let title: string;
  let body: string;
  if (!s.started) {
    title = "JLPT 한자";
    body = "오늘 첫 학습을 시작해 볼까요?";
  } else if (s.due > 0) {
    title = `복습 ${s.due}장이 기다려요`;
    body = s.onBreak
      ? "쉬는 중이에요. 5분 모드로 급한 것만 해도 좋아요."
      : s.done
        ? `오늘 ${s.done}장 했어요. 남은 복습 ${s.due}장!`
        : `오늘 아직 안 했어요. 바쁘면 5분 모드로 ${Math.min(15, s.due)}장만!`;
  } else if (s.done > 0) {
    title = "오늘 복습 끝!";
    body = `잘했어요. 내일 예정 ${s.tomorrow}장.`;
  } else {
    title = "오늘 복습은 없어요";
    body = s.onBreak ? "푹 쉬어요." : `신규 ${s.newPerBatch}장 해 볼까요?`;
  }
  await self.registration.showNotification(isTest ? `[테스트] ${title}` : title, {
    body,
    icon: "icon-192.png",
    badge: "icon-192.png",
    tag: "daily-reminder",
    data: { url: self.registration.scope },
  });
}
