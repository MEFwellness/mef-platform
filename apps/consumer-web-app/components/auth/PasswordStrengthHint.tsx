'use client';

import { Check } from 'lucide-react';
import { getPasswordRequirements, getPasswordStrength, type PasswordStrength } from '@/lib/auth/validation';

const STRENGTH_FILL: Record<PasswordStrength, number> = {
  weak: 1,
  fair: 2,
  strong: 3,
};

const STRENGTH_LABEL: Record<PasswordStrength, string> = {
  weak: 'Weak',
  fair: 'Good',
  strong: 'Strong',
};

const STRENGTH_COLOR: Record<PasswordStrength, string> = {
  weak: '#C2694B',
  fair: '#F5B700',
  strong: '#1B3A2D',
};

/**
 * Shown under the password field from the moment it renders — not just
 * after a failed submit — so requirements are known before the member
 * starts typing, per the "prevent errors before submission" brief. The
 * three-bar strength read is a quick visual cue only (getPasswordStrength
 * is never used to block submission); checkPasswordStrength's binary
 * valid/invalid, unchanged, is still the only real gate.
 */
export function PasswordStrengthHint({ password }: { password: string }) {
  const requirements = getPasswordRequirements(password);
  const strength = getPasswordStrength(password);
  const filled = password.length === 0 ? 0 : STRENGTH_FILL[strength];

  return (
    <div className="mt-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1 flex-1 rounded-full transition-colors"
              style={{ backgroundColor: i < filled ? STRENGTH_COLOR[strength] : '#1B3A2D1A' }}
            />
          ))}
        </div>
        {password.length > 0 && (
          <span className="text-[11px] font-medium text-[#6B7A72]">{STRENGTH_LABEL[strength]}</span>
        )}
      </div>

      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {requirements.map((requirement) => (
          <li
            key={requirement.label}
            className={`flex items-center gap-1.5 text-xs ${
              requirement.met ? 'text-[#1B3A2D]' : 'text-[#6B7A72]'
            }`}
          >
            <Check
              className={requirement.met ? 'text-[#1B3A2D]' : 'text-[#1B3A2D]/25'}
              size={12}
              strokeWidth={3}
              aria-hidden="true"
            />
            {requirement.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
