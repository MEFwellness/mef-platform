import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { LifeBuoy, Mail, MessageCircle } from 'lucide-react';
import { getStaffRoles } from '@/lib/auth/staffRoles';
import { MemberBottomNav } from '@/components/MemberBottomNav';
import { BackButton } from '@/components/BackButton';
import { FloatingCoachLauncher } from '@/components/FloatingCoachLauncher';
import { Card } from '@/components/layout';

const FAQS: { question: string; answer: string }[] = [
  {
    question: 'How is my Root Score calculated?',
    answer:
      "Root Score blends your recent check-ins, movement, and connected wearable data into one slow-moving, cross-domain measure. Open a day's score from Progress for a full breakdown of every contributing factor.",
  },
  {
    question: 'Can I change my daily check-in later?',
    answer:
      "Yes, open today's check-in from the Today tab any time before midnight in your timezone to update it.",
  },
  {
    question: 'How do I disconnect a wearable?',
    answer: 'Go to Connected Devices from this menu, find the device, and choose disconnect.',
  },
];

export default async function HelpPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Role-neutral screen: members, coaches and administrators all reach it.
  // Whoever this is gets their own bar, so a coach or an administrator is
  // never handed a member tab here.
  const { isCoach, isAdmin } = await getStaffRoles();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EFF6F1] to-[#FAFAF8] font-[family-name:var(--font-dm-sans)]">
      <main className="mx-auto w-full max-w-md px-5 pb-safe-nav pt-safe-header sm:px-6 md:max-w-2xl md:px-10 md:pb-16 md:pl-28">
        <BackButton fallbackHref="/dashboard" label="Back" />

        <div className="mt-4 flex items-center gap-2 text-[#6B7A72]">
          <LifeBuoy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <p className="text-sm font-semibold uppercase tracking-wider">Help & Support</p>
        </div>
        <h1 className="mt-2 font-[family-name:var(--font-cormorant-garamond)] text-4xl leading-tight text-[#1B3A2D] md:text-[2.75rem]">
          How can we help?
        </h1>

        <Card className="mt-6 flex items-start gap-3">
          <MessageCircle
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]/60"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-[#1B3A2D]">Ask Root</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
              For questions about your own check-ins, score, or coaching, the fastest answer is
              usually Root: tap the Ask Root button on any screen.
            </p>
          </div>
        </Card>

        <Card className="mt-5">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#6B7A72]">
            Frequently Asked
          </p>
          <div className="mt-4 divide-y divide-[#1B3A2D]/5">
            {FAQS.map((faq) => (
              <div key={faq.question} className="py-4 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-[#1B3A2D]">{faq.question}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">{faq.answer}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="mt-5 flex items-start gap-3">
          <Mail
            className="mt-0.5 h-5 w-5 shrink-0 text-[#1B3A2D]/60"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-semibold text-[#1B3A2D]">Contact support</p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6B7A72]">
              For account, billing, or technical issues, email{' '}
              <a
                href="mailto:support@mefwellness.com"
                className="font-medium text-[#1B3A2D] underline underline-offset-2"
              >
                support@mefwellness.com
              </a>
              .
            </p>
          </div>
        </Card>
      </main>

      <MemberBottomNav isCoach={isCoach} isAdmin={isAdmin} />

      <FloatingCoachLauncher entryPoint="nav" entryContext="Member opened Help & Support." />
    </div>
  );
}
