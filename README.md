# Notes Site

A private, members-only website for sharing notes (text, PDF, Word, Excel, PowerPoint and images) with an approved audience. Access is controlled per person, per note and per subject. Content is shown as pictures drawn in the browser with a traceable watermark, and each person can be signed in on only one device at a time.

Built with **Next.js 14**, **Supabase** (Postgres, Google login, realtime, private storage) and **Vercel**. It runs on free tiers.

> **Read this first:** no website can truly prevent screenshots or phone-camera photos. This project makes casual copying and sharing hard and makes leaks traceable (watermark, device lock, activity log). It is not DRM. See [Security model](#security-model) and [Known limitations](#known-limitations).

---

## Table of contents

1. [Features](#features)
2. [How it works](#how-it-works)
3. [Tech stack](#tech-stack)
4. [Architecture](#architecture)
5. [Pages and routes](#pages-and-routes)
6. [Project structure](#project-structure)
7. [Database reference](#database-reference)
8. [Security model](#security-model)
9. [Setup](#setup)
10. [Operation and maintenance](#operation-and-maintenance)
11. [Customisation](#customisation)
12. [Known limitations](#known-limitations)
13. [Troubleshooting](#troubleshooting)

---

## Features

**Access control**
- Google sign-in only. There are no passwords to store or leak.
- Approval workflow: new people land on a "no access" page until an admin approves them.
- Per-note access, per-subject access (a subject grants every note in it, including future ones), and a bulk-access grid for many people and many notes at once.
- Roles: **owner** (first account), **admin** and **student**. Only the owner can create or remove admins. Admins manage students and content but cannot touch the owner or other admins.

**Notes**
- Text notes, edited in the admin panel.
- File notes: upload **PDF, Word (.docx), images (PNG, JPG, WEBP, GIF, BMP), Excel (.xlsx, .xls) and PowerPoint (.pptx)**. Files are converted to page pictures in the admin's browser. The original file is never uploaded or stored.
- Several files per note, and subjects to group notes into folders (with automatic or custom emoji).
- Note thumbnails: a custom picture, or automatically the first page of the first file.
- Live updates: edits appear for readers within seconds, with no refresh.

**Protection (deterrents, not absolute blocks)**
- Notes are drawn on canvases, so there is no selectable text in the page.
- Watermark with the viewer's email and a short ID, drawn into the picture and as a floating overlay.
- Right-click, copy, cut, drag, selection, print and common save/inspect shortcuts are blocked.
- Content blurs when the tab or window loses focus, on PrintScreen and before printing.
- One device at a time: a new sign-in signs the old device out within seconds, enforced inside the database.

**Monitoring (admin)**
- Who is online now and which note they are reading.
- Time per student per note, time on site, recent note views.
- Login history with device and IP address.
- Log of unauthorised sign-in attempts, with optional email alerts to the owner.

---

## How it works

1. A visitor opens the site and clicks **Sign in with Google**.
2. **The first account ever created becomes the owner** (admin, automatically approved). Everyone after that is a pending student.
3. A pending person sees "You do not have access". The attempt is logged and the owner is emailed (at most once every 6 hours per person, if email alerts are configured).
4. The owner approves the person in the Admin panel. The person's open screen switches to the dashboard on its own.
5. Approval alone shows no notes. The owner also grants access to individual notes or whole subjects.
6. Students see only what they were given. Notes are drawn as pictures with a watermark. Leaving the tab blurs the content.
7. Signing in on a second device signs the first one out.
8. Payment, if any, is handled outside the site; access is granted manually.

---

## Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 14.2 (App Router), React 18 | The website |
| Backend services | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) | Postgres, Google auth, realtime, private storage |
| Hosting | Vercel | Hosting and automatic deploys from GitHub |
| Email alerts (optional) | Resend | Notifies the owner of unauthorised sign-ins |
| PDF conversion | pdf.js 3.11 (loaded from cdnjs, admin browser only) | PDF pages to pictures |
| Word conversion | mammoth 1.6 + html2canvas 1.4 (cdnjs, admin browser only) | Best-effort .docx to pictures |
| Excel / PowerPoint / images | SheetJS 0.18, JSZip 3.10, html2canvas, custom slide renderer (cdnjs, admin browser only) | Sheets, slides and images to pictures |
| Analytics (optional) | `@vercel/analytics`, `@vercel/speed-insights` | Vercel usage and performance stats |
| Font | Inter (`@fontsource-variable/inter`) | Typography |

The conversion libraries are loaded from cdnjs only on the admin upload screen. Students never load them.

---

## Architecture

```
 Browser (student / admin)
        |  HTTPS
        v
 +----------------------+        +--------------------------------+
 |  Vercel (Next.js)    | <----> |  Supabase                      |
 |  - server pages      |        |  - Auth (Google)               |
 |  - API routes        |        |  - Postgres (tables + RLS)     |
 |  - middleware        |        |  - Realtime                    |
 +----------------------+        |  - Storage (private bucket)    |
        |                        +--------------------------------+
        v                                    ^
 Resend (optional email)                     |
                                  Google (OAuth sign-in)
```

**How a request is protected**

1. The browser holds a Supabase session cookie. Every database and storage request carries the user's token.
2. The token contains a `session_id`. The database stores which `session_id` is the user's **active device** (`active_sessions`).
3. Row Level Security allows a read only if the user is approved, on their active device, and has access to the note (directly or through its subject). A signed-out device or an unapproved user gets nothing back from the database itself, not just a hidden button.
4. Server pages repeat these checks (`requireApproved`, `requireAdmin` in `lib/auth.js`) for clean redirects.

**Live behaviour:** the browser subscribes to Supabase Realtime for note edits, session replacement and approval changes. Realtime events only trigger a refetch; content never travels in the event. A 30-second fallback refresh and a refresh on tab focus cover dropped connections.

---

## Pages and routes

| Route | Who | What |
|---|---|---|
| `/` | Everyone | Sign-in page. Signed-in users are redirected to `/dashboard`. |
| `/auth/callback` | System | Completes Google login, claims the device, records login history. |
| `/dashboard` | Approved | Students: subject folders. Admins: management dashboard. |
| `/notes` | Approved | Notes the user may read, grouped by subject. |
| `/notes/[id]` | Approved with access | Protected note viewer. |
| `/pending` | Not approved | "No access" / "Access removed". Triggers the alert. |
| `/kicked` | System | Signs out this device only and redirects home with a message. |
| `/privacy` | Everyone | Privacy policy (needed for Google's OAuth consent screen). |
| `/admin` | Admins | Users: approve, reject, remove, restore. Owner can make or remove admins. |
| `/admin/notes` | Admins | Create and list notes. |
| `/admin/notes/[id]` | Admins | Edit title, subject, text and thumbnail; add or remove files; per-note access; delete. |
| `/admin/access` | Admins | Bulk access grid. |
| `/admin/subjects` | Admins | Add subjects; bulk subject access. |
| `/admin/subjects/[id]` | Admins | Rename, emoji, delete, subject access, notes in the subject. |
| `/admin/monitor` | Admins | Monitoring and usage. |
| `/api/heartbeat` | Signed in | Confirms the device is still active and the user still approved. |
| `/api/notes/[id]` | Approved with access | Returns note data (no-store). |
| `/api/alert` | Signed in | Logs an unauthorised attempt and sends the optional email. |

---

## Project structure

```
notes-site/
├── package.json
├── jsconfig.json               "@/" import shortcut
├── middleware.js               Refreshes the Supabase session on every request
├── SQL_database_queries/       Numbered SQL files; run in order (see Setup)
├── logos/                      Logo SVG variants
├── lib/
│   ├── auth.js                 requireApproved(), requireAdmin()
│   ├── convertFiles.js         Image, Excel and PowerPoint to page pictures (browser)
│   ├── emoji.js                Automatic emoji for subject and note names
│   ├── storage.js              Deletes stored page pictures
│   ├── time.js                 "Updated 3 days ago" helpers
│   ├── ua.js                   Device description and duration formatting
│   └── supabase/{client,server}.js
└── app/
    ├── layout.js               Page frame; mounts SessionGuard for signed-in users
    ├── page.js                 Sign-in
    ├── globals.css
    ├── auth/callback/route.js
    ├── kicked/route.js
    ├── dashboard/  notes/  notes/[id]/  pending/  privacy/
    ├── api/{heartbeat,alert,notes/[id]}/route.js
    ├── admin/
    │   ├── page.js, actions.js         User management
    │   ├── access/                     Bulk access
    │   ├── subjects/, subjects/[id]/   Subjects
    │   ├── notes/, notes/[id]/         Note list and editor
    │   └── monitor/page.js             Monitoring
    └── components/
        ├── ProtectedShell.js           Blocks copy/print/right-click, blur, floating watermark
        ├── NoteViewer.js               Fetches a note, live updates, reading-time tracking
        ├── NoteCanvas.js               Draws text notes as pictures with watermark
        ├── PagesViewer.js              Draws file pages as pictures with watermark
        ├── NoteFileUploader.js         Converts files to pictures and uploads them
        ├── NoteThumbnail.js            Custom note thumbnail upload
        ├── SessionGuard.js             One-device check, live approval check, site-time tracking
        ├── RealtimeRefresh.js          Live refresh helper
        ├── PendingNotifier.js          Triggers the unauthorised-attempt alert
        ├── AccessPicker.js             Tick-box picker for bulk access
        ├── NotesHome.js, Folder.js, NoteTile.js, StatCards.js, TopBar.js, ...   UI
        └── Card.js, LoginButton.js, SignOutButton.js, ConfirmButton.js, ...     UI
```

---

## Database reference

### Tables

| Table | Purpose |
|---|---|
| `profiles` | One row per Google account: `email`, `full_name`, `role` (`admin`/`user`), `status` (`pending`/`approved`/`removed`), `is_owner` |
| `notes` | `title`, `content` (text notes), `subject_id`, `thumbnail_path`, timestamps. Legacy single-file columns (`kind`, `page_count`, `page_version`, `pages_meta`, `source_name`) remain but are unused. |
| `note_access` | `(note_id, user_id)`: direct access to one note |
| `subjects` | `name` (unique, case-insensitive), optional `emoji` |
| `subject_access` | `(subject_id, user_id)`: access to every note in a subject |
| `note_files` | Files attached to a note: `name`, `kind`, `page_count`, `page_version`, `pages_meta`, `position` |
| `active_sessions` | One row per user: the single active device (`auth_session_id`, `user_agent`, `last_seen`) |
| `access_alerts` | Log of sign-ins without access (email, device, IP, status) |
| `login_history` | Every sign-in: device, IP, session id, last seen, active seconds |
| `note_views` | Reading time per note open: user, note, title at the time, seconds |

**Storage:** private bucket `note-pages`. Page pictures live at `{note_id}/{version}/{page}.jpg`, with a small `thumb.jpg` beside page 1 and custom thumbnails in `{note_id}/cover/`.

### Functions

| Function | Purpose |
|---|---|
| `handle_new_user()` (trigger) | Creates the profile; the first account becomes the approved owner |
| `is_current_session()` | True if the token's `session_id` matches the user's active session |
| `is_admin()`, `is_approved()` | Admin / approved user, **on the active device** |
| `can_manage(target)` | Owner manages anyone but themselves; admins manage students only; nobody manages the owner |
| `guard_profile_update()` (trigger) | Only the owner can change roles; the owner flag cannot change |
| `set_updated_at()` (trigger) | Maintains `notes.updated_at` |
| `claim_session(user_agent, ip)` | Makes this sign-in the active device and writes login history |
| `check_session()` | Heartbeat: is this device still the active one |
| `log_access_alert(user_agent, ip)` | Logs an attempt; returns true if an email should be sent (max once per 6 hours per person) |
| `track_site_time(seconds)` | Adds active seconds to the current sign-in |
| `track_note_view(view_id, note_id, seconds)` | Upserts reading time for one note open |
| `has_note_access(note_id)` | Approved, active device, and access directly or through the note's subject |
| `has_note_file_access(folder)` | The same check for a storage folder |

`claim_session` and `log_access_alert` also keep their older one-argument signatures working, so the site and database can be updated in either order.

### Row Level Security summary

| Table | Read | Write |
|---|---|---|
| `profiles` | Own row; admins read all | Admins, only through `can_manage` and the role trigger |
| `notes`, `note_files` | Admins all; approved users only notes they or their subject have access to | Admins |
| `subjects` | Admins all; users the subjects they have access to | Admins |
| `note_access`, `subject_access` | Own rows; admins all | Admins |
| `active_sessions` | Own row; admins all | Only through `claim_session` |
| `access_alerts`, `login_history`, `note_views` | Admins | Only through the functions above |
| Storage `note-pages` | Approved + active device + access (or admin) | Admins |

---

## Security model

| Protection | Enforced by | Strength |
|---|---|---|
| Only approved users see anything | Row Level Security and server checks | Strong |
| Per-note and per-subject access | Row Level Security on tables and storage | Strong |
| One device at a time | Token `session_id` compared inside database rules | Strong against the old device |
| Admin powers, owner protection | `is_admin()`, `can_manage()`, role trigger | Strong |
| No selection, right-click, print | Browser scripts and canvas drawing | Deterrent only |
| Blur on focus loss | Browser scripts | Deterrent only |
| Watermark | Drawn into the picture and overlay | Deterrent and traceability; can be cropped if faint |
| Screenshots | Not preventable on the web | None |
| Account sharing | One-device lock, IP and login monitoring | Detection, not prevention |

**Secrets and a public repository**
- The app uses only the **public** Supabase URL and anon key. These are designed to be exposed to browsers; the database rules are what protect your data.
- The Supabase **service-role key is never used** and must never be committed or put in an environment variable of this app.
- `RESEND_API_KEY` and `ADMIN_EMAIL` are server-side environment variables. Never commit them. Add `.env*` to your `.gitignore`.
- Because the repository is public, anyone can read the code. Security rests on Row Level Security, not on the code being hidden.

---

## Setup

You need free accounts on **Google Cloud, GitHub, Supabase and Vercel**, and optionally **Resend**.

### 1. Supabase

1. Create a project (choose the region closest to your users). Save the database password.
2. In **Project Settings, API Keys**, copy the **Project URL** and the **publishable / anon key**.
3. Open **SQL Editor** and run every file in `SQL_database_queries/` **in numeric order**, one at a time (copy the file, paste, Run):

| # | File | What it does |
|---|---|---|
| 1 | `01-phase2-profiles-and-login.sql` | `profiles`, new-user trigger, own-profile read rule |
| 2 | `02-phase3-admin-permissions.sql` | `is_admin()`, admin read/update rules |
| 3 | `03-phase4-notes-and-access.sql` | `notes`, `note_access`, `is_approved()`, rules |
| 4 | `04-phase5-realtime.sql` | Realtime for notes and note access |
| 5 | `05-phase6-one-device-lock.sql` | Active sessions, device lock, session-aware `is_admin()` / `is_approved()` |
| 6 | `06-phase7-access-alerts.sql` | `access_alerts`, `log_access_alert` |
| 7 | `07-phase8-monitoring.sql` | `login_history`, IP columns, admin read rules |
| 8 | `08-phase8b-usage-tracking.sql` | `note_views`, time-tracking functions |
| 9 | `09-upgrade1-admins-and-files.sql` | Owner flag, `can_manage`, role guard, storage bucket and rules |
| 10 | `10-upgrade2-subjects-and-multifile.sql` | Subjects, `note_files`, `has_note_access()`, updated read rules |
| 11 | `11-upgrade3-thumbnails-and-emoji.sql` | Subject emoji, note thumbnails |

Notes: order matters. Re-running a file may print "already exists" or "already member"; that means it already ran and is harmless. Files 10 and 11 are safe to run twice.

### 2. Google login

1. In Supabase: **Authentication, Sign In / Providers, Google**. Copy the **Callback URL**.
2. In [Google Cloud Console](https://console.cloud.google.com): create a project, configure the **OAuth consent screen** (External), then create an **OAuth client ID** of type *Web application*. Add the Supabase Callback URL as an **Authorized redirect URI**.
3. Paste the Client ID and Client secret into the Supabase Google provider and save.
4. In Google Cloud **Branding**, fill in the app name, support email, **App home page** (your live URL), **App privacy policy link** (your live URL + `/privacy`), **Authorized domains** (your Supabase project domain and your **full** hosting domain, for example `your-app.vercel.app`; plain `vercel.app` is rejected) and developer contact email.
5. In Google Cloud **Audience**, click **Publish app** so anyone can sign in. While the app is in *Testing*, only listed **Test users** (up to 100) can sign in.
6. In Supabase **Authentication, URL Configuration**: set **Site URL** to your live URL and add your live URL followed by `/**` under **Redirect URLs**.

### 3. Deploy on Vercel

1. Fork or clone this repository to your own GitHub account.
2. In Vercel, **Add New Project**, import the repository (framework: Next.js).
3. Add environment variables under **Settings, Environment Variables**:

| Variable | Value | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable / anon key | Yes |
| `RESEND_API_KEY` | Resend API key (sending access) | Optional (email alerts) |
| `ADMIN_EMAIL` | Owner's email; must be the address used to sign up at Resend | Optional (email alerts) |

4. Deploy. After adding or changing variables, **redeploy**; variables only apply to new deployments.

To run locally instead: copy the variables into a `.env.local` file, then run `npm install` and `npm run dev`.

### 4. Email alerts (optional)

Create a Resend account with the owner's email, create an API key, and add the two variables above. The free Resend sender (`onboarding@resend.dev`) only delivers to the Resend account's own address. To email another address, verify a domain in Resend and change the `from` address in `app/api/alert/route.js`.

### 5. First sign-in

**Sign in yourself first, before sharing the link with anyone.** The first account to sign in becomes the owner. Then approve people and grant them access to notes or subjects.

---

## Operation and maintenance

**Day to day (admin)**
- `/admin`: approve, reject, remove or restore people.
- Grant access per note, per subject, or in bulk at `/admin/access`.
- Create notes, upload files, set thumbnails, organise notes into subjects.
- `/admin/monitor`: who is online, what they read and for how long, suspicious sign-ins.

**Weekly:** open your Supabase dashboard at least once a week. The free plan pauses inactive projects, which locks everyone out until you click **Restore**.

**Backups:** keep your own copy of every note and original file. The free Supabase plan has no guaranteed backups and the site never stores original uploads.

**Free-tier limits** (check each provider for current numbers): Supabase roughly 500 MB database, 1 GB file storage and a cap on simultaneous realtime connections. A page picture is roughly 150 to 400 KB, so storage holds a few thousand pages.

**Tell your users** that sign-ins, devices, IP addresses and reading time are logged, that sharing is not allowed, and that only one device can be signed in at a time. Edit `/privacy` (`app/privacy/page.js`) to match how you run your own deployment.

**Google sign-in does not work inside in-app browsers** (WhatsApp, Instagram, Telegram): Google shows `disallowed_useragent`. Users should open the link in Chrome or Safari.

**File upload limits and behaviour**

| Type | Limit | Notes |
|---|---|---|
| PDF | 300 pages | Exact rendering |
| Word (.docx) | 120 pages | Best effort; complex layouts may differ. Save as PDF for exact results. Old `.doc` is not supported. |
| Excel (.xlsx, .xls) | 150 pages, 2,000 rows, 40 columns per sheet | Larger sheets are truncated or rejected with a message |
| PowerPoint (.pptx) | 150 slides | Rendered by a custom in-browser renderer; export to PDF for exact results. Old `.ppt` is not supported. |
| Images | Scaled to at most 1800 px wide | PNG, JPG, WEBP, GIF, BMP. iPhone HEIC must be exported to JPG or PNG first. |

---

## Customisation

- **Watermark strength:** `WATERMARK_ALPHA` in `app/components/NoteCanvas.js` (text notes) and `app/components/PagesViewer.js` (file pages); `OVERLAY_ALPHA` in `app/components/ProtectedShell.js` (floating overlay). Raise the values to make the watermark harder to crop out.
- **Site name and branding:** the title in `app/layout.js` and `app/page.js`, the logo files in `logos/`, `app/components/Logo.js`, `app/icon.svg`, and colours in `app/globals.css`.
- **Remove Vercel analytics:** delete the `Analytics` and `SpeedInsights` imports and tags in `app/layout.js` and the two `@vercel/*` packages from `package.json`.
- **Alert frequency and recipients:** the 6-hour limit lives in the `log_access_alert` SQL function; the recipient is the `ADMIN_EMAIL` variable.
- **Emoji matching:** the keyword lists in `lib/emoji.js`.

---

## Known limitations

1. **Screenshots and cameras cannot be blocked on the web.** The blur reacts after the operating system may already have captured the screen. Only a native app can show a black screen.
2. **A technically skilled user can still extract page pictures** using browser developer tools. The target is casual copying.
3. **A faint watermark can be cropped out.** Stronger watermarks cost readability; tune the opacity constants to taste.
4. **Word and PowerPoint conversion is best effort.** PDF is exact.
5. **Notes are pictures**, so there is no search inside notes and no screen-reader support for note content.
6. **Revoking access or deleting a note** reaches an open reader's screen within about 30 seconds. Approval and device changes are near-instant.
7. **Active-time tracking is approximate** (updates every 15 to 30 seconds; background tabs do not count; very short views may be missed).
8. **IP addresses are hints, not proof**, and the site cannot tell who shared a link.
9. **Email alerts go to a single address.**
10. **Account sharing is discouraged, not prevented.**
11. **The bulk access grid shows direct note access only**, not access granted through a subject.
12. **Free-tier risks:** project pausing, storage and connection limits.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Google says `redirect_uri_mismatch` | The Authorized redirect URI in Google Cloud must exactly match the Supabase Callback URL |
| "Publish app" is greyed out in Google | Branding needs app name, support email, home page URL, privacy policy URL (`/privacy`), authorized domains and developer email |
| Google rejects the `vercel.app` domain | Use your full domain (for example `your-app.vercel.app`) as the authorized domain |
| Only listed people can sign in | The Google app is still in *Testing*; publish it or add test users |
| `disallowed_useragent` | The link was opened inside WhatsApp, Instagram or Telegram; open it in Chrome or Safari |
| Login returns home with "Login failed" | Check Supabase Site URL and Redirect URLs, both required environment variables, and that all SQL files ran |
| New environment variables seem ignored | Redeploy in Vercel after changing variables |
| Window A not signed out after window B signs in | Wait up to 30 seconds and focus the tab; make sure they are different browsers or devices |
| No alert emails | Check spam, both variables, and that the Resend account email equals `ADMIN_EMAIL`; redeploy |
| "policy already exists" / "relation already exists" in SQL | That file (or part of it) already ran |
| Note shows "Loading..." forever | Check the account is approved, has access, and is on its active device |
| A page picture shows "Loading page..." | Same checks; also confirm file 09 and file 10 ran (bucket and storage rules) |
| Thumbnails missing | Confirm file 11 ran |
| Word, Excel or PowerPoint upload looks wrong | Export to PDF and upload the PDF |
| Everything locked, "project paused" | The Supabase free project paused after inactivity; restore it in the Supabase dashboard |
| Signing out one device signs out all of them | Supabase's default sign-out scope is global. This project always uses `signOut({ scope: "local" })`; keep it that way |
| Build warning about `viewport` | Harmless Next.js warning; it does not affect behaviour |

---

## Contributing notes

- Keep every access rule in the **database** (Row Level Security and `is_admin`, `is_approved`, `is_current_session`, `can_manage`, `has_note_access`), not only in page code.
- Never use the Supabase service-role key in the app.
- Use `signOut({ scope: "local" })` in device-kick flows.
- When changing a SQL function's signature, keep the old signature working so the site and database can be updated in either order.
- Add new SQL as a new numbered file in `SQL_database_queries/`; do not edit files that others may already have run.
- Run `npm install` and `npm run build` before opening a pull request.
