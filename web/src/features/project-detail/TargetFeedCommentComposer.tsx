import { SendOutlined, SmileOutlined } from '@ant-design/icons'
import { Button, Input, Popover } from 'antd'
import type { TextAreaRef } from 'antd/es/input/TextArea'
import { useCallback, useEffect, useRef, useState } from 'react'

const QUICK_EMOJIS = [
  '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '🥲', '😊', '😇', '🙂', '😉', '😍', '🥰', '😘', '😋', '😛', '😜', '🤔', '😏',
  '😒', '😔', '😢', '😭', '😤', '😠', '🤯', '😱', '🥳', '😎', '👍', '👎', '👏', '🙏', '💪', '🔥', '✨', '💯', '❤️', '🎉'
]

export type TargetFeedCommentComposerProps = {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  onSubmit: () => void
  placeholder?: string
  /** 侧栏打开且为评论 Tab 时，按 M 聚焦输入 */
  hotkeyEnabled?: boolean
}

export function TargetFeedCommentComposer({
  value,
  onChange,
  disabled = false,
  onSubmit,
  placeholder = '写评论…',
  hotkeyEnabled = false
}: TargetFeedCommentComposerProps) {
  const [expanded, setExpanded] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const textAreaRef = useRef<TextAreaRef>(null)

  const focusInput = useCallback(() => {
    if (disabled) return
    setExpanded(true)
    queueMicrotask(() => textAreaRef.current?.resizableTextArea?.textArea?.focus())
  }, [disabled])

  const tryCollapse = useCallback(() => {
    if (emojiOpen) return
    const root = shellRef.current
    if (!root) return
    if (root.contains(document.activeElement)) return
    if (!value.trim()) setExpanded(false)
  }, [emojiOpen, value])

  const handleSubmit = useCallback(() => {
    if (disabled || !value.trim()) return
    onSubmit()
    setExpanded(false)
  }, [disabled, onSubmit, value])

  const insertEmoji = useCallback(
    (emoji: string) => {
      const inner = textAreaRef.current?.resizableTextArea?.textArea
      if (!inner) {
        onChange(value + emoji)
        setEmojiOpen(false)
        return
      }
      const start = inner.selectionStart ?? value.length
      const end = inner.selectionEnd ?? value.length
      onChange(value.slice(0, start) + emoji + value.slice(end))
      setEmojiOpen(false)
      queueMicrotask(() => {
        inner.focus()
        const p = start + emoji.length
        inner.setSelectionRange(p, p)
      })
    },
    [onChange, value]
  )

  useEffect(() => {
    if (!hotkeyEnabled || disabled) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'm' && e.key !== 'M') return
      const t = e.target as HTMLElement | null
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      e.preventDefault()
      focusInput()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [disabled, focusInput, hotkeyEnabled])

  useEffect(() => {
    if (value.trim()) setExpanded(true)
    else if (!emojiOpen) setExpanded(false)
  }, [emojiOpen, value])

  useEffect(() => {
    if (!expanded) return
    queueMicrotask(() => textAreaRef.current?.resizableTextArea?.textArea?.focus())
  }, [expanded])

  const emojiPanel = (
    <div className="wt-target-comment-composer__emoji-panel">
      {QUICK_EMOJIS.map(e => (
        <button key={e} type="button" className="wt-target-comment-composer__emoji-cell" onClick={() => insertEmoji(e)}>
          {e}
        </button>
      ))}
    </div>
  )

  const showEditor = expanded || Boolean(value.trim())

  return (
    <div
      ref={shellRef}
      className={`wt-target-comment-composer${showEditor ? ' wt-target-comment-composer--expanded' : ''}${disabled ? ' wt-target-comment-composer--disabled' : ''}`}
    >
      {!showEditor ? (
        <button type="button" className="wt-target-comment-composer__placeholder" disabled={disabled} onClick={focusInput}>
          {placeholder}
        </button>
      ) : (
        <div className="wt-target-comment-composer__editor">
          <Input.TextArea
            ref={textAreaRef}
            value={value}
            disabled={disabled}
            variant="borderless"
            placeholder={placeholder}
            className="wt-target-comment-composer__textarea"
            autoSize={{ minRows: 3, maxRows: 8 }}
            onChange={e => onChange(e.target.value)}
            onFocus={() => !disabled && setExpanded(true)}
            onBlur={() => window.setTimeout(tryCollapse, 120)}
            onPressEnter={e => {
              if (e.shiftKey) return
              e.preventDefault()
              handleSubmit()
            }}
          />
          <div className="wt-target-comment-composer__toolbar">
            <div className="wt-target-comment-composer__toolbar-left">
              <Popover
                open={emojiOpen}
                onOpenChange={setEmojiOpen}
                content={emojiPanel}
                trigger="click"
                placement="topLeft"
                overlayInnerStyle={{ padding: 8 }}
              >
                <Button type="text" size="small" icon={<SmileOutlined />} disabled={disabled} title="表情" />
              </Popover>
            </div>
            <Button
              type="text"
              size="small"
              icon={<SendOutlined />}
              disabled={disabled || !value.trim()}
              title="发布（Enter）"
              onMouseDown={e => e.preventDefault()}
              onClick={handleSubmit}
            />
          </div>
        </div>
      )}
    </div>
  )
}
