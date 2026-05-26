import { App } from 'antd'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BackendRequiredGate } from '../../app/components/BackendRequiredGate'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { AnimatedCharacters } from './AnimatedCharacters'
import { PasswordVisibilityToggle } from './PasswordVisibilityToggle'

export function LoginPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const backendAuth = isBackendAuthEnabled()
  const authedUserId = useAuthStore(s => s.authedUserId)
  const loginWithBackend = useAuthStore(s => s.loginWithBackend)

  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [codeError, setCodeError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)

  useEffect(() => {
    if (!authedUserId) return
    navigate('/projects', { replace: true })
  }, [authedUserId, navigate])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!backendAuth) return
    setSubmitError('')
    setCodeError(false)
    setPasswordError(false)

    const trimmed = code.trim()
    if (!trimmed) {
      setCodeError(true)
      setSubmitError('请输入用户名、邮箱或手机号')
      return
    }
    if (!password) {
      setPasswordError(true)
      setSubmitError('请输入密码')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await loginWithBackend(trimmed, password)
      if (!res.ok) {
        setSubmitError(res.reason)
        setCodeError(true)
        setPasswordError(true)
        return
      }
      message.success('登录成功')
      navigate('/projects', { replace: true })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!backendAuth) {
    return (
      <div className="login-page-root">
        <BackendRequiredGate />
      </div>
    )
  }

  return (
    <div className="login-page-root">
      <div className="login-split">
        <div className="left-panel">
          <div className="logo">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" aria-hidden>
              <path d="M12 2L15 9H9L12 2Z" />
              <path d="M12 22L9 15H15L12 22Z" />
              <path d="M2 12L9 9V15L2 12Z" />
              <path d="M22 12L15 15V9L22 12Z" />
            </svg>
            <span>登录</span>
          </div>

          <div className="characters-wrapper">
            <AnimatedCharacters isTyping={isTyping} isPasswordFocused={isPasswordFocused} showPassword={showPassword} passwordLength={password.length} />
          </div>

          <div className="footer-links">
            <span>项目管理系统</span>
          </div>
        </div>

        <div className="right-panel">
          <div className="form-container">
            <div className="sparkle-icon">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 2L13.5 9H10.5L12 2Z" fill="#1a1a2e" />
                <path d="M12 22L10.5 15H13.5L12 22Z" fill="#1a1a2e" />
                <path d="M2 12L9 10.5V13.5L2 12Z" fill="#1a1a2e" />
                <path d="M22 12L15 13.5V10.5L22 12Z" fill="#1a1a2e" />
              </svg>
            </div>

            <div className="form-header">
              <h1>欢迎回来</h1>
              <p>请填写账号信息</p>
            </div>

            <form onSubmit={onSubmit} noValidate>
              <div className="form-group">
                <label htmlFor="login-code" className={codeError ? 'error-label' : undefined}>
                  账号
                </label>
                <div className="input-wrapper">
                  <input
                    id="login-code"
                    name="code"
                    type="text"
                    autoComplete="username"
                    value={code}
                    onChange={e => {
                      setCode(e.target.value)
                      if (codeError) setCodeError(false)
                      if (submitError) setSubmitError('')
                    }}
                    onFocus={() => setIsTyping(true)}
                    onBlur={() => setIsTyping(false)}
                    placeholder="用户名、邮箱或手机号"
                    className={codeError ? 'error' : undefined}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="login-password" className={passwordError ? 'error-label' : undefined}>
                  密码
                </label>
                <div className="input-wrapper">
                  <input
                    id="login-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value)
                      if (passwordError) setPasswordError(false)
                      if (submitError) setSubmitError('')
                    }}
                    onFocus={() => {
                      setIsPasswordFocused(true)
                      setIsTyping(false)
                    }}
                    onBlur={() => setIsPasswordFocused(false)}
                    placeholder="请输入密码"
                    className={passwordError ? 'error' : undefined}
                  />
                  <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword(v => !v)} />
                </div>
              </div>

              <div className="login-forgot-row">
                <Link to="/forgot-password" className="forgot-link">
                  忘记密码？
                </Link>
              </div>

              {submitError ? (
                <div className="error-msg show" role="alert">
                  {submitError}
                </div>
              ) : null}

              <button type="submit" className="btn-login" disabled={isSubmitting}>
                <span className="btn-text">{isSubmitting ? '登录中…' : '登录'}</span>
                <div className="btn-hover-content">
                  <span>{isSubmitting ? '登录中…' : '登录'}</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
