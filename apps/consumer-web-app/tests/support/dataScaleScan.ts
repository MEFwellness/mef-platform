/**
 * EVERY DATABASE REQUEST IN THE CODEBASE, READ FROM THE SYNTAX TREE.
 *
 * This is what tests/data-scale-guard.test.ts runs, and what produced the
 * inventory in docs/DATA_SCALE_AUDIT.md. It exists because three defects of
 * one family shipped, and each was invisible at its call site:
 *
 *   1. A read with no bound comes back capped at PostgREST's `db-max-rows`
 *      (1,000 on this project) with no error. A `.limit(2001)` is capped the
 *      same way, so a "limit" above the cap is not a bound either.
 *   2. An `.in()` filter travels in the request URL, and a long id list
 *      is refused by the gateway ("URI too long"), which reads as "nothing".
 *   3. Reference tables crossed the cap together and every consumer quietly
 *      showed partial data.
 *
 * A regex over source text cannot see a query chain that spans lines, a
 * builder kept in a variable and extended later, or which callback a query
 * sits inside, so this walks the TypeScript syntax tree instead.
 *
 * WHAT COUNTS AS BOUNDED, and nothing else does:
 *
 *   - a head count (`{ head: true }`), `.single()` or `.maybeSingle()`
 *   - `.limit(n)` or `.range(a, b)` whose width is not provably above the cap
 *   - a read built inside `selectAllRows` / `selectAllRowsInChunks`
 *   - equality filters that cover a unique key of the table
 *   - a table named in FIXED_SMALL_TABLES (a fixed enum, with its reason)
 *   - an explicit exemption written directly above the statement:
 *
 *         // scale-exempt: <why this can never exceed the cap>
 *
 * A LIST IN ONE REQUEST is bounded when it is a literal array, a
 * SCREAMING_CASE constant (a fixed set of statuses), or the `chunk` a
 * chunking helper hands in. Everything else is chunked or exempted.
 */

import * as ts from 'typescript';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** PostgREST's db-max-rows on this project (supabase/config.toml and production). */
export const ROW_CAP = 1000;

export type SiteKind = 'read' | 'write' | 'rpc' | 'auth-list' | 'storage-list';

export type Violation =
  | 'unpaged-read'
  | 'limit-above-cap'
  | 'unbatched-list'
  | 'unbatched-bulk-write'
  | 'set-rpc-unbounded'
  | 'unknown-rpc'
  | 'auth-list-unpaged'
  | 'storage-list-unpaged';

export type ScanSite = {
  file: string;
  line: number;
  kind: SiteKind;
  /** Table, view, rpc or bucket name; `<expr>` when it is not a literal. */
  target: string;
  op: string;
  /** How the site is bounded, when it is. */
  bound: string | null;
  violation: Violation | null;
  exemption: string | null;
  eqColumns: string[];
  inLists: string[];
};

export type ScanOptions = {
  /** Unique keys per table, beyond `id` which every table here keys on. */
  uniqueKeys: Record<string, string[][]>;
  /** Tables that are a fixed enum, with the reason. */
  fixedSmallTables: Record<string, string>;
  /** Every rpc the code calls, and whether it returns a set of rows. */
  rpcReturnsSet: Record<string, boolean>;
};

const HELPER_CALLEE = /(^|\.)(selectAllRows|selectAllRowsInChunks|writeInChunks)$/;
const EXEMPT = /scale-exempt:\s*(\S.{14,})/;

