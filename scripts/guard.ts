import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface AllowedRoot {
  dir: string;
  extensions: string[];
}

export interface HarnessConfig {
  ignoredDirectories: string[];
  ignoredFiles: string[];
  ignoredFilePrefixes: string[];
  ignoredFileExceptions: string[];
  ignoredExtensions: string[];
  allowedRoots: AllowedRoot[];
  allowedRootFiles: string[];
  foundationFiles: string[];
  uiRoots: string[];
  capabilityAdapters: {
    fetch: string[];
    storage: string[];
  };
  forbiddenFileBasenamesInSrc: string[];
  shapeReview: {
    maxFileLines: number;
    maxFunctionLines: number;
  };
}

export interface GuardrailResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const DEFAULT_CONFIG_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'harness.config.json',
);

const POSIX_PERSONAL_PATH_PREFIXES = [['', 'Volumes', ''].join('/'), ['', 'Users', ''].join('/')];

const WINDOWS_PERSONAL_PATH_PREFIXES = [
  ['c:', 'users', ''].join('\\'),
  ['c:', 'users', ''].join('/'),
];

const SECRET_LITERAL_RE = new RegExp(['sk', '[A-Za-z0-9_-]{20,}'].join('-'));

function toPosix(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

function loadConfig(projectRoot: string): HarnessConfig {
  const localConfigPath = path.join(projectRoot, 'harness.config.json');
  const configPath = fs.existsSync(localConfigPath) ? localConfigPath : DEFAULT_CONFIG_PATH;
  return JSON.parse(fs.readFileSync(configPath, 'utf8')) as HarnessConfig;
}

function shouldIgnoreFileName(name: string, config: HarnessConfig): boolean {
  if (config.ignoredFileExceptions.includes(name)) {
    return false;
  }
  if (config.ignoredFiles.includes(name)) {
    return true;
  }
  if (config.ignoredFilePrefixes.some((prefix) => name.startsWith(prefix))) {
    return true;
  }
  if (config.ignoredExtensions.some((ext) => name.endsWith(ext))) {
    return true;
  }
  return false;
}

function walkFiles(projectRoot: string, config: HarnessConfig): string[] {
  const ignoredDirs = new Set(config.ignoredDirectories);
  const results: string[] = [];

  function visitDir(absDir: string, relDir: string): void {
    const entries = fs.readdirSync(absDir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) {
          continue;
        }
        const nextRel = relDir ? `${relDir}/${entry.name}` : entry.name;
        visitDir(path.join(absDir, entry.name), nextRel);
      } else if (entry.isFile()) {
        if (shouldIgnoreFileName(entry.name, config)) {
          continue;
        }
        const relFile = relDir ? `${relDir}/${entry.name}` : entry.name;
        results.push(relFile);
      }
    }
  }

  visitDir(projectRoot, '');
  return results;
}

function isDeclaredFile(relPath: string, config: HarnessConfig): boolean {
  if (!relPath.includes('/')) {
    return config.allowedRootFiles.includes(relPath);
  }
  return config.allowedRoots.some(
    (root) =>
      relPath.startsWith(`${root.dir}/`) && root.extensions.some((ext) => relPath.endsWith(ext)),
  );
}

function checkHygiene(relPath: string, content: string, errors: string[]): void {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const lineNo = i + 1;
    const lowerLine = line.toLowerCase();

    const hasPersonalPath =
      POSIX_PERSONAL_PATH_PREFIXES.some((prefix) => line.includes(prefix)) ||
      WINDOWS_PERSONAL_PATH_PREFIXES.some((prefix) => lowerLine.includes(prefix));
    if (hasPersonalPath) {
      errors.push(`[PERSONAL_PATH] ${relPath}:${lineNo}: personal host path prefix is prohibited`);
    }

    if (SECRET_LITERAL_RE.test(line)) {
      errors.push(`[SECRET_LITERAL] ${relPath}:${lineNo}: raw secret key literal is prohibited`);
    }
  }
}

