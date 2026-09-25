interface Sitter {
  id: string
  name: string
}

interface Props {
  sitters: Sitter[]
  /** Optional extra sit-out explanation (King’s Court bottom-court rotation). */
  note?: string
  /** Tap a sitter to swap them onto a court. */
  onSelectPlayer?: (playerId: string) => void
  selectedPlayerId?: string | null
}

/** Prominent “who sits this round” card — chips, not a buried sentence. */
export function SittingOutCard({ sitters, note, onSelectPlayer, selectedPlayerId }: Props) {
  if (sitters.length === 0) {
    return (
      <p className="everyone-playing" role="status">
        Everyone playing
      </p>
    )
  }

  return (
    <section className="card sitting-card" role="status" aria-label="Sitting this round">
      <h2 className="sitting-title">Sitting this round</h2>
      <p className="sitting-sub">
        {sitters.length === 1 ? '1 player sits out' : `${sitters.length} players sit out`} —{' '}
        {note ?? 'rotates fairly next round'}
      </p>
      <ul className="sitting-chips">
        {sitters.map((s) => {
          const selected = selectedPlayerId === s.id
          return (
            <li key={s.id}>
              {onSelectPlayer ? (
                <button
                  type="button"
                  className={`sitting-chip${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  aria-label={selected ? `${s.name}, selected to swap` : `Swap ${s.name}`}
                  onClick={() => onSelectPlayer(s.id)}
                >
                  {s.name}
                </button>
              ) : (
                <span className="sitting-chip">{s.name}</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
