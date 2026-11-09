// Row of coloured summary cards shown at the top of the home screens.
// Each card is { emoji, value, label, color } where color is a folder colour number (0-13).
export default function StatCards({ cards }) {
  return (
    <div className="stat-cards appear">
      {cards.map((c) => (
        <div className={`stat-card f${c.color}`} key={c.label}>
          <span className="stat-card-emoji">{c.emoji}</span>
          <div>
            <div className="stat-card-value">{c.value}</div>
            <div className="stat-card-label">{c.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
