import Config from './config.js'

// The default matches the historical route defaults. The ceiling is
// operator-tunable because the right value depends on production data volume.
const DEFAULT_MAX = 1000

export async function pageLimit(requested, fallback = DEFAULT_MAX) {
  const cfg = await Config.get('http')
  const max = Number.isInteger(cfg.list_limit_max) && cfg.list_limit_max > 0
    ? cfg.list_limit_max
    : DEFAULT_MAX
  return Math.min(Math.max(1, Number.isInteger(requested) ? requested : fallback), max)
}