function resolveRelativeModule(
  projectRoot: string,
  fromAbs: string,
  specifier: string,
): string | null {
  const base = path.resolve(path.dirname(fromAbs), specifier);
  const candidates: string[] = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.css`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];

  if (specifier.endsWith('.js') || specifier.endsWith('.jsx')) {
    const stripped = base.replace(/\.jsx?$/, '');
    candidates.push(`${stripped}.ts`, `${stripped}.tsx`);
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const rel = toPosix(path.relative(projectRoot, candidate));
      if (!rel.startsWith('../') && !path.isAbsolute(rel)) {
        return rel;
      }
    }
  }
  return null;
}

interface ModuleSpecifierRef {
  specifier: string;
  lineNo: number;
}

function extractRelativeSpecifiers(sf: ts.SourceFile): ModuleSpecifierRef[] {
  const refs: ModuleSpecifierRef[] = [];

  function record(literal: ts.StringLiteralLike): void {
    const spec = literal.text;
    if (!spec.startsWith('./') && !spec.startsWith('../')) {
      return;
    }
    const lineNo = sf.getLineAndCharacterOfPosition(literal.getStart(sf)).line + 1;
    refs.push({ specifier: spec, lineNo });
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      record(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node.moduleSpecifier);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1
    ) {
      const firstArg = node.arguments[0];
      if (firstArg && ts.isStringLiteralLike(firstArg)) {
        record(firstArg);
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      record(node.moduleReference.expression);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      record(node.argument.literal);
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return refs;
}

function detectImportCycles(graph: Map<string, string[]>, errors: string[]): void {
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const reported = new Set<string>();
  const nodes = [...graph.keys()].sort((a, b) => a.localeCompare(b));

  function canonicalCycleKey(cycleWithoutClose: string[]): string {
    let minIdx = 0;
    for (let i = 1; i < cycleWithoutClose.length; i += 1) {
      if (cycleWithoutClose[i]!.localeCompare(cycleWithoutClose[minIdx]!) < 0) {
        minIdx = i;
      }
    }
    const rotated = [...cycleWithoutClose.slice(minIdx), ...cycleWithoutClose.slice(0, minIdx)];
    return rotated.join(' -> ');
  }

  function dfs(node: string): void {
    state.set(node, 1);
    stack.push(node);

    const targets = graph.get(node) ?? [];
    for (const target of targets) {
      const targetState = state.get(target) ?? 0;
      if (targetState === 1) {
        const startIdx = stack.indexOf(target);
        const rawCycle = stack.slice(startIdx);
        const key = canonicalCycleKey(rawCycle);
        if (!reported.has(key)) {
          reported.add(key);
          errors.push(`[IMPORT_CYCLE] ${[...rawCycle, target].join(' -> ')}`);
        }
      } else if (targetState === 0 && graph.has(target)) {
        dfs(target);
      }
    }

    stack.pop();
    state.set(node, 2);
  }

  for (const node of nodes) {
    if ((state.get(node) ?? 0) === 0) {
      dfs(node);
    }
  }
}

type CapabilityKind = 'fetch' | 'storage';

function getCapabilityForIdentifier(name: string): CapabilityKind | null {
  if (name === 'fetch') return 'fetch';
  if (name === 'localStorage' || name === 'sessionStorage') return 'storage';
  return null;
}

function collectBindingNames(name: ts.BindingName, out: Set<string>): void {
  if (ts.isIdentifier(name)) {
    out.add(name.text);
  } else if (ts.isObjectBindingPattern(name)) {
    for (const el of name.elements) {
      collectBindingNames(el.name, out);
    }
  } else if (ts.isArrayBindingPattern(name)) {
    for (const el of name.elements) {
      if (ts.isBindingElement(el)) {
        collectBindingNames(el.name, out);
      }
    }
  }
}

function collectVarDeclarationsInNode(node: ts.Node, out: Set<string>): void {
  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  ) {
    return;
  }

  if (
    ts.isVariableDeclarationList(node) &&
    (node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) === 0
  ) {
    for (const decl of node.declarations) {
      collectBindingNames(decl.name, out);
    }
  }

  ts.forEachChild(node, (child) => collectVarDeclarationsInNode(child, out));
}

function collectBlockBindings(
  statements: readonly ts.Statement[],
  hoistVars: boolean,
): Set<string> {
  const names = new Set<string>();
  for (const stmt of statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        collectBindingNames(decl.name, names);
      }
    } else if (ts.isFunctionDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text);
    } else if (ts.isClassDeclaration(stmt) && stmt.name) {
      names.add(stmt.name.text);
    } else if (ts.isEnumDeclaration(stmt)) {
      names.add(stmt.name.text);
    } else if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      if (stmt.importClause.name) {
        names.add(stmt.importClause.name.text);
      }
      const bindings = stmt.importClause.namedBindings;
      if (bindings) {
        if (ts.isNamespaceImport(bindings)) {
          names.add(bindings.name.text);
        } else if (ts.isNamedImports(bindings)) {
          for (const el of bindings.elements) {
            names.add(el.name.text);
          }
        }
      }
    } else if (ts.isImportEqualsDeclaration(stmt)) {
      names.add(stmt.name.text);
    }

    if (hoistVars) {
      collectVarDeclarationsInNode(stmt, names);
    }
  }
  return names;
}

function mergeScope(
  parent: ReadonlySet<string>,
  additions: ReadonlySet<string>,
): ReadonlySet<string> {
  if (additions.size === 0) {
    return parent;
  }
  const merged = new Set(parent);
  for (const name of additions) {
    merged.add(name);
  }
  return merged;
}

function unwrapExpression(expr: ts.Expression): ts.Expression {
  let current = expr;
  while (true) {
    if (ts.isParenthesizedExpression(current)) {
      current = current.expression;
    } else if (
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current)
    ) {
      current = current.expression;
    } else {
      return current;
    }
  }
}

function isGlobalHostExpr(expr: ts.Expression, scope: ReadonlySet<string>): boolean {
  const unwrapped = unwrapExpression(expr);
  if (ts.isIdentifier(unwrapped)) {
    return (
      (unwrapped.text === 'window' ||
        unwrapped.text === 'globalThis' ||
        unwrapped.text === 'self') &&
      !scope.has(unwrapped.text)
    );
  }
  if (ts.isPropertyAccessExpression(unwrapped)) {
    return (
      (unwrapped.name.text === 'window' ||
        unwrapped.name.text === 'globalThis' ||
        unwrapped.name.text === 'self') &&
      isGlobalHostExpr(unwrapped.expression, scope)
    );
  }
  return false;
}

function checkCapabilityAdapters(
  relPath: string,
  sf: ts.SourceFile,
  config: HarnessConfig,
  errors: string[],
): void {
  const allowFetch = config.capabilityAdapters.fetch.includes(relPath);
  const allowStorage = config.capabilityAdapters.storage.includes(relPath);

  function report(cap: CapabilityKind, node: ts.Node, exprText: string): void {
    const lineNo = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
    if (cap === 'fetch' && !allowFetch) {
      errors.push(
        `[FORBIDDEN_FETCH] ${relPath}:${lineNo}: "${exprText}" is only allowed in ${config.capabilityAdapters.fetch.join(', ')}`,
      );
    } else if (cap === 'storage' && !allowStorage) {
      errors.push(
        `[FORBIDDEN_STORAGE] ${relPath}:${lineNo}: "${exprText}" is only allowed in ${config.capabilityAdapters.storage.join(', ')}`,
      );
    }
  }

  function visitBindingDefaults(name: ts.BindingName, scope: ReadonlySet<string>): void {
    if (ts.isObjectBindingPattern(name)) {
      for (const el of name.elements) {
        if (el.propertyName && ts.isComputedPropertyName(el.propertyName)) {
          visit(el.propertyName.expression, scope);
        }
        visitBindingDefaults(el.name, scope);
        if (el.initializer) {
          visit(el.initializer, scope);
        }
      }
    } else if (ts.isArrayBindingPattern(name)) {
      for (const el of name.elements) {
        if (ts.isBindingElement(el)) {
          visitBindingDefaults(el.name, scope);
          if (el.initializer) {
            visit(el.initializer, scope);
          }
        }
      }
    }
  }

  function visitFunctionLike(
    node:
      | ts.FunctionDeclaration
      | ts.FunctionExpression
      | ts.ArrowFunction
      | ts.MethodDeclaration
      | ts.ConstructorDeclaration
      | ts.GetAccessorDeclaration
      | ts.SetAccessorDeclaration,
    scope: ReadonlySet<string>,
  ): void {
    if (
      (ts.isMethodDeclaration(node) ||
        ts.isGetAccessorDeclaration(node) ||
        ts.isSetAccessorDeclaration(node)) &&
      ts.isComputedPropertyName(node.name)
    ) {
      visit(node.name.expression, scope);
    }

    const fnScope = new Set(scope);
    if ((ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) && node.name) {
      fnScope.add(node.name.text);
    }

    for (const param of node.parameters) {
      visitBindingDefaults(param.name, fnScope);
      if (param.initializer) {
        visit(param.initializer, fnScope);
      }
      collectBindingNames(param.name, fnScope);
    }

    if (node.body) {
      if (ts.isBlock(node.body)) {
        const bodyScope = mergeScope(fnScope, collectBlockBindings(node.body.statements, true));
        for (const stmt of node.body.statements) {
          visit(stmt, bodyScope);
        }
      } else {
        visit(node.body, fnScope);
      }
    }
  }

  function visit(node: ts.Node, scope: ReadonlySet<string>): void {
    if (
      ts.isTypeNode(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isImportEqualsDeclaration(node) ||
      ts.isTypeParameterDeclaration(node) ||
      ts.isExportSpecifier(node) ||
      ts.isMetaProperty(node) ||
      ts.isBreakStatement(node) ||
      ts.isContinueStatement(node) ||
      ts.isJsxClosingElement(node)
    ) {
      return;
    }

    if (ts.isSourceFile(node)) {
      const fileScope = mergeScope(scope, collectBlockBindings(node.statements, true));
      for (const stmt of node.statements) {
        visit(stmt, fileScope);
      }
      return;
    }

    if (ts.isBlock(node)) {
      const blockScope = mergeScope(scope, collectBlockBindings(node.statements, false));
      for (const stmt of node.statements) {
        visit(stmt, blockScope);
      }
      return;
    }

    if (ts.isCaseClause(node) || ts.isDefaultClause(node)) {
      if (ts.isCaseClause(node)) {
        visit(node.expression, scope);
      }
      const clauseScope = mergeScope(scope, collectBlockBindings(node.statements, false));
      for (const stmt of node.statements) {
        visit(stmt, clauseScope);
      }
      return;
    }

    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      visitFunctionLike(node, scope);
      return;
    }

    if (ts.isForStatement(node)) {
      const loopScope = new Set(scope);
      if (node.initializer && ts.isVariableDeclarationList(node.initializer)) {
        for (const decl of node.initializer.declarations) {
          collectBindingNames(decl.name, loopScope);
        }
      }
      if (node.initializer) visit(node.initializer, loopScope);
      if (node.condition) visit(node.condition, loopScope);
      if (node.incrementor) visit(node.incrementor, loopScope);
      visit(node.statement, loopScope);
      return;
    }

    if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const loopScope = new Set(scope);
      if (ts.isVariableDeclarationList(node.initializer)) {
        for (const decl of node.initializer.declarations) {
          collectBindingNames(decl.name, loopScope);
        }
        visit(node.initializer, loopScope);
      } else {
        visit(node.initializer, scope);
      }
      visit(node.expression, scope);
      visit(node.statement, loopScope);
      return;
    }

    if (ts.isCatchClause(node)) {
      const catchScope = new Set(scope);
      if (node.variableDeclaration) {
        visitBindingDefaults(node.variableDeclaration.name, catchScope);
        collectBindingNames(node.variableDeclaration.name, catchScope);
      }
      visit(node.block, catchScope);
      return;
    }

    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const classScope = new Set(scope);
      if (node.name) {
        classScope.add(node.name.text);
      }
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ExtendsKeyword) {
            for (const heritageType of clause.types) {
              visit(heritageType.expression, classScope);
            }
          }
        }
      }
      for (const member of node.members) {
        visit(member, classScope);
      }
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      if (
        ts.isObjectBindingPattern(node.name) &&
        node.initializer &&
        isGlobalHostExpr(node.initializer, scope)
      ) {
        for (const el of node.name.elements) {
          let propName: string | null = null;
          if (el.propertyName) {
            if (ts.isIdentifier(el.propertyName) || ts.isStringLiteralLike(el.propertyName)) {
              propName = el.propertyName.text;
            } else if (
              ts.isComputedPropertyName(el.propertyName) &&
              ts.isStringLiteralLike(el.propertyName.expression)
            ) {
              propName = el.propertyName.expression.text;
            }
          } else if (ts.isIdentifier(el.name)) {
            propName = el.name.text;
          }
          if (propName) {
            const cap = getCapabilityForIdentifier(propName);
            if (cap) {
              report(cap, el, `${node.initializer.getText(sf)}.${propName}`);
            }
          }
        }
      }
      visitBindingDefaults(node.name, scope);
      if (node.initializer) {
        visit(node.initializer, scope);
      }
      return;
    }

    if (ts.isPropertyAccessExpression(node)) {
      const cap = getCapabilityForIdentifier(node.name.text);
      if (cap && isGlobalHostExpr(node.expression, scope)) {
        report(cap, node, `${node.expression.getText(sf)}.${node.name.text}`);
      }
      visit(node.expression, scope);
      return;
    }

    if (ts.isElementAccessExpression(node)) {
      if (ts.isStringLiteralLike(node.argumentExpression)) {
        const cap = getCapabilityForIdentifier(node.argumentExpression.text);
        if (cap && isGlobalHostExpr(node.expression, scope)) {
          report(
            cap,
            node,
            `${node.expression.getText(sf)}[${node.argumentExpression.getText(sf)}]`,
          );
        }
      }
      visit(node.expression, scope);
      visit(node.argumentExpression, scope);
      return;
    }

    if (ts.isPropertyAssignment(node)) {
      if (ts.isComputedPropertyName(node.name)) {
        visit(node.name.expression, scope);
      }
      visit(node.initializer, scope);
      return;
    }

    if (ts.isShorthandPropertyAssignment(node)) {
      visit(node.name, scope);
      if (node.objectAssignmentInitializer) {
        visit(node.objectAssignmentInitializer, scope);
      }
      return;
    }

    if (ts.isPropertyDeclaration(node)) {
      if (ts.isComputedPropertyName(node.name)) {
        visit(node.name.expression, scope);
      }
      if (node.initializer) {
        visit(node.initializer, scope);
      }
      return;
    }

    if (ts.isJsxAttribute(node)) {
      if (node.initializer) {
        visit(node.initializer, scope);
      }
      return;
    }

    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isPropertyAccessExpression(node.tagName)) {
        visit(node.tagName, scope);
      }
      visit(node.attributes, scope);
      return;
    }

    if (ts.isLabeledStatement(node)) {
      visit(node.statement, scope);
      return;
    }

    if (ts.isIdentifier(node)) {
      const cap = getCapabilityForIdentifier(node.text);
      if (cap && !scope.has(node.text)) {
        report(cap, node, node.text);
      }
      return;
    }

    ts.forEachChild(node, (child) => visit(child, scope));
  }

  visit(sf, new Set<string>());
}

function countPhysicalLines(content: string): number {
  if (content.length === 0) return 0;
  const normalized = content.endsWith('\n') ? content.slice(0, -1) : content;
  return normalized.split(/\r?\n/).length;
}

function describeFunctionName(node: ts.Node, sf: ts.SourceFile): string {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)) &&
    node.name
  ) {
    return node.name.getText(sf);
  }
  const parent = node.parent;
  if (parent) {
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
    if (ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) {
      return parent.name.text;
    }
  }
  return '<anonymous>';
}

function checkCodeShape(
  relPath: string,
  content: string,
  sf: ts.SourceFile,
  config: HarnessConfig,
  warnings: string[],
): void {
  const fileLines = countPhysicalLines(content);
  if (fileLines > config.shapeReview.maxFileLines) {
    warnings.push(
      `[SHAPE-REVIEW] ${relPath}: file has ${fileLines} lines (> ${config.shapeReview.maxFileLines})`,
    );
  }

  function visit(node: ts.Node): void {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
      const span = endLine - startLine + 1;
      if (span > config.shapeReview.maxFunctionLines) {
        warnings.push(
          `[SHAPE-REVIEW] ${relPath}:${startLine}-${endLine}: ${describeFunctionName(node, sf)} spans ${span} lines (> ${config.shapeReview.maxFunctionLines})`,
        );
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sf);
}

export function runGuardrails(projectRoot: string): GuardrailResult {
  const root = path.resolve(projectRoot);
  const config = loadConfig(root);
  const errors: string[] = [];
  const warnings: string[] = [];

  const foundationSet = new Set(config.foundationFiles);
  const forbiddenSrcBasenames = new Set(config.forbiddenFileBasenamesInSrc);
  const allFiles = walkFiles(root, config);
  const importGraph = new Map<string, string[]>();

  for (const relPath of allFiles) {
    const absPath = path.join(root, relPath);
    const basename = path.posix.basename(relPath);

    if (relPath.startsWith('src/') && forbiddenSrcBasenames.has(basename)) {
      errors.push(
        `[FORBIDDEN_PRESETS_FILE] ${relPath}: hardcoded presets files are prohibited; use /api/v1/admin/templates`,
      );
    } else if (!isDeclaredFile(relPath, config)) {
      errors.push(`[UNKNOWN_FILE] ${relPath}: file is not declared in harness.config.json`);
    }

    const content = fs.readFileSync(absPath, 'utf8');
    checkHygiene(relPath, content, errors);

    if (!relPath.endsWith('.ts') && !relPath.endsWith('.tsx')) {
      continue;
    }

    const scriptKind = relPath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(absPath, content, ts.ScriptTarget.Latest, true, scriptKind);

    const specifiers = extractRelativeSpecifiers(sf);
    const resolvedTargets: string[] = [];

    for (const ref of specifiers) {
      const targetRel = resolveRelativeModule(root, absPath, ref.specifier);
      if (!targetRel) {
        errors.push(
          `[UNRESOLVED_IMPORT] ${relPath}:${ref.lineNo}: cannot resolve relative import "${ref.specifier}"`,
        );
        continue;
      }

      resolvedTargets.push(targetRel);

      if (
        relPath.startsWith('src/') &&
        (targetRel.startsWith('tests/') || targetRel.startsWith('scripts/'))
      ) {
        errors.push(
          `[FORBIDDEN_LAYER_IMPORT] ${relPath}:${ref.lineNo}: src module must not import ${targetRel}`,
        );
      }

      if (
        foundationSet.has(relPath) &&
        config.uiRoots.some((ui) => targetRel === ui || targetRel.startsWith(ui))
      ) {
        errors.push(
          `[REVERSE_DEPENDENCY] ${relPath}:${ref.lineNo}: foundation module must not import UI module ${targetRel}`,
        );
      }
    }

    importGraph.set(relPath, resolvedTargets);

    if (relPath.startsWith('src/')) {
      checkCapabilityAdapters(relPath, sf, config, errors);
      checkCodeShape(relPath, content, sf, config, warnings);
    }
  }

  detectImportCycles(importGraph, errors);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
  }
}

if (isDirectExecution()) {
  const targetRoot = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
  const result = runGuardrails(targetRoot);

  for (const warning of result.warnings) {
    console.warn(warning);
  }

  if (!result.ok) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exit(1);
  }

  console.log(
    `Guardrails passed (0 errors, ${result.warnings.length} shape-review warning${result.warnings.length === 1 ? '' : 's'}).`,
  );
}
