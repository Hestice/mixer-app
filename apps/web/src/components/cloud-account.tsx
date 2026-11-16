'use client';

import { Cloud } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCloud } from './cloud-provider';

export function CloudAccount() {
  const cloud = useCloud();
  const codeMode = process.env.NEXT_PUBLIC_SUPABASE_EMAIL_MODE === 'code';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removeCopies, setRemoveCopies] = useState(false);
  const [resendAfter, setResendAfter] = useState(0);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!cloud.client || busy) return;
    if (Date.now() < resendAfter) { setError('Please wait a minute before requesting another code.'); return; }
    setBusy(true); setError('');
    const address = email.trim();
    try {
      const { error: reason } = await cloud.client.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback` } });
      if (reason) throw reason;
      setSentTo(address); setCode(''); setResendAfter(Date.now() + 60000);
    } catch { setError('Could not send the sign-in email. Check your address and try again in a minute.'); }
    finally { setBusy(false); }
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!cloud.client || busy) return;
    setBusy(true); setError('');
    try {
      const { error: reason } = await cloud.client.auth.verifyOtp({ email: sentTo, token: code.trim(), type: 'email' });
      if (reason) throw reason;
      setSentTo(''); setCode('');
    } catch { setError('That code could not be verified. Check the latest email or request a new code.'); }
    finally { setBusy(false); }
  }
  async function signOut() {
    setBusy(true); setError('');
    try { await cloud.signOut(removeCopies); setRemoveCopies(false); }
    catch { setError('Sign-out could not finish. Check your connection and try again.'); }
    finally { setBusy(false); }
  }

  return <section className="cloud-account" aria-labelledby="cloud-title">
    <div className="cloud-account-identity">
      <span className="cloud-account-icon"><Cloud size={21} aria-hidden="true" /></span>
      <div><h2 id="cloud-title">Cloud backup</h2><p>{cloud.user ? cloud.user.email : 'Sign in to back up your songs and open them on another device.'}</p></div>
    </div>
    {!cloud.ready ? <p role="status">Checking sign-in…</p> : !cloud.configured ? <p>Cloud backup isn’t connected yet. You can keep recording and saving on this device.</p> : cloud.user ? <div className="cloud-account-options">
      <label className="studio-check"><input type="checkbox" checked={cloud.autoBackup} disabled={busy} onChange={(event) => { setError(''); void cloud.setAutomatic(event.target.checked).catch(() => setError('Could not update your backup preference. Try again.')); }} />Automatically back up new songs on this device</label>
      <details><summary>Sign-out options</summary><label className="studio-check"><input type="checkbox" checked={removeCopies} onChange={(event) => setRemoveCopies(event.target.checked)} />Remove fully backed-up copies from this device</label><p className="studio-help">Cloud backups remain. Songs with unsynced changes stay on this device and are hidden until you sign back in. Local files are not encrypted by the app.</p><button className="text-button" disabled={busy} onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out on this device'}</button></details>
    </div> : sentTo && !codeMode ? <SignInEmailSent email={sentTo} busy={busy} onResend={() => void send()} onChangeEmail={() => { setSentTo(''); setError(''); }} /> : sentTo ? <form className="cloud-signin" onSubmit={verify}><label className="studio-field">Code sent to {sentTo}<input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={code} onChange={(event) => setCode(event.target.value)} autoFocus /></label><button className="button button-primary" disabled={busy}>{busy ? 'Checking code…' : 'Verify and sign in'}</button><div className="cloud-inline-actions"><button className="text-button" type="button" disabled={busy} onClick={() => void send()}>Send another code</button><button className="text-button" type="button" disabled={busy} onClick={() => { setSentTo(''); setCode(''); setError(''); }}>Use a different email</button></div></form> : <form className="cloud-signin" onSubmit={send}><label className="studio-field">Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label><button className="button button-primary" disabled={busy}>{busy ? 'Sending email…' : codeMode ? 'Email me a sign-in code' : 'Email me a sign-in link'}</button><p className="studio-help">No password. Signing in won’t upload existing songs.</p></form>}
    {error && <p className="cloud-error" role="alert">{error}</p>}
    {cloud.error && <div className="cloud-error" role="status"><p>{cloud.error}</p>{cloud.user && <button className="text-button" onClick={cloud.retry}>Retry cloud connection</button>}</div>}
  </section>;
}


export function SignInEmailSent({ email, busy, onResend, onChangeEmail }: { email: string; busy: boolean; onResend: () => void; onChangeEmail: () => void }) {
  return <div className="cloud-signin"><h3>Check your email</h3><p>We sent a sign-in link to {email}. Open it in this browser to finish signing in. Your songs are still saved locally.</p><div className="cloud-inline-actions"><button className="text-button" disabled={busy} onClick={onResend}>Send another email</button><button className="text-button" disabled={busy} onClick={onChangeEmail}>Use a different email</button></div></div>;
}
