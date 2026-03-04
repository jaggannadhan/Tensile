export interface Timer {
  startedAt: string;
  startMs: number;
}

export function startTimer(): Timer {
  return {
    startedAt: new Date().toISOString(),
    startMs: Date.now(),
  };
}

export function stopTimer(timer: Timer): {
  startedAt: string;
  endedAt: string;
  durationMs: number;
} {
  const endMs = Date.now();
  return {
    startedAt: timer.startedAt,
    endedAt: new Date().toISOString(),
    durationMs: endMs - timer.startMs,
  };
}
