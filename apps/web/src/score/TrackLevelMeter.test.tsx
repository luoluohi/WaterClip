import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TrackLevelMeter } from './TrackLevelMeter';
import { NOTE_ON, TrackLevelBus } from './trackLevels';

describe('TrackLevelMeter', () => {
  const buses: TrackLevelBus[] = [];
  afterEach(() => {
    cleanup();
    buses.splice(0).forEach((bus) => bus.destroy());
  });

  it('renders the velocity emitted by the playback event bus', () => {
    const bus = new TrackLevelBus();
    buses.push(bus);
    render(<TrackLevelMeter bus={bus} track={3} audible />);

    act(() => bus.ingest([{ track: 3, type: NOTE_ON, channel: 0, noteKey: 60, noteVelocity: 96 }]));

    const meter = screen.getByRole('meter', { name: '声部 4 电平' });
    expect(meter).toHaveAttribute('aria-valuenow', '76');
    expect(meter.firstElementChild).toHaveStyle({ transform: `scaleY(${96 / 127})` });
  });

  it('visually gates an otherwise active signal when the track is muted', () => {
    const bus = new TrackLevelBus();
    buses.push(bus);
    const view = render(<TrackLevelMeter bus={bus} track={0} audible />);
    act(() => bus.ingest([{ track: 0, type: NOTE_ON, noteKey: 60, noteVelocity: 127 }]));
    view.rerender(<TrackLevelMeter bus={bus} track={0} audible={false} />);

    expect(screen.getByRole('meter')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('meter')).toHaveClass('is-silent');
  });
});
