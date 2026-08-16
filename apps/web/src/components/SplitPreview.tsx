import { useState } from 'react';
import type { ShotGroup } from '../domain';

interface Props {
  group: ShotGroup;
  assetUrls: Record<string, string>;
  onSwap?(from: number, to: number): void;
  compact?: boolean;
}

export function SplitPreview({ group, assetUrls, onSwap, compact = false }: Props) {
  const [dragIndex, setDragIndex] = useState<number>();
  const ordered = group.slotOrder.map((id) => group.shots.find((shot) => shot.id === id)).filter(Boolean);
  const style = group.layout.kind === 'horizontal'
    ? { gridTemplateColumns: `repeat(${group.layout.cells}, minmax(0, 1fr))` }
    : group.layout.kind === 'vertical'
      ? { gridTemplateRows: `repeat(${group.layout.cells}, minmax(0, 1fr))` }
      : group.layout.kind === 'grid'
        ? { gridTemplateColumns: `repeat(${group.layout.columns}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${group.layout.rows}, minmax(0, 1fr))` }
        : undefined;
  return (
    <div className={`split-preview layout-${group.layout.kind}${compact ? ' is-compact' : ''}`} style={style}>
      {ordered.map((shot, index) => shot && (
        <div
          className="split-cell"
          key={shot.id}
          draggable={Boolean(onSwap)}
          onDragStart={() => setDragIndex(index)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => { if (dragIndex !== undefined && dragIndex !== index) onSwap?.(dragIndex, index); setDragIndex(undefined); }}
        >
          {(shot.imageAssetId ?? shot.referenceAssetId) && assetUrls[shot.imageAssetId ?? shot.referenceAssetId!]
            ? <img src={assetUrls[shot.imageAssetId ?? shot.referenceAssetId!]} alt={`${shot.partName}示意图`} />
            : <div className="split-placeholder"><span>{shot.partName}</span><small>{shot.size}</small></div>}
        </div>
      ))}
    </div>
  );
}
