import type { BlankLineInfo, Depth, ParsedLine } from '../types.ts'
import { CARRIAGE_RETURN, COMMENT_MARKER, SPACE, TAB } from '../constants.ts'
import { ToonDecodeError } from './errors.ts'

// #region Scan state

export interface StreamingScanState {
  lineNumber: number
  blankLines: BlankLineInfo[]
}

export function createScanState(): StreamingScanState {
  return {
    lineNumber: 0,
    blankLines: [],
  }
}

// #endregion

// #region Line parsing

export function parseLineIncremental(
  raw: string,
  state: StreamingScanState,
  indentSize: number,
  strict: boolean,
): ParsedLine | undefined {
  state.lineNumber++
  const lineNumber = state.lineNumber

  // A trailing carriage return belongs to a CRLF line terminator, not to
  // the line's content.
  if (raw[raw.length - 1] === CARRIAGE_RETURN) {
    raw = raw.slice(0, -1)
  }

  let indent = 0
  while (indent < raw.length && raw[indent] === SPACE) {
    indent++
  }

  const content = raw.slice(indent)

  // Comment lines vanish in a lexical pre-pass: they are removed before
  // blank-line tracking and strict validation, and are never counted as
  // rows, items, entries, or blank lines.
  if (content[0] === COMMENT_MARKER) {
    return undefined
  }

  if (!content.trim()) {
    const depth = computeDepthFromIndent(indent, indentSize)
    state.blankLines.push({ lineNumber, indent, depth })
    return undefined
  }

  const depth = computeDepthFromIndent(indent, indentSize)

  if (strict) {
    // Find the full leading whitespace region (spaces and tabs)
    let whitespaceEndIndex = 0
    while (
      whitespaceEndIndex < raw.length
      && (raw[whitespaceEndIndex] === SPACE || raw[whitespaceEndIndex] === TAB)
    ) {
      whitespaceEndIndex++
    }

    if (raw.slice(0, whitespaceEndIndex).includes(TAB)) {
      throw new ToonDecodeError(
        'Tabs are not allowed in indentation in strict mode',
        { line: lineNumber, source: raw },
      )
    }

    if (indent > 0 && indent % indentSize !== 0) {
      throw new ToonDecodeError(
        `Indentation must be exact multiple of ${indentSize}, but found ${indent} spaces`,
        { line: lineNumber, source: raw },
      )
    }
  }

  return { raw, indent, content, depth, lineNumber }
}

export function* parseLinesSync(
  source: Iterable<string>,
  indentSize: number,
  strict: boolean,
  state: StreamingScanState,
): Generator<ParsedLine> {
  for (const raw of source) {
    const parsedLine = parseLineIncremental(raw, state, indentSize, strict)

    if (parsedLine !== undefined) {
      yield parsedLine
    }
  }
}

export async function* parseLinesAsync(
  source: AsyncIterable<string>,
  indentSize: number,
  strict: boolean,
  state: StreamingScanState,
): AsyncGenerator<ParsedLine> {
  for await (const raw of source) {
    const parsedLine = parseLineIncremental(raw, state, indentSize, strict)

    if (parsedLine !== undefined) {
      yield parsedLine
    }
  }
}

function computeDepthFromIndent(indentSpaces: number, indentSize: number): Depth {
  return Math.floor(indentSpaces / indentSize)
}

// #endregion
