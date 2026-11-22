import { lazy, Suspense, useEffect } from "react";
import { Layout } from "./components/Layout.tsx";
import { SongLibrary } from "./components/SongLibrary.tsx";
import { useMidi } from "./hooks/useMidi.ts";
import { useWakeLock } from "./hooks/useWakeLock.ts";
import { useAppStore } from "./store/appStore.ts";

const KeyboardRangeSetup = lazy(() =>
  import("./components/KeyboardRangeSetup.tsx").then((m) => ({ default: m.KeyboardRangeSetup })),
);
const SkillCalibration = lazy(() =>
  import("./components/SkillCalibration.tsx").then((m) => ({ default: m.SkillCalibration })),
);
const SongPlayer = lazy(() =>
  import("./components/SongPlayer.tsx").then((m) => ({ default: m.SongPlayer })),
);

function StageFallback() {
  return (
    <div className="flex-1 flex items-center justify-center text-slate-400 text-lg">Loading…</div>
  );
}

export function App() {
  useMidi();

  const bootstrap = useAppStore((s) => s.bootstrap);
  const profileLoaded = useAppStore((s) => s.profileLoaded);
  const currentStage = useAppStore((s) => s.currentStage);
  const calibrationSubStep = useAppStore((s) => s.calibrationSubStep);

  useWakeLock(currentStage === "player" || currentStage === "calibration");

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <Layout>
      {!profileLoaded ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-lg">
          Loading Piano Studio…
        </div>
      ) : currentStage === "calibration" ? (
        <Suspense fallback={<StageFallback />}>
          {calibrationSubStep === "keyboard-range" ? <KeyboardRangeSetup /> : <SkillCalibration />}
        </Suspense>
      ) : currentStage === "player" ? (
        <Suspense fallback={<StageFallback />}>
          <SongPlayer />
        </Suspense>
      ) : (
        <SongLibrary />
      )}
    </Layout>
  );
}
