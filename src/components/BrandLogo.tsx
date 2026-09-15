interface Props {
  /** large = home hero; compact = in-session top bar */
  size?: 'large' | 'compact'
}

export function BrandLogo({ size = 'large' }: Props) {
  return (
    <div className={`brand-logo brand-logo-${size}`}>
      <img
        src="/bangers-logo.png"
        alt="Bangers"
        className="brand-logo-img"
        width={size === 'large' ? 320 : 160}
        height={size === 'large' ? 71 : 35}
      />
    </div>
  )
}
