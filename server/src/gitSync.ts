import { execFile as execFileCallback } from 'node:child_process'
import * as path from 'node:path'
import { promisify } from 'node:util'
import {
  gitSyncBranch,
  gitSyncEnabled,
  gitSyncRemote,
  libraryRoot,
} from './config.js'

const execFile = promisify(execFileCallback)
const maxGitOutputBytes = 2 * 1024 * 1024

export type SyncState = 'disabled' | 'clean' | 'pending' | 'conflict' | 'offline'

export interface SyncStatus {
  state: SyncState
  repositoryName: string | null
  branch: string | null
  changedFiles: string[]
  ahead: number
  behind: number
  conflictFiles: string[]
  lastSyncedCommit: string | null
  message?: string
  blockedFiles?: string[]
}

export interface SyncPushResult {
  state: 'clean'
  commitHash: string
  commitMessage: string
  syncedFiles: string[]
  syncedAt: string
}

export class GitSyncError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'GitSyncError'
  }
}

interface GitInspection {
  repositoryRoot: string
  repositoryName: string
  branch: string
  changedFiles: string[]
  blockedFiles: string[]
  upstream: string | null
  ahead: number
  behind: number
  head: string | null
  lastSyncedCommit: string | null
  hasRemote: boolean
}

function normalizeRelativePath(filePath: string) {
  return path.posix.normalize(filePath.replaceAll('\\', '/'))
}

function isAllowedSyncPath(filePath: string) {
  const relativePath = normalizeRelativePath(filePath)

  if (
    relativePath === '.' ||
    relativePath.startsWith('../') ||
    path.posix.isAbsolute(relativePath) ||
    !relativePath.toLowerCase().endsWith('.md')
  ) {
    return false
  }

  if (
    relativePath === '.env' ||
    relativePath.startsWith('.git/') ||
    relativePath.startsWith('node_modules/') ||
    relativePath.startsWith('dist/') ||
    relativePath.startsWith('server/.interactive-study-boox/')
  ) {
    return false
  }

  return true
}

async function runGit(args: string[], repositoryRoot: string) {
  try {
    const result = await execFile('git', args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: maxGitOutputBytes,
    })

    return String(result.stdout).trimEnd()
  } catch {
    throw new GitSyncError(
      'GIT_COMMAND_FAILED',
      503,
      'Git 操作失败，请检查 VPS 上的 Git、远程仓库和凭据配置。',
    )
  }
}

async function runGitOptional(args: string[], repositoryRoot: string) {
  try {
    return await runGit(args, repositoryRoot)
  } catch (error) {
    if (error instanceof GitSyncError) {
      return null
    }

    throw error
  }
}

async function resolveRepositoryRoot() {
  try {
    const detectedRoot = path.resolve(await runGit(['rev-parse', '--show-toplevel'], libraryRoot))
    const configuredRoot = path.resolve(libraryRoot)

    if (detectedRoot !== configuredRoot) {
      throw new GitSyncError(
        'GIT_ROOT_MISMATCH',
        409,
        '学习工作区必须正好是私有学习资料仓库的根目录，不能指向其中的子目录。',
      )
    }

    return detectedRoot
  } catch (error) {
    if (error instanceof GitSyncError && error.code === 'GIT_ROOT_MISMATCH') {
      throw error
    }

    throw new GitSyncError(
      'GIT_REPOSITORY_NOT_FOUND',
      409,
      '当前学习工作区不是可同步的 Git 仓库。',
    )
  }
}

async function getCurrentBranch(repositoryRoot: string) {
  const branch = await runGit(['branch', '--show-current'], repositoryRoot)

  if (branch === '') {
    throw new GitSyncError(
      'GIT_DETACHED_HEAD',
      409,
      '当前 Git 仓库处于 detached HEAD，不能安全同步。',
    )
  }

  if (gitSyncBranch !== null && branch !== gitSyncBranch) {
    throw new GitSyncError(
      'GIT_BRANCH_MISMATCH',
      409,
      '当前分支不是配置的同步分支：' + gitSyncBranch,
    )
  }

  return branch
}

