import { App } from 'antd'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../entities/auth/model/useAuthStore'
import { finalizePasswordResetWithToken, requestPasswordResetEmail, verifyPasswordResetEmailCode } from '../../shared/api/passwordResetApi'
import { isBackendAuthEnabled } from '../../shared/api/backendClient'
import { AnimatedCharacters } from './AnimatedCharacters'
import { PasswordVisibilityToggle } from './PasswordVisibilityToggle'

type Step = 'email' | 'code' | 'password'

export function ForgotPasswordPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const authedUserId = useAuthStore(s => s.authedUserId)
  const backendAuth = isBackendAuthEnabled()

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [resetToken, setResetToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [isTyping, setIsTyping] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!backendAuth) {
      navigate('/login', { replace: true })
      return
    }
    if (authedUserId) navigate('/projects', { replace: true })
  }, [authedUserId, backendAuth, navigate])

  const clearError = () => setError('')

  const onSendCode = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    const trimmed = email.trim()
    if (!trimmed) {
      setError('请输入注册时绑定的邮箱')
      return
    }
    setSubmitting(true)
    try {
      const res = await requestPasswordResetEmail(trimmed)
      if (!res.ok) {
        setError(res.message)
        return
      }
      message.success(res.data.message || '若该邮箱已注册，将收到验证码')
      setStep('code')
    } finally {
      setSubmitting(false)
    }
  }

  const onVerifyCode = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    const digits = code.replace(/\D/g, '').slice(0, 6)
    if (digits.length !== 6) {
      setError('请输入 6 位验证码')
      return
    }
    setSubmitting(true)
    try {
      const res = await verifyPasswordResetEmailCode(email.trim(), digits)
      if (!res.ok) {
        setError(res.message)
        return
      }
      setResetToken(res.data.resetToken)
      setCode(digits)
      message.success('验证通过，请设置新密码')
      setStep('password')
    } finally {
      setSubmitting(false)
    }
  }

  const onFinalize = async (e: FormEvent) => {
    e.preventDefault()
    clearError()
    if (newPassword.length < 6) {
      setError('新密码至少 6 位')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    setSubmitting(true)
    try {
      const res = await finalizePasswordResetWithToken(resetToken, newPassword)
      if (!res.ok) {
        setError(res.message)
        return
      }
      message.success(res.data.message || '密码已重置')
      navigate('/login', { replace: true })
    } finally {
      setSubmitting(false)
    }
  }

  if (!backendAuth) return null

  const typingActive = step === 'email' || step === 'code'

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
            <span>找回密码</span>
          </div>

          <div className="characters-wrapper">
            <AnimatedCharacters
              isTyping={typingActive && isTyping}
              isPasswordFocused={step === 'password' && isPasswordFocused}
              showPassword={showPassword || showConfirm}
              passwordLength={step === 'password' ? newPassword.length : 0}
            />
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
              <h1>
                {step === 'email' ? '找回密码' : step === 'code' ? '验证邮箱' : '设置新密码'}
              </h1>
              <p>
                {step === 'email'
                  ? '向账号绑定的邮箱发送验证码'
                  : step === 'code'
                    ? `验证码已发送至 ${email.trim()}`
                    : '验证已通过，请输入新密码'}
              </p>
            </div>

            {step === 'email' ? (
              <form onSubmit={onSendCode} noValidate>
                <div className="form-group">
                  <label htmlFor="fp-email">邮箱</label>
                  <div className="input-wrapper">
                    <input
                      id="fp-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={e => {
                        setEmail(e.target.value)
                        clearError()
                      }}
                      onFocus={() => setIsTyping(true)}
                      onBlur={() => setIsTyping(false)}
                      placeholder="请输入注册邮箱"
                    />
                  </div>
                </div>
                {error ? (
                  <div className="error-msg show" role="alert">
                    {error}
                  </div>
                ) : null}
                <button type="submit" className="btn-login" disabled={submitting}>
                  <span className="btn-text">{submitting ? '发送中…' : '发送验证码'}</span>
                  <div className="btn-hover-content">
                    <span>{submitting ? '发送中…' : '发送验证码'}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                </button>
                <div className="login-form-footer-link">
                  <Link to="/login">返回登录</Link>
                </div>
              </form>
            ) : null}

            {step === 'code' ? (
              <form onSubmit={onVerifyCode} noValidate>
                <div className="form-group">
                  <label htmlFor="fp-code">验证码</label>
                  <div className="input-wrapper">
                    <input
                      id="fp-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={code}
                      onChange={e => {
                        setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                        clearError()
                      }}
                      onFocus={() => setIsTyping(true)}
                      onBlur={() => setIsTyping(false)}
                      placeholder="6 位数字"
                    />
                  </div>
                </div>
                {error ? (
                  <div className="error-msg show" role="alert">
                    {error}
                  </div>
                ) : null}
                <button type="submit" className="btn-login" disabled={submitting}>
                  <span className="btn-text">{submitting ? '验证中…' : '验证并继续'}</span>
                  <div className="btn-hover-content">
                    <span>{submitting ? '验证中…' : '验证并继续'}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                </button>
                <div className="login-form-footer-link">
                  <button type="button" className="login-inline-btn" disabled={submitting} onClick={() => setStep('email')}>
                    修改邮箱
                  </button>
                  <span className="login-form-footer-sep">·</span>
                  <button
                    type="button"
                    className="login-inline-btn"
                    disabled={submitting}
                    onClick={async () => {
                      clearError()
                      setSubmitting(true)
                      try {
                        const res = await requestPasswordResetEmail(email.trim())
                        if (!res.ok) {
                          setError(res.message)
                          return
                        }
                        message.success('验证码已重新发送')
                      } finally {
                        setSubmitting(false)
                      }
                    }}
                  >
                    重新发送
                  </button>
                </div>
              </form>
            ) : null}

            {step === 'password' ? (
              <form onSubmit={onFinalize} noValidate>
                <div className="form-group">
                  <label htmlFor="fp-new">新密码</label>
                  <div className="input-wrapper">
                    <input
                      id="fp-new"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={e => {
                        setNewPassword(e.target.value)
                        clearError()
                      }}
                      onFocus={() => setIsPasswordFocused(true)}
                      onBlur={() => setIsPasswordFocused(false)}
                      placeholder="至少 6 位"
                    />
                    <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword(v => !v)} />
                  </div>
                </div>
                <div className="form-group">
                  <label htmlFor="fp-confirm">确认新密码</label>
                  <div className="input-wrapper">
                    <input
                      id="fp-confirm"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={e => {
                        setConfirmPassword(e.target.value)
                        clearError()
                      }}
                      onFocus={() => setIsPasswordFocused(true)}
                      onBlur={() => setIsPasswordFocused(false)}
                      placeholder="再次输入新密码"
                    />
                    <PasswordVisibilityToggle visible={showConfirm} onToggle={() => setShowConfirm(v => !v)} />
                  </div>
                </div>
                {error ? (
                  <div className="error-msg show" role="alert">
                    {error}
                  </div>
                ) : null}
                <button type="submit" className="btn-login" disabled={submitting}>
                  <span className="btn-text">{submitting ? '提交中…' : '完成重设'}</span>
                  <div className="btn-hover-content">
                    <span>{submitting ? '提交中…' : '完成重设'}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                </button>
                <div className="login-form-footer-link">
                  <Link to="/login">返回登录</Link>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
