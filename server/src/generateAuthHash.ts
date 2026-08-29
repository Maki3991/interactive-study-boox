import { createPasswordHash } from './auth.js'

async function readPassword() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const chunks: Buffer[] = []

    for await (const chunk of process.stdin) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
    }

    return Buffer.concat(chunks).toString('utf8').trim()
  }

  process.stdout.write('输入应用登录密码（至少 8 个字符）：')
  process.stdin.setRawMode?.(true)
  process.stdin.resume()

  return new Promise<string>((resolve, reject) => {
    let password = ''

    const onData = (chunk: Buffer) => {
      const input = chunk.toString('utf8')

      for (const character of input) {
        if (character === '\u0003') {
          cleanup()
          reject(new Error('已取消。'))
          return
        }

        if (character === '\r' || character === '\n') {
          cleanup()
          process.stdout.write('\n')
          resolve(password)
          return
        }

        if (character === '\u007f' || character === '\b') {
          password = password.slice(0, -1)
          continue
        }

        password += character
      }
    }

    const cleanup = () => {
      process.stdin.off('data', onData)
      process.stdin.setRawMode?.(false)
      process.stdin.pause()
    }

    process.stdin.on('data', onData)
  })
}

try {
  const password = await readPassword()
  process.stdout.write(`${await createPasswordHash(password)}\n`)
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : '无法生成密码哈希。'}\n`)
  process.exitCode = 1
}
