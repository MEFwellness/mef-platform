'use client';

import { useState } from 'react';
import { requestPasswordReset } from '../../actions/auth';

export default function ResetPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <main>
      <h1>Reset password</h1>
      <form
        action={async (formData) => {
          const result = await requestPasswordReset(formData);
          setMessage(result?.error ?? 'If that email exists, a reset link has been sent.');
        }}
      >
        <label>Email <input name="email" type="email" required /></label>
        <button type="submit">Send reset link</button>
      </form>
      {message && <p>{message}</p>}
    </main>
  );
}
