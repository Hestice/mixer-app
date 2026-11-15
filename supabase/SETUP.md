# Supabase cloud backup

Project: `tkpaivoalqyvjqfocpwe` (mixer-app).

## Local configuration

Copy `apps/web/.env.example` to `apps/web/.env.local` and fill in the project's URL and publishable key. The local file is ignored by Git. No service-role key or database password belongs in the browser app.

## Database and private recordings

Run `supabase/migrations/202611150001_cloud_backup.sql`, then `supabase/migrations/202611150002_multiple_takes.sql` in the project's SQL editor. It creates the `songs` table, owner-only read policy, revision-checked `save_song` function, and private `recordings` bucket. The app cannot update or delete audio objects; immutable SHA-256 paths allow safe retries. A song manifest is published only after its files upload.

The bucket limit is 50 MB per WAV. Larger takes remain saved locally and available for download, but display a backup error. Interrupted uploads retry from the local file when the app is open; this is not background browser sync or a byte-resumable uploader. Superseded audio objects are retained for now; storage cleanup and cloud deletion need a future retention policy.

Run `supabase/security-check.sql` to verify owner isolation, anonymous denial, idempotent commits, revision conflicts, and private storage. Its synthetic identities and test song are rolled back.

## Email sign-in

Email sign-in and new-user registration must be enabled, with email confirmation retained.

The default flow is a magic link with PKCE. Set the Site URL to `http://127.0.0.1:3000` and allow these redirect URLs:

- `http://127.0.0.1:3000/auth/callback`
- `http://localhost:3000/auth/callback`

Open a sign-in link in the browser that requested it. The PKCE verifier is stored in that browser. Do not change between `localhost` and `127.0.0.1`; browser-local songs and authentication belong to an origin.

The current Supabase free dashboard requires custom SMTP or Pro to customize email templates. Its default email service restricts delivery to project-team addresses and has tight rate limits. Connect your own SMTP provider before inviting other people. The app uses Supabase's default template until then.

To use codes later: configure SMTP, set the Magic link / OTP email template to include `{{ .Token }}`, set `NEXT_PUBLIC_SUPABASE_EMAIL_MODE=code`, and restart/redeploy the web app. Code entry accepts the configured 6–10 digit code length.

For deployment, set the production Site URL and add the exact HTTPS `/auth/callback` address for the app's subdomain. Add the public environment variables to the web deployment. NestJS does not need Supabase credentials for this flow.

Official references: [passwordless sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP delivery](https://supabase.com/docs/guides/auth/auth-smtp), [storage access controls](https://supabase.com/docs/guides/storage/security/access-control).

## Local and cloud behavior

- Local autosave commits before backup runs. Kept layers and the unkept review take are included. Recording still saves when stopped.
- Existing device-only songs require explicit selection. Automatic backup applies only to songs created while signed into that account with the device preference enabled. Signing in never sweeps up recordings made while signed out.
- IndexedDB retains backup ownership, remote revisions, local checkpoints and in-flight commit IDs. Reloading resumes pending work; a lost commit response does not create another song.
- Web Locks serialize backup passes across tabs. The server checks revisions even when Web Locks are unavailable. Divergent edits fork a recovered cloud version and keep the remote original.
- Cloud downloads verify recording hashes before atomically installing the local copy. Concurrent local edits prevent replacement. Opening a dirty local copy never discards its pending changes.
- Signing out stops new backup operations and hides account-bound local songs. Completed in-flight requests may already have reached that account. Tokens are resolved for the expected owner at request time, preventing upload to a different signed-in account.
- Removal of downloaded copies is explicit and only removes fully backed-up local revisions. Pending changes are retained. The application does not encrypt IndexedDB or treat a shared browser profile as a secure account sandbox.

## Verification

Run `pnpm --filter @audio-app/web test`, `typecheck`, and `build`. Cloud tests use real IndexedDB semantics with an in-memory remote transport to exercise failed uploads, lost responses, conflicts, concurrent edits, downloads and account isolation. A hosted sign-in/upload/download smoke test also requires a project-team email or working SMTP.


Verified on the configured hosted project: the migration applied successfully, the transactional security check passed, and the signed-in synthetic song uploaded both WAVs (one kept layer plus one review take). Downloading both private objects produced matching SHA-256 hashes. No test identities or rows from the transactional security check remain.

## Take editing

The second migration is applied to the hosted mixer-app project. Version 2 manifests preserve every attempt, the selected take, reversible trim bounds, layer start times, and a replacement take still under review. Version 1 songs remain readable. The save function rejects version 2 → 1 downgrades so an older open app cannot erase the take collection; reload before editing these songs on another device.

All audio stays immutable. Trimming and placement change metadata; each take keeps its original WAV and its own edits. Backup hashes and uploads all alternatives before publishing a revision. Repeated references share the same audio object. Downloads validate every reference and hash before installing the song locally. Downloads labeled Original WAV contain the full selected recording, not a rendered mix or a trimmed export.

Verified against hosted Supabase with a synthetic song: four recordings across two take collections (including a pending review take) uploaded, then restored after removing only that fully synced local test copy. Audio hashes, selected takes, trim bounds, and placement matched. The transactional security test also passed the version upgrade and downgrade checks.
