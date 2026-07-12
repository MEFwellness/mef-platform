'use client';

import { useState } from 'react';
import { signIn } from '../../actions/auth';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);

  return (
    <main>
      <h1>Log in</h1>
      <form
        action={async (formData) => {
          const result = await signIn(formData);
          if (result?.error) setError(result.error);
        }}
      >
        <div>
          <label>Email <input name="email" type="email" required /></label>
        </div>
        <div>
          <label>Password <input name="password" type="password" required /></label>
        </div>
        {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit">Log in</button>
      </form>
      <p><a href="/signup">Need an account? Sign up</a></p>
      <p><a href="/reset-password">Forgot password?</a></p>
    </main>
  );
}
