let counters: Record<string, number> = {}

function inc(name: string, labels?: Record<string, string>) {
  const key = name + ':' + JSON.stringify(labels || {})
  counters[key] = (counters[key] || 0) + 1
}

export const metrics = {
  incRedemptionAttempts: (status: 'ok' | 'invalid' | 'error') => {
    inc('redemption_attempts_total', { status })
  },
  observeDisbursementDuration: (_seconds: number) => {},
}
