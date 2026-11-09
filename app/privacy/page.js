import TopBar from "../components/TopBar";

export const metadata = {
  title: "Privacy Policy - Notes Site",
};

export default function PrivacyPage() {
  return (
    <main className="page" style={{ "--content": "700px", lineHeight: 1.6 }}>
      <TopBar brand action={{ href: "/", label: "Back to site" }} />
      <h1 className="page-title appear">Privacy Policy</h1>
      <p>
        Notes Site is a private website for sharing study notes with approved
        users only.
      </p>
      <h2>What we collect</h2>
      <p>
        When you sign in with Google, we receive your name and email address.
        We also record login activity such as login time, device type, IP address and device sessions. We also record which notes you open and how long you spend on the site and on each note.
      </p>
      <h2>How we use it</h2>
      <p>
        Your email is used to identify your account, to approve or remove
        access, to display a watermark on protected content, and to keep the
        site secure. We do not sell your data or share it with third parties,
        apart from the services that run the site (Google for login, Supabase
        for storage, and Vercel for hosting).
      </p>
      <h2>Deleting your data</h2>
      <p>
        To have your account and data removed, contact the site owner.
      </p>
    </main>
  );
}
