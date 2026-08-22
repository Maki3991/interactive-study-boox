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
