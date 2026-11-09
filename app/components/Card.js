import TopBar from "./TopBar";
import Logo from "./Logo";

export default function Card({ children, signOut = false }) {
  return (
    <div className="center-screen">
      <TopBar brand signOut={signOut} />
      <main className="center-body">
        <div className="center-inner appear">
          <div className="logo-hero">
            <Logo size={64} />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
