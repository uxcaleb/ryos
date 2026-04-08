import { useMemo } from "react";
import type { ReactNode } from "react";
import { WindowFrame } from "@/components/layout/WindowFrame";
import { ShaderSettingsMenuBar } from "./ShaderSettingsMenuBar";
import { AppProps, type ControlPanelsInitialData } from "@/apps/base/types";
import { useShaderSettingsLogic } from "../hooks/useShaderSettingsLogic";
import { HelpDialog } from "@/components/dialogs/HelpDialog";
import { AboutDialog } from "@/components/dialogs/AboutDialog";
import { appMetadata } from "..";
import { useDisplaySettingsStore } from "@/stores/useDisplaySettingsStore";
import { useAudioShaderSettingsStore } from "@/stores/useAudioShaderSettingsStore";
import {
  useMusicVisualizerAppStore,
  type MusicVisualizerMode,
} from "@/stores/useMusicVisualizerAppStore";
import { useAppStore } from "@/stores/useAppStore";
import { ShaderType } from "@/types/shader";
import { DisplayMode } from "@/types/lyrics";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

function SettingSlider({
  labelKey,
  hintKey,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled = false,
}: {
  labelKey: string;
  hintKey: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const safe = Number.isFinite(value) ? value : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0">
          <Label className="text-[11px]">{t(labelKey)}</Label>
          <span className="text-[10px] text-neutral-600 font-geneva-12 leading-tight">
            {t(hintKey)}
          </span>
        </div>
        <span className="text-[11px] text-neutral-700 font-geneva-12 tabular-nums shrink-0">
          {format(safe)}
        </span>
      </div>
      <Slider
        value={[safe]}
        onValueChange={([v]) => onChange(v)}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        className="w-full"
      />
    </div>
  );
}

function Panel({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-md border border-black/10 bg-black/[0.02] p-3 space-y-3",
        className
      )}
    >
      <h2 className="text-[12px] font-semibold font-geneva-12 text-black/90">{title}</h2>
      {children}
    </section>
  );
}

