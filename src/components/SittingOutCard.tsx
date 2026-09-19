interface Sitter {
  id: string
  name: string
}

interface Props {
  sitters: Sitter[]
  /** Optional extra sit-out explanation (King’s Court bottom-court rotation). */
  note?: string
}

/** Prominent “who sits this round” card — chips, not a buried sentence. */
export function SittingOutCard({ sitters, note }: Props) {
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
        {sitters.map((s) => (
          <li key={s.id} className="sitting-chip">
            {s.name}
          </li>
        ))}
      </ul>
    </section>
  )
}
