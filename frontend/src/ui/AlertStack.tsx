interface AlertStackProps {
  title: string
  note: string
  items: string[]
}

export function AlertStack({ title, note, items }: AlertStackProps) {
  const visible = items.slice(0, 6)

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h3>{title}</h3>
          <p className="panel-note">{note}</p>
        </div>
      </div>

      <div className="alert-stack">
        {visible.length ? (
          visible.map((item, index) => (
            <article key={`${index}-${item.slice(0, 24)}`} className="alert-card">
              <span className="alert-level">{index < 2 ? 'high' : index < 4 ? 'watch' : 'note'}</span>
              <p>{item}</p>
            </article>
          ))
        ) : (
          <article className="alert-card is-calm">
            <span className="alert-level">calm</span>
            <p>No active risks recorded in this view.</p>
          </article>
        )}
      </div>
    </section>
  )
}
