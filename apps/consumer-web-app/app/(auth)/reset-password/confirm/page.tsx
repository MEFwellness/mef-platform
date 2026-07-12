'use client';

import { useState } from 'react';
import { updatePassword } from '../../../actions/auth';

export default function ConfirmResetPage() {
  const [error, setError] = useState<string | null>(null);

  return (
    <main>
      <h1>Set a new password</h1>
      <form
        action={async (formData) => {
          const result = await updatePassword(formData);
          if (result?.error) setError(result.error);
        }}
      >
        <label>New password <input name="password" type="password" minLength={8} required /></label>
        {error && <p role="alert" style={{ color: 'crimson' }}>{error}</p>}
        <button type="submit">Update password</button>
      </form>
    </main>
  );
}
