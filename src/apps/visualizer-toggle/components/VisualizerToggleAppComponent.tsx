import { WindowFrame } from "@/components/layout/WindowFrame";
import { AppProps } from "@/apps/base/types";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { appMetadata } from "..";
import { useVisualizerToggleLogic } from "../hooks/useVisualizerToggleLogic";
import { VisualizerToggleMenuBar } from "./VisualizerToggleMenuBar";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { Button } from "@/components/ui/button";

export function VisualizerToggleAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const {
    t,
    translatedHelpItems,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useVisualizerToggleLogic({ instanceId });

  const musicShaderEffectsEnabled = useDisplaySettingsStore(
    (s) => s.musicShaderEffectsEnabled ?? true,
  );
  const setMusicShaderEffectsEnabled = useDisplaySettingsStore(
    (s) => s.setMusicShaderEffectsEnabled,
  );

  const menuBar = (
    <VisualizerToggleMenuBar
      onClose={onClose}
      onShowHelp={() => setIsHelpDialogOpen(true)}
      onShowAbout={() => setIsAboutDialogOpen(true)}
    />
  );

  if (!isWindowOpen) return null;

  return (
    <>
      {!isXpTheme && isForeground && menuBar}
      <WindowFrame
        title={t("apps.visualizer-toggle.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="visualizer-toggle"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="flex h-full flex-col bg-os-window-bg p-4 font-os-ui">
          <p className="mb-3 text-center text-sm text-os-text-secondary">
            {t("apps.visualizer-toggle.hint")}
          </p>
          <Button
            type="button"
            variant="default"
            aria-pressed={musicShaderEffectsEnabled}
            className="min-h-[88px] h-auto w-full flex-1 py-6 text-base font-semibold"
            onClick={() => setMusicShaderEffectsEnabled(!musicShaderEffectsEnabled)}
          >
            {musicShaderEffectsEnabled
              ? t("apps.visualizer-toggle.buttonOn")
              : t("apps.visualizer-toggle.buttonOff")}
          </Button>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="visualizer-toggle"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="visualizer-toggle"
      />
    </>
  );
}
