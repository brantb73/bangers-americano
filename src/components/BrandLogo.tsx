interface Props {
  /** large = home hero; compact = in-session top bar */
  size?: 'large' | 'compact'
}

/** Source PNG is 535×560 (paddle + Tournify wordmark). */
const LARGE = { width: 220, height: 230 }
const COMPACT = { width: 96, height: 100 }

export function BrandLogo({ size = 'large' }: Props) {
  const dims = size === 'large' ? LARGE : COMPACT
  return (
    <div className={`brand-logo brand-logo-${size}`}>
      <img
        src={`${import.meta.env.BASE_URL}tournify-logo.png`}
        alt="Tournify by BANGERS"
        className="brand-logo-img"
        width={dims.width}
        height={dims.height}
      />
    </div>
  )
}
