import { useEffect } from "react";
import { KeyboardRangeSetup } from "./components/KeyboardRangeSetup.tsx";
import { Layout } from "./components/Layout.tsx";
import { SkillCalibration } from "./components/SkillCalibration.tsx";
import { SongLibrary } from "./components/SongLibrary.tsx";
import { SongPlayer } from "./components/SongPlayer.tsx";
import { useMidi } from "./hooks/useMidi.ts";
import { useWakeLock } from "./hooks/useWakeLock.ts";
import { useAppStore } from "./store/appStore.ts";

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
        calibrationSubStep === "keyboard-range" ? (
          <KeyboardRangeSetup />
        ) : (
          <SkillCalibration />
        )
      ) : currentStage === "player" ? (
        <SongPlayer />
      ) : (
        <SongLibrary />
      )}
    </Layout>
  );
}
