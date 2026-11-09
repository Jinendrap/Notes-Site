import Link from "next/link";
import Card from "./components/Card";
import Arrow from "./components/Arrow";

export default function NotFound() {
  return (
    <Card>
      <h1>Not available</h1>
      <p>This page does not exist, or you no longer have access to it.</p>
      <Link href="/dashboard" className="pill">
        <span className="label">Go to dashboard</span>
        <Arrow />
      </Link>
    </Card>
  );
}