function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (/\.(mjs|cjs|js)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function stringLiteral(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function unwrap(node: ts.Expression): ts.Expression {
  let current = node;
  while (
    ts.isAsExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    (ts.isSatisfiesExpression?.(current) ?? false)
  ) {
    current = (current as ts.AsExpression).expression;
  }
  return current;
}

/** Numeric value of an expression built from literals and numeric consts in the same file. */
function evaluateNumber(
  expr: ts.Expression,
  consts: Map<string, ts.Expression>,
  depth = 0
): number | null {
  if (depth > 8) return null;
  const node = unwrap(expr);
  if (ts.isNumericLiteral(node)) return Number(node.text.replace(/_/g, ''));
  if (ts.isIdentifier(node)) {
    const init = consts.get(node.text);
    return init ? evaluateNumber(init, consts, depth + 1) : null;
  }
  if (ts.isBinaryExpression(node)) {
    const left = evaluateNumber(node.left, consts, depth + 1);
    const right = evaluateNumber(node.right, consts, depth + 1);
    if (left === null || right === null) return null;
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken:
        return left + right;
      case ts.SyntaxKind.MinusToken:
        return left - right;
      case ts.SyntaxKind.AsteriskToken:
        return left * right;
      default:
        return null;
    }
  }
  return null;
}

type ChainCall = { name: string; args: readonly ts.Expression[]; node: ts.CallExpression };

/** The calls chained onto `start`, outermost last. */
function chainFrom(start: ts.CallExpression): { calls: ChainCall[]; end: ts.Expression } {
  const calls: ChainCall[] = [];
  let node: ts.Expression = start;
  for (;;) {
    const access = node.parent;
    if (!access || !ts.isPropertyAccessExpression(access) || access.expression !== node) break;
    const call = access.parent;
    if (!call || !ts.isCallExpression(call) || call.expression !== access) break;
    calls.push({ name: access.name.text, args: call.arguments, node: call });
    node = call;
  }
  return { calls, end: node };
}

/**
 * A builder kept in a variable and extended afterwards:
 * `let query = supabase.from(...).select(...); if (x) query = query.eq(...);`
 */
function laterCalls(end: ts.Expression, sf: ts.SourceFile): ChainCall[] {
  const declaration = end.parent;
  if (!declaration || !ts.isVariableDeclaration(declaration) || !ts.isIdentifier(declaration.name))
    return [];
  const name = declaration.name.text;
  let scope: ts.Node = declaration;
  while (scope.parent && !ts.isBlock(scope) && !ts.isSourceFile(scope)) scope = scope.parent;
  const found: ChainCall[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === name &&
      node.pos > declaration.end &&
      node.parent &&
      ts.isCallExpression(node.parent) &&
      node.parent.expression === node
    ) {
      found.push({ name: node.name.text, args: node.parent.arguments, node: node.parent });
      // `query = query.eq(...).limit(...)`: the rest of that chain counts too.
      found.push(...chainFrom(node.parent).calls);
    }
    ts.forEachChild(node, visit);
  };
  visit(scope);
  void sf;
  return found;
}

function isHelperCallback(node: ts.Node): boolean {
  const call = node.parent;
  if (!call || !ts.isCallExpression(call) || !call.arguments.includes(node as ts.Expression))
    return false;
  const callee = call.expression;
  const text = ts.isIdentifier(callee)
    ? callee.text
    : ts.isPropertyAccessExpression(callee)
      ? callee.name.text
      : '';
  return HELPER_CALLEE.test(text);
}

function insideHelper(node: ts.Node): string | null {
  for (let current = node.parent; current; current = current.parent) {
    if (
      (ts.isArrowFunction(current) || ts.isFunctionExpression(current)) &&
      current.parent &&
      ts.isCallExpression(current.parent) &&
      current.parent.arguments.includes(current as ts.Expression)
    ) {
      const callee = current.parent.expression;
      const text = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : '';
      if (HELPER_CALLEE.test(text)) return text;
    }
  }
  return null;
}

/**
 * The exemption comment that applies to a site: a leading comment on the
 * site's own statement, or on the array element / argument / property the
 * query sits in (so one query inside a `Promise.all` can be exempted
 * without exempting its neighbours).
 */
function exemptionFor(node: ts.Node, sf: ts.SourceFile): string | null {
  const text = sf.text;
  for (let current: ts.Node | undefined = node; current; current = current.parent) {
    const ranges = ts.getLeadingCommentRanges(text, current.getFullStart()) ?? [];
    for (const range of ranges) {
      const match = EXEMPT.exec(text.slice(range.pos, range.end));
      if (match) return match[1]!.replace(/\s*\*\/\s*$/, '').trim();
    }
    if (ts.isStatement(current) || ts.isSourceFile(current)) break;
    // A paging helper's own callback is part of the same request, so a reason
    // written above `selectAllRows(() => ...)` covers the query inside it.
    if (ts.isFunctionLike(current) && !isHelperCallback(current)) break;
  }
  return null;
}

