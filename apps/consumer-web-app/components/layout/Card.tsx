/**
 * Screen Layout System — the one standard card recipe (Prompt 2
 * requirement 5). Wraps `.mef-card` (app/globals.css: 28px radius, the
 * app's real dominant card shadow/radius, responsive padding that pulls
 * in on small phones). Use this instead of a per-component
 * `rounded-[28px] bg-white shadow-[...]` string so every card in the app
 * shares one definition.
 *
 * `as` lets a card render as a real interactive element (`button`,
 * `a`) when the whole card is tappable, without duplicating the
 * className recipe at each call site.
 */

import type { CSSProperties, ElementType, ReactNode } from 'react';

export function Card({
  children,
  as: Component = 'div',
  className = '',
  style,
  ...rest
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  [key: string]: unknown;
}) {
  return (
    <Component className={`mef-card ${className}`} style={style} {...rest}>
      {children}
    </Component>
  );
}

/**
 * A vertical run of same-type cards with the standard card-to-card gap
 * (`.mef-card-stack`, app/globals.css) instead of a per-screen
 * mt-4/mt-5/mt-6 guess between siblings.
 */
export function CardStack({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`mef-card-stack ${className}`}>{children}</div>;
}
