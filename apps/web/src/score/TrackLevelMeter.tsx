import { useCallback, useSyncExternalStore } from 'react';
import type { TrackLevelBus } from './trackLevels';

export function TrackLevelMeter({ bus, track, audible }: { bus: TrackLevelBus; track: number; audible: boolean }) {
  const subscribe = useCallback((listener: () => void) => bus.subscribe(track, listener), [bus, track]);
  const getSnapshot = useCallback(() => bus.getLevel(track), [bus, track]);
  const level = useSyncExternalStore(subscribe, getSnapshot, () => 0);
  const visibleLevel = audible ? level : 0;
  return (
    <span className={`track-meter ${audible ? '' : 'is-silent'}`} role="meter" aria-label={`声部 ${track + 1} 电平`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(visibleLevel * 100)}>
      <i style={{ transform: `scaleY(${visibleLevel})` }} />
    </span>
  );
}
