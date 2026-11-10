import { useEffect, useState } from "react";
import { currentSubscription, pushSupported, subscribe, testReminder, unsubscribe } from "../push";

export function NotifyPanel({ onToast }: { onToast: (m: string) => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState<string>(typeof Notification !== "undefined" ? Notification.permission : "unsupported");

  useEffect(() => {
    currentSubscription().then((s) => setCode(s ? JSON.stringify(s.toJSON()) : null));
  }, []);

  const on = async () => {
    setBusy(true);
    try {
      setCode(await subscribe());
      setPerm(Notification.permission);
      onToast("알림을 켰어요. 아래 등록 코드를 복사해서 Claude에게 보내 주세요.");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "알림을 켜지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      onToast("등록 코드를 복사했어요.");
    } catch {
      onToast("복사가 안 돼요. 코드를 길게 눌러 직접 복사해 주세요.");
    }
  };

  return (
    <section className="panel">
      <h2>매일 아침 알림</h2>
      <p className="muted small">
        매일 아침 9시쯤 「복습 23장이 기다려요」처럼 오늘 할 양을 알려 줘요. 숫자는 이 폰 안의 기록으로 계산하고, 기록은 밖으로 나가지 않아요.
      </p>
      {!pushSupported() ? (
        <p className="warn small">이 브라우저에서는 알림을 쓸 수 없어요. 크롬에서 설치한 앱으로 열어 주세요.</p>
      ) : (
        <div className="stack">
          {!code ? (
            <button className="primary" disabled={busy} onClick={on}>
              알림 켜기
            </button>
          ) : (
            <>
              <div className="good small">
                이 폰은 알림 등록됨 {perm !== "granted" && <span className="warn">(권한이 꺼져 있어요)</span>}
              </div>
              <label className="code-label">
                등록 코드 (처음 한 번만 Claude에게 보내 주세요)
                <textarea className="memo code" readOnly rows={3} value={code} onFocus={(e) => e.currentTarget.select()} />
              </label>
              <button onClick={copy}>등록 코드 복사</button>
              <button onClick={() => testReminder().catch((e) => onToast(String(e.message ?? e)))}>지금 테스트 알림 받기</button>
              <button
                className="text-btn"
                onClick={async () => {
                  await unsubscribe();
                  setCode(null);
                  onToast("알림을 껐어요.");
                }}
              >
                알림 끄기
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
