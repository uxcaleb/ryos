import { useCallback, useRef, type ChangeEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { extractOutlineFromSvgString } from "@/utils/svgOutlineExtract";
import {
  DEFAULT_OUTLINE_PATHS,
  DEFAULT_OUTLINE_VIEWBOX,
  useSvgOutlineVisualizerStore,
  type SvgOutlineLibraryEntry,
  DEFAULT_OUTLINE_ENTRY_ID,
} from "@/stores/useSvgOutlineVisualizerStore";
import { Trash } from "@phosphor-icons/react";
function SvgOutlinePreview({
  paths,
  viewBox,
  className,
}: {
  paths: string[];
  viewBox: [number, number, number, number];
  className?: string;
}) {
  const [vx, vy, vw, vh] = viewBox;
  const strokeW = Math.max(0.8, Math.min(vw, vh) * 0.04);
  return (
    <svg
      viewBox={`${vx} ${vy} ${vw} ${vh}`}
      className={cn("block w-full h-full text-foreground", className)}
      preserveAspectRatio="xMidYMid meet"
    >
      {paths.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeW}
          vectorEffect="nonScalingStroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

interface SvgOutlineManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When user applies an outline, optionally switch iPod/Karaoke display mode. */
  onRequestRingDisplayMode?: () => void;
}

export function SvgOutlineManagerDialog({
  open,
  onOpenChange,
  onRequestRingDisplayMode,
}: SvgOutlineManagerDialogProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);

  const paths = useSvgOutlineVisualizerStore((s) => s.paths);
  const viewBox = useSvgOutlineVisualizerStore((s) => s.viewBox);
  const sourceLabel = useSvgOutlineVisualizerStore((s) => s.sourceLabel);
  const library = useSvgOutlineVisualizerStore((s) => s.library);
  const activeEntryId = useSvgOutlineVisualizerStore((s) => s.activeEntryId);

  const commitUpload = useSvgOutlineVisualizerStore((s) => s.commitUpload);
  const selectEntry = useSvgOutlineVisualizerStore((s) => s.selectEntry);
  const removeEntry = useSvgOutlineVisualizerStore((s) => s.removeEntry);
  const resetToDefault = useSvgOutlineVisualizerStore((s) => s.resetToDefault);

  const applyAndMaybeSwitchMode = useCallback(() => {
    onRequestRingDisplayMode?.();
  }, [onRequestRingDisplayMode]);

  const handleFile = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      try {
        const text = await f.text();
        const extracted = extractOutlineFromSvgString(text);
        if (!extracted?.paths.length) {
          toast.error(t("apps.ipod.menu.svgOutlineInvalid"));
          return;
        }
        commitUpload(extracted.paths, extracted.viewBox, f.name);
        toast.success(t("apps.ipod.menu.svgOutlineLoaded", { name: f.name }));
        applyAndMaybeSwitchMode();
      } catch {
        toast.error(t("apps.ipod.menu.svgOutlineReadError"));
      }
    },
    [commitUpload, t, applyAndMaybeSwitchMode],
  );

  const pickEntry = useCallback(
    (id: string) => {
      selectEntry(id);
      applyAndMaybeSwitchMode();
    },
    [selectEntry, applyAndMaybeSwitchMode],
  );

  const handleRemove = useCallback(
    (entry: SvgOutlineLibraryEntry, ev: React.MouseEvent) => {
      ev.stopPropagation();
      removeEntry(entry.id);
      toast.success(t("apps.ipod.menu.svgOutlineRemovedFromLibrary"));
    },
    [removeEntry, t],
  );

  const defaultSelected = activeEntryId === DEFAULT_OUTLINE_ENTRY_ID;
  const currentTitle = defaultSelected
    ? t("apps.ipod.menu.svgOutlineUseDefault")
    : sourceLabel ?? t("apps.ipod.menu.svgOutlineCustom");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("apps.ipod.menu.svgOutlineManagerTitle")}</DialogTitle>
          <DialogDescription>{t("apps.ipod.menu.svgOutlineManagerHint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t("apps.ipod.menu.svgOutlineCurrent")}
            </p>
            <div className="rounded-lg border bg-muted/30 p-4 aspect-[4/3] max-h-44 flex items-center justify-center">
              <SvgOutlinePreview paths={paths} viewBox={viewBox} className="max-h-36" />
            </div>
            <p className="text-xs mt-2 text-muted-foreground truncate" title={currentTitle}>
              {currentTitle}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".svg,image/svg+xml"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={() => fileRef.current?.click()}
            >
              {t("apps.ipod.menu.uploadSvgOutline")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                resetToDefault();
                applyAndMaybeSwitchMode();
                toast.success(t("apps.ipod.menu.svgOutlineReset"));
              }}
            >
              {t("apps.ipod.menu.resetSvgOutline")}
            </Button>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">
              {t("apps.ipod.menu.svgOutlineLibrary")}
            </p>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              <li>
                <button
                  type="button"
                  onClick={() => pickEntry(DEFAULT_OUTLINE_ENTRY_ID)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-md border px-2 py-2 text-left text-sm transition-colors",
                    defaultSelected
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-muted/60",
                  )}
                >
                  <span className="h-12 w-12 shrink-0 rounded bg-muted/50 p-1">
                    <SvgOutlinePreview
                      paths={[...DEFAULT_OUTLINE_PATHS]}
                      viewBox={[...DEFAULT_OUTLINE_VIEWBOX] as [number, number, number, number]}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {t("apps.ipod.menu.svgOutlineUseDefault")}
                  </span>
                  {defaultSelected && (
                    <span className="text-[10px] uppercase text-primary shrink-0">
                      {t("apps.ipod.menu.svgOutlineActive")}
                    </span>
                  )}
                </button>
              </li>
              {library.map((entry) => {
                const isActive = activeEntryId === entry.id;
                return (
                  <li key={entry.id}>
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-md border px-2 py-2 transition-colors",
                        isActive ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted/60",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => pickEntry(entry.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm"
                      >
                        <span className="h-12 w-12 shrink-0 rounded bg-muted/50 p-1">
                          <SvgOutlinePreview paths={entry.paths} viewBox={entry.viewBox} />
                        </span>
                        <span className="min-w-0 flex-1 truncate" title={entry.label}>
                          {entry.label}
                        </span>
                        {isActive && (
                          <span className="text-[10px] uppercase text-primary shrink-0">
                            {t("apps.ipod.menu.svgOutlineActive")}
                          </span>
                        )}
                      </button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label={t("apps.ipod.menu.svgOutlineRemove")}
                        onClick={(ev) => handleRemove(entry, ev)}
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.menu.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
