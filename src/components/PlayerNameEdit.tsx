import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'

interface Props {
  name: string
  onSave: (next: string) => string | null
  /** Extra badge content after the name when not editing */
  badge?: ReactNode
  className?: string
}

/** Mobile-friendly rename: Edit → inline input → Save / Cancel. */
export function PlayerNameEdit({ name, onSave, badge, className }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(name)
  }, [name, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  function commit(e?: FormEvent) {
    e?.preventDefault()
    const msg = onSave(draft)
    if (msg) {
      setError(msg)
      return
    }
    setError(null)
    setEditing(false)
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      setDraft(name)
      setError(null)
      setEditing(false)
    }
  }

  if (editing) {
    return (
      <form className={`player-rename-form ${className ?? ''}`} onSubmit={commit}>
        <input
          ref={inputRef}
          className="input player-rename-input"
          type="text"
          value={draft}
          maxLength={24}
          enterKeyHint="done"
          autoComplete="off"
          aria-label="Player name"
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onKeyDown={onKey}
        />
        <button type="submit" className="btn btn-primary btn-sm">
          Save
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setDraft(name)
            setError(null)
            setEditing(false)
          }}
        >
          Cancel
        </button>
        {error && (
          <span className="warn rename-error" role="alert">
            {error}
          </span>
        )}
      </form>
    )
  }

  return (
    <div className={`player-name-row ${className ?? ''}`}>
      <span className="player-name">
        {name}
        {badge}
      </span>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => setEditing(true)}
        aria-label={`Edit ${name}`}
      >
        Edit
      </button>
    </div>
  )
}