async function getChangedFiles(repositoryRoot: string) {
  const output = await runGit(
    ['status', '--porcelain=v1', '--untracked-files=all'],
    repositoryRoot,
  )
  const changedFiles = new Set<string>()

  for (const line of output.split(/\r?\n/)) {
    if (line.length < 4) {
      continue
    }

    const status = line.slice(0, 2)
    let relativePath = line.slice(3).trim()

    if (status.includes('R') || status.includes('C')) {
      const renameSeparator = relativePath.lastIndexOf(' -> ')

      if (renameSeparator >= 0) {
        relativePath = relativePath.slice(renameSeparator + 4)
      }
    }

    const normalizedPath = normalizeRelativePath(relativePath)

    if (normalizedPath !== '.') {
      changedFiles.add(normalizedPath)
    }
  }

  return [...changedFiles].sort()
}

async function getUpstream(repositoryRoot: string) {
  return runGitOptional(
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    repositoryRoot,
  )
}

async function getAheadBehind(repositoryRoot: string, upstream: string | null) {
  if (!upstream) {
    return { ahead: 0, behind: 0 }
  }

  const output = await runGit(
    ['rev-list', '--left-right', '--count', 'HEAD...' + upstream],
    repositoryRoot,
  )
  const [aheadText, behindText] = output.split(/\s+/)
  const ahead = Number.parseInt(aheadText ?? '0', 10)
  const behind = Number.parseInt(behindText ?? '0', 10)

  return {
    ahead: Number.isNaN(ahead) ? 0 : ahead,
    behind: Number.isNaN(behind) ? 0 : behind,
  }
}

async function inspectRepository(repositoryRoot: string): Promise<GitInspection> {
  const branch = await getCurrentBranch(repositoryRoot)
  const changedFiles = await getChangedFiles(repositoryRoot)
  const upstream = await getUpstream(repositoryRoot)
  const { ahead, behind } = await getAheadBehind(repositoryRoot, upstream)
  const head = await runGitOptional(['rev-parse', 'HEAD'], repositoryRoot)
  const lastSyncedCommit = upstream
    ? await runGitOptional(['rev-parse', upstream], repositoryRoot)
    : head
  const remoteUrl = await runGitOptional(['remote', 'get-url', gitSyncRemote], repositoryRoot)
  const blockedFiles = changedFiles.filter((filePath) => !isAllowedSyncPath(filePath))

  return {
    repositoryRoot,
    repositoryName: path.basename(repositoryRoot),
    branch,
    changedFiles: changedFiles.filter((filePath) => isAllowedSyncPath(filePath)),
    blockedFiles,
    upstream,
    ahead,
    behind,
    head,
    lastSyncedCommit,
    hasRemote: remoteUrl !== null,
  }
}

function toStatus(inspection: GitInspection): SyncStatus {
  let state: SyncState = 'clean'
  let message: string | undefined

  if (inspection.blockedFiles.length > 0) {
    state = 'conflict'
    message = '工作区包含不允许同步的文件，请先处理这些文件。'
  } else if (inspection.behind > 0) {
    state = 'conflict'
    message = '远程仓库有 VPS 尚未拉取的修改，暂不执行强制覆盖。'
  } else if (inspection.changedFiles.length > 0 || inspection.ahead > 0) {
    state = 'pending'
  }

  if (!inspection.hasRemote) {
    state = 'offline'
    message = '当前 Git 仓库没有配置可用的远程仓库。'
  }

  return {
    state,
    repositoryName: inspection.repositoryName,
    branch: inspection.branch,
    changedFiles: inspection.changedFiles,
    ahead: inspection.ahead,
    behind: inspection.behind,
    conflictFiles: inspection.blockedFiles,
    lastSyncedCommit: inspection.lastSyncedCommit,
    ...(message ? { message } : {}),
    ...(inspection.blockedFiles.length > 0
      ? { blockedFiles: inspection.blockedFiles }
      : {}),
  }
}