function listIsBounded(arg: ts.Expression | undefined): string | null {
  if (!arg) return 'no list';
  const node = unwrap(arg);
  if (ts.isArrayLiteralExpression(node) && !node.elements.some((el) => ts.isSpreadElement(el))) {
    return `literal list of ${node.elements.length}`;
  }
  if (ts.isIdentifier(node) && /^[A-Z][A-Z0-9_]*$/.test(node.text)) return `constant ${node.text}`;
  if (ts.isIdentifier(node) && node.text === 'chunk') return 'chunk';
  return null;
}

/**
 * THE SAME LIST, WRITTEN INTO A FILTER STRING, which `.in()` alone would
 * miss: `.not('id', 'in', `(${ids.join(',')})`)`, `.filter(col, 'in', ...)`,
 * or an `.or(...)` whose clauses carry `col.in.(${...})`. The URL is the same
 * URL and the ceiling is the same ceiling.
 */
function stringBuiltList(call: ChainCall, from: ts.Node, sf: ts.SourceFile): boolean {
  if ((call.name === 'not' || call.name === 'filter') && stringLiteral(call.args[1]) === 'in') {
    return stringLiteral(call.args[2]) === null;
  }
  if (call.name === 'or' && call.args[0] && stringLiteral(call.args[0]) === null) {
    let scope: ts.Node = from;
    while (scope.parent && !ts.isFunctionLike(scope) && !ts.isSourceFile(scope))
      scope = scope.parent;
    return /\.in\.\(\$\{/.test(scope.getText(sf));
  }
  return false;
}

/**
 * Whether a payload is many rows rather than one: a spread array, a mapped or
 * filtered array, or a variable declared as one (an array literal, a mapped
 * array, or an `X[]` annotation) anywhere in the same file. Named-like-a-list
 * is kept as a fallback for a parameter whose declaration is elsewhere.
 */
function payloadIsMany(arg: ts.Expression | undefined, arrayNames: Set<string>): boolean {
  if (!arg) return false;
  const node = unwrap(arg);
  if (ts.isArrayLiteralExpression(node)) return node.elements.some((el) => ts.isSpreadElement(el));
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    return /^(map|flatMap|filter|concat|slice)$/.test(node.expression.name.text);
  }
  if (ts.isIdentifier(node)) {
    return (
      arrayNames.has(node.text) ||
      /(rows|Rows|batch|Batch|items|Items|entries|Entries|List|list)$/.test(node.text)
    );
  }
  return false;
}

function isArrayShaped(init: ts.Expression | undefined, type: ts.TypeNode | undefined): boolean {
  if (
    type &&
    (ts.isArrayTypeNode(type) ||
      (ts.isTypeReferenceNode(type) && /^(Array|ReadonlyArray)$/.test(type.typeName.getText())))
  ) {
    return true;
  }
  if (!init) return false;
  const node = unwrap(init);
  if (ts.isArrayLiteralExpression(node)) return true;
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    /^(map|flatMap|filter|concat|slice)$/.test(node.expression.name.text)
  );
}