export function ShaderSettingsAppComponent({
  isWindowOpen,
  onClose,
  isForeground,
  skipInitialSound,
  instanceId,
}: AppProps) {
  const { t } = useTranslation();
  const {
    translatedHelpItems,
    isXpTheme,
    isHelpDialogOpen,
    setIsHelpDialogOpen,
    isAboutDialogOpen,
    setIsAboutDialogOpen,
  } = useShaderSettingsLogic();

  const shaderEffectEnabled = useDisplaySettingsStore((s) => s.shaderEffectEnabled);
  const setShaderEffectEnabled = useDisplaySettingsStore((s) => s.setShaderEffectEnabled);
  const selectedShaderType = useDisplaySettingsStore((s) => s.selectedShaderType);
  const setSelectedShaderType = useDisplaySettingsStore((s) => s.setSelectedShaderType);
  const musicShaderEffectsEnabled = useDisplaySettingsStore(
    (s) => s.musicShaderEffectsEnabled ?? true
  );
  const setMusicShaderEffectsEnabled = useDisplaySettingsStore(
    (s) => s.setMusicShaderEffectsEnabled
  );
  const desktopShaderTintHex = useDisplaySettingsStore((s) => s.desktopShaderTintHex);
  const setDesktopShaderTintHex = useDisplaySettingsStore((s) => s.setDesktopShaderTintHex);
  const desktopShaderTintMix = useDisplaySettingsStore((s) => s.desktopShaderTintMix);
  const setDesktopShaderTintMix = useDisplaySettingsStore((s) => s.setDesktopShaderTintMix);
  const desktopShaderSaturation = useDisplaySettingsStore((s) => s.desktopShaderSaturation);
  const setDesktopShaderSaturation = useDisplaySettingsStore((s) => s.setDesktopShaderSaturation);
  const resetDesktopShaderColors = useDisplaySettingsStore((s) => s.resetDesktopShaderColors);

  const beatSensitivity = useAudioShaderSettingsStore((s) => s.beatSensitivity);
  const setBeatSensitivity = useAudioShaderSettingsStore((s) => s.setBeatSensitivity);
  const beatTail = useAudioShaderSettingsStore((s) => s.beatTail);
  const setBeatTail = useAudioShaderSettingsStore((s) => s.setBeatTail);
  const fftSmoothing = useAudioShaderSettingsStore((s) => s.fftSmoothing);
  const setFftSmoothing = useAudioShaderSettingsStore((s) => s.setFftSmoothing);
  const bandSmoothing = useAudioShaderSettingsStore((s) => s.bandSmoothing);
  const setBandSmoothing = useAudioShaderSettingsStore((s) => s.setBandSmoothing);
  const lyricPulse = useAudioShaderSettingsStore((s) => s.lyricPulse);
  const setLyricPulse = useAudioShaderSettingsStore((s) => s.setLyricPulse);
  const visualMotion = useAudioShaderSettingsStore((s) => s.visualMotion);
  const setVisualMotion = useAudioShaderSettingsStore((s) => s.setVisualMotion);
  const resetToDefaults = useAudioShaderSettingsStore((s) => s.resetToDefaults);

  const musicVisualizerMode = useMusicVisualizerAppStore((s) => s.mode);
  const setMusicVisualizerMode = useMusicVisualizerAppStore((s) => s.setMode);
  const launchApp = useAppStore((s) => s.launchApp);

  const shaderTypeValues = useMemo(
    () => new Set<string>(Object.values(ShaderType)),
    []
  );
  const shaderSelectValue = shaderTypeValues.has(selectedShaderType)
    ? selectedShaderType
    : ShaderType.AURORA;

  const tintColorForInput = useMemo(() => {
    const raw = desktopShaderTintHex?.trim() ?? "#ffffff";
    const m = /^#?([0-9a-fA-F]{6})$/.exec(raw);
    return m ? `#${m[1]}` : "#ffffff";
  }, [desktopShaderTintHex]);

  const openAppearance = () => {
    launchApp("control-panels", {
      defaultTab: "appearance",
    } satisfies ControlPanelsInitialData);
  };

  const resetAllShaderSettings = () => {
    resetToDefaults();
    resetDesktopShaderColors();
    setMusicVisualizerMode(DisplayMode.VisualizerNeural);
  };

  const menuBar = (
    <ShaderSettingsMenuBar
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
        title={t("apps.shader-settings.title")}
        onClose={onClose}
        isForeground={isForeground}
        appId="shader-settings"
        skipInitialSound={skipInitialSound}
        instanceId={instanceId}
        menuBar={isXpTheme ? menuBar : undefined}
      >
        <div className="flex flex-col h-full min-h-0 bg-os-window-bg font-os-ui overflow-hidden">
          <div className="shrink-0 px-4 pt-3 pb-2 border-b border-black/10 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <p className="text-[10px] text-neutral-600 font-geneva-12 leading-snug max-w-[520px]">
              {t("apps.shader-settings.intro")}
            </p>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={openAppearance}
              >
                {t("apps.shader-settings.openAppearance")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={resetAllShaderSettings}
              >
                {t("apps.shader-settings.resetAll")}
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4 py-3 space-y-4 pb-6">
              <Panel title={t("apps.shader-settings.sections.desktop")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <Label className="text-[11px]">{t("apps.shader-settings.desktop.shaderEffect")}</Label>
                    <span className="text-[10px] text-neutral-600 font-geneva-12">
                      {t("apps.shader-settings.desktop.shaderEffectHint")}
                    </span>
                  </div>
                  <Switch
                    checked={shaderEffectEnabled}
                    onCheckedChange={setShaderEffectEnabled}
                    className="data-[state=checked]:bg-[#000000] shrink-0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">{t("apps.shader-settings.desktop.shaderType")}</Label>
                  <Select
                    value={shaderSelectValue}
                    onValueChange={(v) => setSelectedShaderType(v as ShaderType)}
                    disabled={!shaderEffectEnabled}
                  >
                    <SelectTrigger className="w-full h-8 text-[11px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ShaderType.GALAXY}>
                        {t("apps.internet-explorer.galaxy")}
                      </SelectItem>
                      <SelectItem value={ShaderType.AURORA}>
                        {t("apps.internet-explorer.aurora")}
                      </SelectItem>
                      <SelectItem value={ShaderType.NEBULA}>
                        {t("apps.internet-explorer.nebula")}
                      </SelectItem>
                      <SelectItem value={ShaderType.PINK_TRAIL_AURORA}>
                        {t("apps.internet-explorer.pinkTrailAurora")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <h3 className="text-[11px] font-semibold font-geneva-12">
                    {t("apps.shader-settings.desktop.colorsTitle")}
                  </h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={!shaderEffectEnabled}
                    onClick={() => resetDesktopShaderColors()}
                  >
                    {t("apps.shader-settings.desktop.resetColors")}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col gap-0.5">
                    <Label className="text-[10px] text-neutral-600">
                      {t("apps.shader-settings.desktop.tintColor")}
                    </Label>
                    <input
                      type="color"
                      value={tintColorForInput}
                      onChange={(e) => setDesktopShaderTintHex(e.target.value)}
                      disabled={!shaderEffectEnabled}
                      className="h-8 w-14 cursor-pointer rounded border border-black/20 bg-white p-0 disabled:opacity-50"
                      aria-label={t("apps.shader-settings.desktop.tintColor")}
                    />
                  </div>
                  <div className="flex-1 min-w-[160px] space-y-1">
                    <SettingSlider
                      labelKey="apps.shader-settings.desktop.tintMix.label"
                      hintKey="apps.shader-settings.desktop.tintMix.hint"
                      value={desktopShaderTintMix}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={setDesktopShaderTintMix}
                      format={(v) => `${Math.round(v * 100)}%`}
                      disabled={!shaderEffectEnabled}
                    />
                  </div>
                </div>
                <SettingSlider
                  labelKey="apps.shader-settings.desktop.saturation.label"
                  hintKey="apps.shader-settings.desktop.saturation.hint"
                  value={desktopShaderSaturation}
                  min={0}
                  max={2}
                  step={0.05}
                  onChange={setDesktopShaderSaturation}
                  format={(v) => v.toFixed(2)}
                  disabled={!shaderEffectEnabled}
                />
              </Panel>

              <Panel title={t("apps.shader-settings.sections.visualizer")}>
                <p className="text-[10px] text-neutral-600 font-geneva-12 leading-snug -mt-1">
                  {t("apps.shader-settings.visualizerStyleHint")}
                </p>
                <div className="space-y-1">
                  <Label className="text-[11px]">{t("apps.music-visualizer.modeLabel")}</Label>
                  <Select
                    value={musicVisualizerMode}
                    onValueChange={(v) => setMusicVisualizerMode(v as MusicVisualizerMode)}
                  >
                    <SelectTrigger className="w-full h-8 text-[11px] sm:max-w-[280px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DisplayMode.VisualizerNeural}>
                        {t("apps.music-visualizer.modes.neural")}
                      </SelectItem>
                      <SelectItem value={DisplayMode.VisualizerBlobs}>
                        {t("apps.music-visualizer.modes.blobs")}
                      </SelectItem>
                      <SelectItem value={DisplayMode.VisualizerSwirl}>
                        {t("apps.music-visualizer.modes.swirl")}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Panel>

              <Panel title={t("apps.shader-settings.sections.music")}>
                <div className="flex justify-end -mt-1 mb-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => resetToDefaults()}
                  >
                    {t("apps.shader-settings.music.resetDefaults")}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <Label className="text-[11px]">{t("apps.shader-settings.music.reactiveEnabled")}</Label>
                    <span className="text-[10px] text-neutral-600 font-geneva-12">
                      {t("apps.shader-settings.music.reactiveEnabledHint")}
                    </span>
                  </div>
                  <Switch
                    checked={musicShaderEffectsEnabled}
                    onCheckedChange={setMusicShaderEffectsEnabled}
                    className="data-[state=checked]:bg-[#000000] shrink-0"
                  />
                </div>

                <SettingSlider
                  labelKey="apps.shader-settings.music.beatSensitivity.label"
                  hintKey="apps.shader-settings.music.beatSensitivity.hint"
                  value={beatSensitivity}
                  min={0.25}
                  max={2}
                  step={0.05}
                  onChange={setBeatSensitivity}
                  format={(v) => v.toFixed(2)}
                  disabled={!musicShaderEffectsEnabled}
                />
                <SettingSlider
                  labelKey="apps.shader-settings.music.beatTail.label"
                  hintKey="apps.shader-settings.music.beatTail.hint"
                  value={beatTail}
                  min={0.78}
                  max={0.94}
                  step={0.01}
                  onChange={setBeatTail}
                  format={(v) => v.toFixed(2)}
                  disabled={!musicShaderEffectsEnabled}
                />
                <SettingSlider
                  labelKey="apps.shader-settings.music.fftSmoothing.label"
                  hintKey="apps.shader-settings.music.fftSmoothing.hint"
                  value={fftSmoothing}
                  min={0.1}
                  max={0.95}
                  step={0.01}
                  onChange={setFftSmoothing}
                  format={(v) => v.toFixed(2)}
                  disabled={!musicShaderEffectsEnabled}
                />
                <SettingSlider
                  labelKey="apps.shader-settings.music.bandSmoothing.label"
                  hintKey="apps.shader-settings.music.bandSmoothing.hint"
                  value={bandSmoothing}
                  min={0.15}
                  max={0.55}
                  step={0.01}
                  onChange={setBandSmoothing}
                  format={(v) => v.toFixed(2)}
                  disabled={!musicShaderEffectsEnabled}
                />
                <SettingSlider
                  labelKey="apps.shader-settings.music.lyricPulse.label"
                  hintKey="apps.shader-settings.music.lyricPulse.hint"
                  value={lyricPulse}
                  min={0.25}
                  max={2}
                  step={0.05}
                  onChange={setLyricPulse}
                  format={(v) => v.toFixed(2)}
                  disabled={!musicShaderEffectsEnabled}
                />
                <SettingSlider
                  labelKey="apps.shader-settings.music.visualMotion.label"
                  hintKey="apps.shader-settings.music.visualMotion.hint"
                  value={visualMotion}
                  min={0.25}
                  max={2}
                  step={0.05}
                  onChange={setVisualMotion}
                  format={(v) => v.toFixed(2)}
                  disabled={!musicShaderEffectsEnabled}
                />
              </Panel>
            </div>
          </ScrollArea>
        </div>
      </WindowFrame>
      <HelpDialog
        isOpen={isHelpDialogOpen}
        onOpenChange={setIsHelpDialogOpen}
        appId="shader-settings"
        helpItems={translatedHelpItems}
      />
      <AboutDialog
        isOpen={isAboutDialogOpen}
        onOpenChange={setIsAboutDialogOpen}
        metadata={appMetadata}
        appId="shader-settings"
      />
    </>
  );
}
