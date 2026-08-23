import 'dotenv/config'
import * as path from 'node:path'

const serverRoot =
  path.basename(process.cwd()) === 'server'
    ? process.cwd()
    : path.resolve(process.cwd(), 'server')

function resolveConfiguredPath(value: string | undefined, fallback: string) {
  if (!value || value.trim() === '') {
    return fallback
  }

  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(serverRoot, value)
}

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) {
    return defaultValue
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parsePort(value: string | undefined, defaultValue: number) {
  const port = Number(value ?? defaultValue)

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`)
  }

  return port
}

export const serverPort = parsePort(process.env.PORT, 3001)

export const serverHost =
  process.env.HOST?.trim() || (process.env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0')

export const libraryRoot = path.resolve(
  resolveConfiguredPath(
    process.env.LIBRARY_ROOT,
    path.resolve(serverRoot, '../sample-library'),
  ),
)

export const writeSafetyRoot = resolveConfiguredPath(
  process.env.WRITE_SAFETY_ROOT,
  path.resolve(serverRoot, '.interactive-study-boox'),
)

export const gitSyncEnabled = parseBoolean(process.env.GIT_SYNC_ENABLED, false)

export const gitSyncBranch = process.env.GIT_SYNC_BRANCH?.trim() || null

export const gitSyncRemote = process.env.GIT_SYNC_REMOTE?.trim() || 'origin'