/** Names declared in the file as arrays (variables and parameters). */
function arrayDeclaredNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node) => {
    if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
      if (isArrayShaped(node.initializer, node.type)) names.add(node.name.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

function numericConsts(sf: ts.SourceFile): Map<string, ts.Expression> {
  const consts = new Map<string, ts.Expression>();
  const visit = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      node.parent &&
      ts.isVariableDeclarationList(node.parent) &&
      node.parent.flags & ts.NodeFlags.Const
    ) {
      consts.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return consts;
}

const READ_OPS = new Set(['select']);
const WRITE_OPS = new Set(['insert', 'upsert', 'update', 'delete']);

export function scanSource(file: string, text: string, options: ScanOptions): ScanSite[] {
  if (!/\.(from|rpc|listUsers|list)\(/.test(text)) return [];
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKindFor(file));
  const consts = numericConsts(sf);
  const arrayNames = arrayDeclaredNames(sf);
  const sites: ScanSite[] = [];
  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression;
      const receiverText = receiver.getText(sf);

      if (
        method === 'from' &&
        node.arguments.length === 1 &&
        !/^(Array|Buffer|Object|Uint8Array)$/.test(receiverText)
      ) {
        const literal = stringLiteral(node.arguments[0]);
        const isStorage = /(^|\.)storage$/.test(receiverText);
        const { calls, end } = chainFrom(node);
        const allCalls = [...calls, ...laterCalls(end, sf)];
        const op = calls.find(
          (call) => READ_OPS.has(call.name) || WRITE_OPS.has(call.name) || call.name === 'list'
        );
        // A `.from(x)` with no query method after it is not a query (Array.from, a stream, ...).
        if (
          op &&
          (literal !== null ||
            isStorage ||
            /supabase|client|admin|service|svc|db\b|sb\b/i.test(receiverText))
        ) {
          const target = literal ?? `<${node.arguments[0]!.getText(sf)}>`;
          const exemption = exemptionFor(end, sf);
          const eqColumns = allCalls
            .filter((call) => call.name === 'eq' || call.name === 'is')
            .map((call) => stringLiteral(call.args[0]))
            .filter((column): column is string => column !== null);
          const inCalls = allCalls.filter((call) => call.name === 'in');
          const inLists = inCalls.map((call) => call.args[1]?.getText(sf) ?? '');
          const helper = insideHelper(node);
          const site: ScanSite = {
            file,
            line: lineOf(node),
            kind: 'read',
            target,
            op: op.name,
            bound: null,
            violation: null,
            exemption,
            eqColumns,
            inLists,
          };

          const unbatchedList =
            inCalls.find((call) => !listIsBounded(call.args[1])) ??
            allCalls.find((call) => stringBuiltList(call, node, sf));
          if (isStorage && op.name === 'list') {
            site.kind = 'storage-list';
            const optionsText = op.args[1]?.getText(sf) ?? '';
            site.bound = /limit\s*:/.test(optionsText) ? 'explicit limit' : null;
            if (!site.bound) site.violation = 'storage-list-unpaged';
          } else if (isStorage) {
            ts.forEachChild(node, visit);
            return;
          } else if (WRITE_OPS.has(op.name)) {
            site.kind = 'write';
            if (unbatchedList) site.violation = 'unbatched-list';
            else if (
              (op.name === 'insert' || op.name === 'upsert') &&
              payloadIsMany(op.args[0], arrayNames) &&
              !helper
            ) {
              site.violation = 'unbatched-bulk-write';
            } else site.bound = helper ? `inside ${helper}` : 'write';
          } else {
            const select = calls.find((call) => call.name === 'select')!;
            const selectOptions = select.args[1]?.getText(sf) ?? '';
            const names = allCalls.map((call) => call.name);
            const limitCall = allCalls.find((call) => call.name === 'limit');
            const rangeCall = allCalls.find((call) => call.name === 'range');
            const uniqueKey = [['id'], ...(options.uniqueKeys[target] ?? [])].find((key) =>
              key.every((column) => eqColumns.includes(column))
            );

            if (unbatchedList) {
              site.violation = 'unbatched-list';
            } else if (/head:\s*true/.test(selectOptions)) {
              site.bound = 'head count';
            } else if (helper) {
              site.bound = `paged by ${helper}`;
            } else if (names.includes('single') || names.includes('maybeSingle')) {
              site.bound = 'single row';
            } else if (limitCall) {
              const value = limitCall.args[0] ? evaluateNumber(limitCall.args[0], consts) : null;
              if (value !== null && value > ROW_CAP) site.violation = 'limit-above-cap';
              else site.bound = value === null ? 'limit (caller-supplied)' : `limit ${value}`;
            } else if (rangeCall) {
              const from = rangeCall.args[0] ? evaluateNumber(rangeCall.args[0], consts) : null;
              const to = rangeCall.args[1] ? evaluateNumber(rangeCall.args[1], consts) : null;
              if (from !== null && to !== null && to - from + 1 > ROW_CAP)
                site.violation = 'limit-above-cap';
              else site.bound = 'range';
            } else if (uniqueKey) {
              site.bound = `unique key (${uniqueKey.join(', ')})`;
            } else if (options.fixedSmallTables[target]) {
              site.bound = `fixed table: ${options.fixedSmallTables[target]}`;
            } else {
              site.violation = 'unpaged-read';
            }
          }
          // A list added later to a kept builder (`query = query.in(...)`) can
          // carry its reason on that statement, beside the list it excuses.
          const listExemption =
            site.violation === 'unbatched-list' && unbatchedList && !exemption
              ? exemptionFor(unbatchedList.node, sf)
              : null;
          if (site.violation && (exemption || listExemption)) {
            site.exemption = exemption ?? listExemption;
            site.bound = `exempt: ${site.exemption}`;
            site.violation = null;
          }
          sites.push(site);
        }
      } else if (method === 'rpc') {
        const name = stringLiteral(node.arguments[0]);
        if (name !== null && /supabase|client|admin|service|svc|db\b|sb\b/i.test(receiverText)) {
          const { calls, end } = chainFrom(node);
          const names = calls.map((call) => call.name);
          const exemption = exemptionFor(end, sf);
          const site: ScanSite = {
            file,
            line: lineOf(node),
            kind: 'rpc',
            target: name,
            op: 'rpc',
            bound: null,
            violation: null,
            exemption,
            eqColumns: [],
            inLists: [],
          };
          const returnsSet = options.rpcReturnsSet[name];
          if (returnsSet === undefined) site.violation = 'unknown-rpc';
          else if (!returnsSet) site.bound = 'returns one value';
          else if (insideHelper(node)) site.bound = 'paged';
          else if (names.some((n) => /^(single|maybeSingle|limit|range)$/.test(n)))
            site.bound = 'bounded';
          else site.violation = 'set-rpc-unbounded';
          if (site.violation && exemption) {
            site.bound = `exempt: ${exemption}`;
            site.violation = null;
          }
          sites.push(site);
        }
      } else if (method === 'listUsers' && /auth\.admin$/.test(receiverText)) {
        const argsText = node.arguments.map((arg) => arg.getText(sf)).join(',');
        const exemption = exemptionFor(node, sf);
        // Paged means the page number moves: `{ page, perPage }` inside a loop,
        // or the shared listAllAuthUsers. `{ page: 1, perPage: 1000 }` is one page.
        const paged =
          /perPage/.test(argsText) && /(^|[{,]\s*)page\s*[,}]|page:\s*page\b/.test(argsText)
            ? true
            : file.endsWith('lib/data/pagedSelect.ts');
        sites.push({
          file,
          line: lineOf(node),
          kind: 'auth-list',
          target: 'auth.users',
          op: 'listUsers',
          bound: paged ? 'perPage' : exemption ? `exempt: ${exemption}` : null,
          violation: paged || exemption ? null : 'auth-list-unpaged',
          exemption,
          eqColumns: [],
          inLists: [],
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return sites;
}

/** Directories and files the guard reads, relative to the app root. */
export const SCANNED_ROOTS = ['app', 'lib', 'components', 'hooks', 'middleware.ts', 'scripts'];

function walk(root: string, relative: string, out: string[]) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    if (/\.(ts|tsx|mts|mjs|js|cjs)$/.test(relative) && !/\.d\.m?ts$/.test(relative))
      out.push(relative);
    return;
  }
  for (const entry of fs.readdirSync(absolute)) {
    // Dot folders under scripts/ are gitignored scratch (.sweep, .verify), and
    // node_modules / .next are not source.
    if (entry.startsWith('.') || entry === 'node_modules') continue;
    walk(root, path.join(relative, entry), out);
  }
}

export function scanApp(appRoot: string, options: ScanOptions): ScanSite[] {
  const files: string[] = [];
  for (const root of SCANNED_ROOTS) walk(appRoot, root, files);
  return files
    .sort()
    .flatMap((file) =>
      scanSource(file, fs.readFileSync(path.join(appRoot, file), 'utf8'), options)
    );
}
