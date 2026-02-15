interface DictationWaveformProps {
  levels: number[];
  active: boolean;
}

export function DictationWaveform({ levels, active }: DictationWaveformProps) {
  return (
    <div className="flex items-center gap-[2px] h-8 min-w-[130px] sm:min-w-[180px]">
      {levels.map((level, i) => {
        const clamped = Math.max(0.01, Math.min(1, level));
        const spiked = Math.pow(clamped, 0.55);
        const height = Math.round(2 + spiked * 24);
        return (
          <span
            key={i}
            className={`w-[2px] rounded-full transition-all duration-100 ${
              active ? "bg-cc-fg" : "bg-cc-muted/60"
            }`}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
}
