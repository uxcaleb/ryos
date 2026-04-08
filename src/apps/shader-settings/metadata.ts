export const appMetadata = {
  name: "Shader Settings",
  version: "1.0.0",
  creator: {
    name: "Ryo Lu",
    url: "https://ryo.lu",
  },
  github: "https://github.com/ryokun6/ryos",
  icon: "/icons/default/shader-settings.png",
};

export const helpItems = [
  {
    icon: "🖥️",
    title: "Desktop shader",
    description:
      "Turn the animated desktop shader on or off and pick Galaxy, Aurora, or Nebula",
  },
  {
    icon: "🥁",
    title: "Beat reaction",
    description:
      "Increase beat sensitivity for stronger kick detection, or lengthen the tail for smoother decay",
  },
  {
    icon: "📊",
    title: "Analyzer smoothing",
    description:
      "Adjust FFT and band smoothing — lower values react faster; higher values look calmer",
  },
  {
    icon: "✨",
    title: "Visual motion",
    description:
      "Scales how much music drives shaders in Karaoke, iPod, and cover backgrounds",
  },
  {
    icon: "🎤",
    title: "Lyric pulse",
    description:
      "When YouTube hides audio analysis, scales pulses timed from lyrics",
  },
  {
    icon: "↩️",
    title: "Reset",
    description: "Restore music visualizer sliders to their factory defaults anytime",
  },
];
