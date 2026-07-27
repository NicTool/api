/**
 * Isolate a test from the environment's config overrides.
 *
 * `applyEnvOverrides` in lib/config.js lets the environment win over api.json,
 * which is what a container relies on — docker-compose.yml sets NICTOOL_DB_HOST
 * and NICTOOL_HTTP_HOST. A test asserting what a config *file* holds therefore
 * has to clear them, or it passes on a workstation and fails in Docker.
 */
const OVERRIDE_KEYS = [
  'NICTOOL_CONF_DIR',
  'NICTOOL_DATA_STORE',
  'NICTOOL_DATA_STORE_DSN',
  'NICTOOL_DATA_STORE_PATH',
  'NICTOOL_DB_HOST',
  'NICTOOL_DB_NAME',
  'NICTOOL_DB_PORT',
  'NICTOOL_DB_USER',
  'NICTOOL_DB_USER_PASSWORD',
  'NICTOOL_HTTP_HOST',
  'NICTOOL_HTTP_PORT',
]

export { OVERRIDE_KEYS }

/**
 * Clear every config override and return a function restoring what was there.
 *
 *   const restoreEnv = clearConfigEnv()
 *   after(restoreEnv)
 */
export function clearConfigEnv(keys = OVERRIDE_KEYS) {
  const saved = {}
  for (const key of keys) {
    saved[key] = process.env[key]
    delete process.env[key]
  }

  return function restore() {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
