import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Default: simple circle outline (matches “logo in the middle” reference). */
export const DEFAULT_OUTLINE_PATHS = [
  "M 0 -42 A 42 42 0 1 1 0 42 A 42 42 0 1 1 0 -42",
];

export const DEFAULT_OUTLINE_VIEWBOX: [number, number, number, number] = [-48, -48, 96, 96];

export const DEFAULT_OUTLINE_ENTRY_ID = "__ryos_default_circle__";

export type SvgOutlineLibraryEntry = {
  id: string;
  label: string;
  paths: string[];
  viewBox: [number, number, number, number];
  addedAt: number;
};

export function outlineSignature(
  paths: string[],
  viewBox: [number, number, number, number],
): string {
  return JSON.stringify({ p: paths, v: viewBox });
}

function clonePaths(paths: string[]): string[] {
  return [...paths];
}

function cloneViewBox(v: [number, number, number, number]): [number, number, number, number] {
  return [v[0], v[1], v[2], v[3]];
}

interface SvgOutlineVisualizerState {
  paths: string[];
  viewBox: [number, number, number, number];
  sourceLabel: string | null;
  activeEntryId: string;
  library: SvgOutlineLibraryEntry[];

  setOutline: (
    paths: string[],
    viewBox: [number, number, number, number],
    sourceLabel: string | null,
  ) => void;
  commitUpload: (
    paths: string[],
    viewBox: [number, number, number, number],
    label: string,
  ) => void;
  selectEntry: (id: string) => void;
  removeEntry: (id: string) => void;
  resetToDefault: () => void;
}

const STORE_VERSION = 2;

export const useSvgOutlineVisualizerStore = create<SvgOutlineVisualizerState>()(
  persist(
    (set, get) => ({
      paths: clonePaths(DEFAULT_OUTLINE_PATHS),
      viewBox: cloneViewBox(DEFAULT_OUTLINE_VIEWBOX),
      sourceLabel: null,
      activeEntryId: DEFAULT_OUTLINE_ENTRY_ID,
      library: [],

      setOutline: (paths, viewBox, sourceLabel) =>
        set({
          paths: paths.length ? clonePaths(paths) : clonePaths(DEFAULT_OUTLINE_PATHS),
          viewBox: cloneViewBox(viewBox),
          sourceLabel,
        }),

      commitUpload: (paths, viewBox, label) => {
        const sig = outlineSignature(paths, viewBox);
        const state = get();
        let nextLibrary = [...state.library];
        const existing = nextLibrary.find((e) => outlineSignature(e.paths, e.viewBox) === sig);
        let id: string;
        if (existing) {
          id = existing.id;
          nextLibrary = nextLibrary.map((e) =>
            e.id === id ? { ...e, label, addedAt: Date.now() } : e,
          );
        } else {
          id = crypto.randomUUID();
          nextLibrary.push({
            id,
            label,
            paths: clonePaths(paths),
            viewBox: cloneViewBox(viewBox),
            addedAt: Date.now(),
          });
        }
        set({
          paths: clonePaths(paths),
          viewBox: cloneViewBox(viewBox),
          sourceLabel: label,
          activeEntryId: id,
          library: nextLibrary,
        });
      },

      selectEntry: (id) => {
        if (id === DEFAULT_OUTLINE_ENTRY_ID) {
          set({
            paths: clonePaths(DEFAULT_OUTLINE_PATHS),
            viewBox: cloneViewBox(DEFAULT_OUTLINE_VIEWBOX),
            sourceLabel: null,
            activeEntryId: DEFAULT_OUTLINE_ENTRY_ID,
          });
          return;
        }
        const entry = get().library.find((e) => e.id === id);
        if (!entry) return;
        set({
          paths: clonePaths(entry.paths),
          viewBox: cloneViewBox(entry.viewBox),
          sourceLabel: entry.label,
          activeEntryId: id,
        });
      },

      removeEntry: (id) => {
        const state = get();
        const nextLibrary = state.library.filter((e) => e.id !== id);
        const removedActive = state.activeEntryId === id;
        const patch: Partial<SvgOutlineVisualizerState> = { library: nextLibrary };
        if (removedActive) {
          patch.paths = clonePaths(DEFAULT_OUTLINE_PATHS);
          patch.viewBox = cloneViewBox(DEFAULT_OUTLINE_VIEWBOX);
          patch.sourceLabel = null;
          patch.activeEntryId = DEFAULT_OUTLINE_ENTRY_ID;
        }
        set(patch);
      },

      resetToDefault: () =>
        set({
          paths: clonePaths(DEFAULT_OUTLINE_PATHS),
          viewBox: cloneViewBox(DEFAULT_OUTLINE_VIEWBOX),
          sourceLabel: null,
          activeEntryId: DEFAULT_OUTLINE_ENTRY_ID,
        }),
    }),
    {
      name: "ryos:svg-outline-visualizer",
      version: STORE_VERSION,
      partialize: (s) => ({
        paths: s.paths,
        viewBox: s.viewBox,
        sourceLabel: s.sourceLabel,
        activeEntryId: s.activeEntryId,
        library: s.library,
      }),
      merge: (persistedState, currentState) => {
        type P = Partial<SvgOutlineVisualizerState>;
        const p = (persistedState as P) ?? {};
        const merged: SvgOutlineVisualizerState = {
          ...currentState,
          ...p,
          paths:
            Array.isArray(p.paths) && p.paths.length
              ? clonePaths(p.paths)
              : clonePaths(DEFAULT_OUTLINE_PATHS),
          viewBox:
            Array.isArray(p.viewBox) && p.viewBox.length === 4
              ? cloneViewBox(p.viewBox as [number, number, number, number])
              : cloneViewBox(DEFAULT_OUTLINE_VIEWBOX),
          sourceLabel: p.sourceLabel ?? null,
          library: Array.isArray(p.library)
            ? p.library.map((e) => ({
                ...e,
                paths: clonePaths(e.paths),
                viewBox: cloneViewBox(e.viewBox),
              }))
            : [],
          activeEntryId:
            typeof p.activeEntryId === "string" && p.activeEntryId.length > 0
              ? p.activeEntryId
              : DEFAULT_OUTLINE_ENTRY_ID,
        };

        const defSig = outlineSignature(DEFAULT_OUTLINE_PATHS, DEFAULT_OUTLINE_VIEWBOX);
        const curSig = outlineSignature(merged.paths, merged.viewBox);

        if (merged.library.length === 0 && curSig !== defSig) {
          const id = "legacy-migrated-outline";
          merged.library = [
            {
              id,
              label: merged.sourceLabel ?? "Imported",
              paths: clonePaths(merged.paths),
              viewBox: cloneViewBox(merged.viewBox),
              addedAt: Date.now(),
            },
          ];
          merged.activeEntryId = id;
        }

        return merged;
      },
    },
  ),
);
