/**
 * WALKING A MODULE'S RUNTIME IMPORT GRAPH, IN ONE PLACE.
 *
 * WHY IT EXISTS. Two screens now depend on the same structural property:
 * day 7's close renderer and day 8's continuation renderer must each reach
 * no entitlement gate, no membership module, no assessment registry and no
 * database client, transitively, because both of them render on a screen
 * where every one of those would answer no. Each had its own copy of this
 * walker, and the second copy is how the first one's bug was found.
 *
 * THE BUG, AND IT MADE THE GUARD WEAKER THAN IT LOOKED (2026-09-05). The
 * original matched imports line by line, so every statement written as
 *
 *   import {
 *     a,
 *     b,
 *   } from './x';
 *
 * was invisible: the module was never queued, its own imports were never
 * followed, and a forbidden import inside it would have passed unnoticed.
 * Matching over the whole source with `^` anchored to a line start makes a
 * five line statement one match.
 *
 * VALUE IMPORTS ONLY. An `import type { ... }` statement is erased by the
 * compiler and reaches nothing at runtime, so following one would fail a
 * guard on a type name rather than on a real dependency.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Every runtime (non type-only) import statement in a source file, whole, however many lines it spans. */
export function runtimeImportStatements(source: string): string[] {
  return [...source.matchAll(/^import\s+(?!type\s)[\s\S]*?from\s*'[^']+';/gm)].map(
    (match) => match[0]
  );
}

/** The specifier each of those statements names. */
export function runtimeImportSpecifiers(source: string): string[] {
  return [...source.matchAll(/^import\s+(?!type\s)[\s\S]*?from\s*'([^']+)';/gm)].map(
    (match) => match[1]!
  );
}

/**
 * Every file the entry pulls in at runtime, transitively, as repo-relative
 * paths. Only relative specifiers are followed: a package import is not a
 * file in this repository and there is nothing to walk into.
 */
export function runtimeImportClosure(root: string, entry: string): string[] {
  const read = (relative: string): string => fs.readFileSync(path.join(root, relative), 'utf8');
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of runtimeImportSpecifiers(read(file))) {
      if (!specifier.startsWith('.')) continue;
      const resolved = path.posix.join(path.posix.dirname(file), specifier);
      for (const candidate of [`${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`]) {
        if (fs.existsSync(path.join(root, candidate))) {
          queue.push(candidate);
          break;
        }
      }
    }
  }
  return [...seen];
}
