'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordFieldProps {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | undefined;
  autoComplete?: string;
  minLength?: number;
}

export function PasswordField({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  error,
  autoComplete,
  minLength,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label className="text-sm font-medium text-[#1B3A2D]" htmlFor={id}>
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          required
          minLength={minLength}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          autoComplete={autoComplete}
          className="w-full rounded-2xl border border-[#1B3A2D]/10 p-3 pr-12 text-base text-[#1B3A2D] focus:border-[#F5B700] focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-[#6B7A72]"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
