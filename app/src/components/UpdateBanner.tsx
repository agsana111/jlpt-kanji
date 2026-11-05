import { useRegisterSW } from "virtual:pwa-register/react";

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="banner update">
      <span>새 버전이 있어요.</span>
      <button onClick={() => updateServiceWorker(true)}>업데이트</button>
    </div>
  );
}
