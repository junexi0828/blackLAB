interface MissionTickerProps {
  items: string[]
}

export function MissionTicker({ items }: MissionTickerProps) {
  const feed = items.length ? items : ['Waiting for the next company signal.']
  const doubled = [...feed, ...feed]

  return (
    <section className="panel ticker-panel">
      <div className="ticker-strip">
        {doubled.map((item, index) => (
          <span key={`${index}-${item.slice(0, 20)}`} className="ticker-item">
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}