export async function getSyncStatus(): Promise<SyncStatus> {
  if (!gitSyncEnabled) {
    return {
      state: 'disabled',
      repositoryName: null,
      branch: null,
      changedFiles: [],
      ahead: 0,
      behind: 0,
      conflictFiles: [],
      lastSyncedCommit: null,
      message: 'Git 同步尚未启用。',
    }
  }

  try {
    const repositoryRoot = await resolveRepositoryRoot()
    return toStatus(await inspectRepository(repositoryRoot))
  } catch (error) {
    if (error instanceof GitSyncError) {
      return {
        state: 'offline',
        repositoryName: path.basename(libraryRoot),
        branch: null,
        changedFiles: [],
        ahead: 0,
        behind: 0,
        conflictFiles: [],
        lastSyncedCommit: null,
        message: error.message,
      }
    }

    return {
      state: 'offline',
      repositoryName: path.basename(libraryRoot),
      branch: null,
      changedFiles: [],
      ahead: 0,
      behind: 0,
      conflictFiles: [],
      lastSyncedCommit: null,
      message: '无法读取 Git 同步状态。',
    }
  }
}

function normalizeCommitMessage(message: unknown) {
  if (typeof message !== 'string') {
    return 'study: sync learning notes'
  }

  const firstLine = message.split(/\r?\n/)[0]?.trim().slice(0, 160)
  return firstLine || 'study: sync learning notes'
}

export async function pushSync(message: unknown): Promise<SyncPushResult> {
  if (!gitSyncEnabled) {
    throw new GitSyncError('GIT_SYNC_DISABLED', 409, 'Git 同步尚未启用。')
  }

  const repositoryRoot = await resolveRepositoryRoot()
  const branch = await getCurrentBranch(repositoryRoot)
  const remoteUrl = await runGitOptional(['remote', 'get-url', gitSyncRemote], repositoryRoot)

  if (remoteUrl === null) {
    throw new GitSyncError(
      'GIT_REMOTE_NOT_CONFIGURED',
      503,
      '当前 Git 仓库没有配置可用的远程仓库。',
    )
  }

  try {
    await runGit(['fetch', '--quiet', '--prune', gitSyncRemote], repositoryRoot)
  } catch (error) {
    if (error instanceof GitSyncError) {
      throw new GitSyncError(
        'GIT_REMOTE_UNAVAILABLE',
        503,
        '无法从 GitHub 获取最新状态，请检查网络和 Git 凭据。',
      )
    }

    throw error
  }

  const inspection = await inspectRepository(repositoryRoot)

  if (inspection.blockedFiles.length > 0) {
    throw new GitSyncError(
      'GIT_UNSUPPORTED_FILES',
      409,
      '工作区包含不允许同步的文件：' + inspection.blockedFiles.join('、'),
    )
  }

  if (inspection.behind > 0) {
    throw new GitSyncError(
      'GIT_REMOTE_AHEAD',
      409,
      '远程仓库有 VPS 尚未拉取的修改，请先处理同步冲突。',
    )
  }

  const syncFiles = inspection.changedFiles
  const commitMessage = normalizeCommitMessage(message)

  if (syncFiles.length > 0) {
    await runGit(['add', '--', ...syncFiles], repositoryRoot)
    await runGit(['commit', '--message', commitMessage, '--', ...syncFiles], repositoryRoot)
  } else if (inspection.ahead === 0) {
    return {
      state: 'clean',
      commitHash: inspection.head ?? '',
      commitMessage: '',
      syncedFiles: [],
      syncedAt: new Date().toISOString(),
    }
  }

  const pushArguments = ['push']

  if (!inspection.upstream) {
    pushArguments.push('--set-upstream')
  }

  pushArguments.push(gitSyncRemote, branch)
  await runGit(pushArguments, repositoryRoot)

  const finalHead = await runGitOptional(['rev-parse', 'HEAD'], repositoryRoot)

  return {
    state: 'clean',
    commitHash: finalHead ?? inspection.head ?? '',
    commitMessage: syncFiles.length > 0 ? commitMessage : '',
    syncedFiles: syncFiles,
    syncedAt: new Date().toISOString(),
  }
}
