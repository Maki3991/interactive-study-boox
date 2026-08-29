import 'dotenv/config'
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

const scryptAsync = (password: string, salt: Buffer, keyLength: number) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, { N: 16_384, r: 8, p: 1 }, (error, derivedKey) => {
      if (error) {
        reject(error)
        return
      }

      resolve(derivedKey as Buffer)
    })
  })

const minuteMs = 60 * 1000
const hourMs = 60 * minuteMs
const dayMs = 24 * hourMs
const rememberSessionMs = parsePositiveInteger(process.env.AUTH_SESSION_TTL_DAYS, 7) * dayMs
const browserSessionMs = 8 * hourMs
const authEnabled = parseBoolean(process.env.AUTH_ENABLED, false)
const authCookieName = process.env.AUTH_COOKIE_NAME?.trim() || 'studyboox_session'
const authCookieSecure = parseBoolean(
  process.env.AUTH_COOKIE_SECURE,
  process.env.NODE_ENV === 'production',
)
const passwordHash = process.env.AUTH_PASSWORD_HASH?.trim() || ''

interface SessionRecord {
  expiresAt: number
}

interface LoginAttemptRecord {
  failures: number
  windowStartedAt: number
  blockedUntil: number
}

export interface AuthStatus {
  authEnabled: boolean
  authenticated: boolean
  expiresAt: number | null
}

export interface LoginResult {
  expiresAt: number
  remember: boolean
}

const sessions = new Map<string, SessionRecord>()
const loginAttempts = new Map<string, LoginAttemptRecord>()

function parseBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined || value.trim() === '') {
    return defaultValue
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

function parsePositiveInteger(value: string | undefined, defaultValue: number) {
  const parsed = Number(value ?? defaultValue)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue
}

function parsePasswordHash(encodedHash: string) {
  const [algorithm, encodedSalt, encodedKey] = encodedHash.split('$')

  if (algorithm !== 'scrypt' || !encodedSalt || !encodedKey) {
    return null
  }

  try {
    const salt = Buffer.from(encodedSalt, 'base64url')
    const key = Buffer.from(encodedKey, 'base64url')

    if (salt.length < 16 || key.length < 32) {
      return null
    }

    return { salt, key }
  } catch {
    return null
  }
}

function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

function getSessionToken(request: Request) {
  const cookieHeader = request.headers.cookie

  if (!cookieHeader) {
    return null
  }

  for (const cookie of cookieHeader.split(';')) {
    const separatorIndex = cookie.indexOf('=')

    if (separatorIndex === -1) {
      continue
    }

    const name = cookie.slice(0, separatorIndex).trim()

    if (name === authCookieName) {
      const value = cookie.slice(separatorIndex + 1).trim()
      return value || null
    }
  }

  return null
}

function pruneExpiredSessions(now: number) {
  for (const [sessionId, session] of sessions) {
    if (session.expiresAt <= now) {
      sessions.delete(sessionId)
    }
  }
}

function getValidSession(request: Request, now = Date.now()) {
  if (!authEnabled) {
    return { authenticated: true, expiresAt: null }
  }

  pruneExpiredSessions(now)

  const token = getSessionToken(request)

  if (!token) {
    return { authenticated: false, expiresAt: null }
  }

  const session = sessions.get(hashSessionToken(token))

  if (!session || session.expiresAt <= now) {
    if (session) {
      sessions.delete(hashSessionToken(token))
    }

    return { authenticated: false, expiresAt: null }
  }

  return { authenticated: true, expiresAt: session.expiresAt }
}

function setSessionCookie(response: Response, token: string, remember: boolean) {
  const cookieParts = [
    `${authCookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ]

  if (authCookieSecure) {
    cookieParts.push('Secure')
  }

  if (remember) {
    cookieParts.push(`Max-Age=${Math.floor(rememberSessionMs / 1000)}`)
  }

  response.setHeader('Set-Cookie', cookieParts.join('; '))
}

function clearSessionCookie(response: Response) {
  const cookieParts = [
    `${authCookieName}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ]

  if (authCookieSecure) {
    cookieParts.push('Secure')
  }

  response.setHeader('Set-Cookie', cookieParts.join('; '))
}

function getAttemptKey(request: Request) {
  return request.ip || 'unknown'
}

function isLoginBlocked(request: Request, now: number) {
  const attempt = loginAttempts.get(getAttemptKey(request))

  if (!attempt) {
    return false
  }

  if (attempt.blockedUntil > now) {
    return true
  }

  if (now - attempt.windowStartedAt >= 15 * minuteMs) {
    loginAttempts.delete(getAttemptKey(request))
  }

  return false
}

function recordFailedLogin(request: Request, now: number) {
  const key = getAttemptKey(request)
  const previous = loginAttempts.get(key)
  const attempt =
    previous && now - previous.windowStartedAt < 15 * minuteMs
      ? previous
      : { failures: 0, windowStartedAt: now, blockedUntil: 0 }

  attempt.failures += 1

  if (attempt.failures >= 5) {
    attempt.blockedUntil = now + 15 * minuteMs
  }

  loginAttempts.set(key, attempt)
}

function clearFailedLogins(request: Request) {
  loginAttempts.delete(getAttemptKey(request))
}

async function verifyPassword(password: string) {
  const parsedHash = parsePasswordHash(passwordHash)

  if (!parsedHash || password.length === 0) {
    return false
  }

  const derivedKey = await scryptAsync(password, parsedHash.salt, parsedHash.key.length)

  return timingSafeEqual(parsedHash.key, derivedKey)
}

function authConfigurationError() {
  const error = new Error('服务端尚未配置 AUTH_PASSWORD_HASH。')
  error.name = 'AuthConfigurationError'
  return error
}

export async function createPasswordHash(password: string) {
  if (password.length < 8) {
    throw new Error('登录密码至少需要 8 个字符。')
  }

  const salt = randomBytes(16)
  const derivedKey = await scryptAsync(password, salt, 64)

  return `scrypt$${salt.toString('base64url')}$${derivedKey.toString('base64url')}`
}

export function getAuthStatus(request: Request): AuthStatus {
  const session = getValidSession(request)

  return {
    authEnabled,
    authenticated: session.authenticated,
    expiresAt: session.expiresAt,
  }
}

export async function login(
  request: Request,
  response: Response,
  password: string,
  remember: boolean,
): Promise<LoginResult> {
  if (!authEnabled) {
    return { expiresAt: Date.now(), remember: false }
  }

  if (!parsePasswordHash(passwordHash)) {
    throw authConfigurationError()
  }

  const now = Date.now()

  if (isLoginBlocked(request, now)) {
    const error = new Error('登录尝试次数过多，请 15 分钟后再试。')
    error.name = 'LoginRateLimitedError'
    throw error
  }

  if (!(await verifyPassword(password))) {
    recordFailedLogin(request, now)
    const error = new Error('密码不正确。')
    error.name = 'InvalidPasswordError'
    throw error
  }

  clearFailedLogins(request)
  pruneExpiredSessions(now)

  const token = randomBytes(32).toString('base64url')
  const expiresAt = now + (remember ? rememberSessionMs : browserSessionMs)
  sessions.set(hashSessionToken(token), { expiresAt })
  setSessionCookie(response, token, remember)

  return { expiresAt, remember }
}

export function logout(request: Request, response: Response) {
  const token = getSessionToken(request)

  if (token) {
    sessions.delete(hashSessionToken(token))
  }

  clearSessionCookie(response)
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const session = getValidSession(request)

  if (session.authenticated) {
    next()
    return
  }

  response.status(401).json({
    message: '登录状态已失效，请重新登录。',
    code: 'AUTH_REQUIRED',
  })
}
