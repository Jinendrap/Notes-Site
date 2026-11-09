import Link from "next/link";
import Arrow from "./Arrow";
import Logo from "./Logo";
import SignOutButton from "./SignOutButton";

// The bar at the top of every screen.
//  stats    - [{ value, label }] shown on the left (desktop and tablet)
//  links    - [{ href, label }] small grey buttons
//  action   - { href, label } the black pill on the right
//  brand    - true to always show the logo and name (login screens)
//  signOut  - true to show the Sign out button in the top right corner
export default function TopBar({
  stats = [],
  links = [],
  action = null,
  brand = false,
  signOut = false,
  children,
}) {
  const isBack = action && /^back/i.test(action.label);
  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link href="/" className="brand" aria-label="Notes Site">
          <Logo size={32} />
          {brand ? <span className="brand-name">Notes Site</span> : null}
        </Link>
        {stats.length > 0 ? (
          <div className="stats">
            {stats.map((s) => (
              <div className="stat" key={s.label}>
                <b>{s.value}</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        ) : null}
        {links.length > 0 ? (
          <nav className="nav-links">
            {links.map((l) => (
              <Link key={l.href + l.label} href={l.href} className="chip">
                {l.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
      <div className="topbar-right">
        {children}
        {action ? (
          <Link href={action.href} className="pill">
            {isBack ? <Arrow left /> : null}
            <span className="label">{action.label}</span>
            {isBack ? null : <Arrow />}
          </Link>
        ) : null}
        {signOut ? <SignOutButton /> : null}
      </div>
    </header>
  );
}
