'use client';

import { useState } from 'react';
import { signUp } from '../../actions/auth';

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null);

  return (
    <main>
      <h1>Create account</h1>
      <form
        action={async (formData) => {
          const result = await signUp(formData);
          if (result?.error) setError(result.error);
        }}
      >
        <div>
          <label>Email <input name="email" type="email" required /></label>
        </div>
        <div>
          <label>Password <input name="password" type="password" minLength={8} required /></label>
        </div>
        <div>
          <label>Display name <input name="displayName" type="text" required /></label>
        </div>
        <input type="hidden" name="timezone" value={typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'America/New_York'} />
        {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit">Sign up</button>
      </form>
      <p><a href="/login">Already have an account? Log in</a></p>
    </main>
  );
}
