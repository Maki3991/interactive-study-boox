import { useState, type FormEvent } from 'react'

interface LoginScreenProps {
  error: string | null
  isSubmitting: boolean
  onSubmit: (password: string, remember: boolean) => void | Promise<void>
}

function LoginScreen({ error, isSubmitting, onSubmit }: LoginScreenProps) {
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void onSubmit(password, remember)
  }

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <p className="auth-eyebrow">Interactive Study</p>
        <h1>学习库</h1>
        <p className="auth-description">这是私人学习空间，请登录后继续。</p>

        <div className="auth-field">
          <label htmlFor="auth-password">登录密码</label>
          <input
            id="auth-password"
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
            placeholder="请输入密码"
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        <label className="auth-checkbox">
          <input
            type="checkbox"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>在此设备记住 7 天</span>
        </label>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button className="auth-submit" type="submit" disabled={isSubmitting || password.length === 0}>
          {isSubmitting ? '正在登录……' : '登录'}
        </button>
      </form>
    </main>
  )
}

export default LoginScreen
