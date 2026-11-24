# Chess Coach

A chess game with a coach: feedback after each move, nudges, look-back, and play against the computer, a person online, or on one device.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The game page |
| `engine.js` | The chess engine behind the coach and the computer opponent |
| `chess.bundle.js` | The chess rules library (chess.js) |
| `supabase.js` | The Supabase browser library (supabase-js 2.119.2) |
| `sync.js` | Online play: saves and syncs games through Supabase |
| `config.js` | Your Supabase address and public key (edit this one) |
| `supabase-setup.sql` | One-time database setup, pasted into Supabase |

## Setup

1. **Supabase:** create a project. Open the SQL Editor, paste the contents of `supabase-setup.sql`, and run it.
2. **Settings:** on the project's API settings page, copy the project URL and the public key (labelled "anon" or "publishable"). Paste them into `config.js` in place of the two `PASTE_...` values. Do not use the "service_role" or "secret" key.
3. **GitHub:** put all the files in this folder in a public repository.
4. **Hosting:** in the repository's Settings > Pages, deploy from the `main` branch, root folder. GitHub gives you the public link. (Vercel also works: import the repository, no build settings.)

## Notes

- The Computer and Same device tabs work without Supabase. Only "A person online" needs it.
- There are no logins. Anyone with the site link and a 4-character game code can join that game.
- The game in progress is saved in each browser, not across devices.
- The "Explain more" button from the Claude version is not included here.
