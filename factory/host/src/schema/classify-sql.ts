type SqlKind = "additive" | "blocking";

export interface ClassifiedSql {
  additive: string[];
  blocking: string[];
}

const BREAKPOINT_LINE = /^\s*--> statement-breakpoint\s*$/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /--[^\n]*/g;
const WHITESPACE = /\s+/g;
const TRAILING_SEMI = /;+$/;

const DROP_TABLE = /^DROP\s+TABLE\b/;
const DROP_COLUMN = /\bDROP\s+COLUMN\b/;
const ALTER_TABLE = /^ALTER\s+TABLE\b/;
const ALTER_DROP = /\bDROP\b/;
const CREATE_NEW_TABLE = /^CREATE\s+TABLE\s+[`"]?__NEW_/;
const ALTER_NEW_TABLE = /^ALTER\s+TABLE\s+[`"]?__NEW_/;
const RENAME_TO = /\bRENAME\s+TO\b/;
const INSERT_NEW = /^INSERT\s+INTO\s+[`"]?__NEW_/;
const CREATE_TABLE = /^CREATE\s+TABLE\b/;
const ALTER_ADD = /\bADD\b/;
const CREATE_INDEX = /^CREATE\s+(UNIQUE\s+)?INDEX\b/;
const DROP_INDEX = /^DROP\s+INDEX\b/;

function stripCommentsAndBreakpoints(statement: string): string {
  const withoutBreakpoints = statement
    .split("\n")
    .filter((line) => !BREAKPOINT_LINE.test(line))
    .join("\n");
  return withoutBreakpoints
    .replace(BLOCK_COMMENT, " ")
    .replace(LINE_COMMENT, " ")
    .replace(WHITESPACE, " ")
    .trim()
    .replace(TRAILING_SEMI, "");
}

function classifyNormalized(sql: string): SqlKind {
  const upper = sql.toUpperCase();
  if (DROP_TABLE.test(upper)) {
    return "blocking";
  }
  if (DROP_COLUMN.test(upper)) {
    return "blocking";
  }
  if (ALTER_TABLE.test(upper) && ALTER_DROP.test(upper)) {
    return "blocking";
  }
  if (CREATE_NEW_TABLE.test(upper)) {
    return "blocking";
  }
  if (ALTER_NEW_TABLE.test(upper) && RENAME_TO.test(upper)) {
    return "blocking";
  }
  if (INSERT_NEW.test(upper)) {
    return "blocking";
  }
  if (CREATE_TABLE.test(upper)) {
    return "additive";
  }
  if (ALTER_TABLE.test(upper) && ALTER_ADD.test(upper)) {
    return "additive";
  }
  if (CREATE_INDEX.test(upper)) {
    return "additive";
  }
  if (DROP_INDEX.test(upper)) {
    return "additive";
  }
  return "blocking";
}

export function classifySql(statements: string[]): ClassifiedSql {
  const additive: string[] = [];
  const blocking: string[] = [];
  for (const statement of statements) {
    const normalized = stripCommentsAndBreakpoints(statement);
    if (normalized === "") {
      continue;
    }
    if (classifyNormalized(normalized) === "additive") {
      additive.push(statement);
    } else {
      blocking.push(statement);
    }
  }
  return { additive, blocking };
}

export function describeBlockingSql(statements: string[]): string {
  return statements
    .map((statement) => {
      const normalized = stripCommentsAndBreakpoints(statement);
      return `  - ${normalized || statement.trim()}`;
    })
    .join("\n");
}
