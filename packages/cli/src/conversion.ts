import type { FileHandle } from 'node:fs/promises'
import type { DecodeOptions, DecodeStreamOptions, EncodeOptions } from '../../toon/src/index.ts'
import type { InputSource } from './types.ts'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import process from 'node:process'
import { consola } from 'consola'
import { estimateTokenCount } from 'tokenx'
import { decodeStream, encode, encodeLines } from '../../toon/src/index.ts'
import { jsonStreamFromEvents } from './json-from-events.ts'
import { formatInputLabel, readInput, readLinesFromSource } from './utils.ts'

export async function encodeToToon(config: {
  input: InputSource
  output?: string
  indent: NonNullable<EncodeOptions['indent']>
  delimiter: NonNullable<EncodeOptions['delimiter']>
  printStats: boolean
}): Promise<void> {
  const jsonContent = await readInput(config.input)

  let data: unknown
  try {
    data = JSON.parse(jsonContent)
  }
  catch (error) {
    throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`)
  }

  const encodeOptions: EncodeOptions = {
    delimiter: config.delimiter,
    indent: config.indent,
  }

  // When printing stats, we need the full string for token counting
  if (config.printStats) {
    const toonOutput = encode(data, encodeOptions)

    if (config.output) {
      await fsp.writeFile(config.output, toonOutput, 'utf-8')
    }
    else {
      console.log(toonOutput)
    }

    const jsonTokens = estimateTokenCount(jsonContent)
    const toonTokens = estimateTokenCount(toonOutput)
    const diff = jsonTokens - toonTokens
    const percent = ((diff / jsonTokens) * 100).toFixed(1)

    if (config.output) {
      const relativeInputPath = formatInputLabel(config.input)
      const relativeOutputPath = path.relative(process.cwd(), config.output)
      consola.success(`Encoded \`${relativeInputPath}\` → \`${relativeOutputPath}\``)
    }

    console.log()
    consola.info(`Token estimates: ~${jsonTokens} (JSON) → ~${toonTokens} (TOON)`)
    consola.success(`Saved ~${diff} tokens (-${percent}%)`)
  }
  else {
    await writeStreamingToon(encodeLines(data, encodeOptions), config.output)

    if (config.output) {
      const relativeInputPath = formatInputLabel(config.input)
      const relativeOutputPath = path.relative(process.cwd(), config.output)
      consola.success(`Encoded \`${relativeInputPath}\` → \`${relativeOutputPath}\``)
    }
  }
}

export async function decodeToJson(config: {
  input: InputSource
  output?: string
  indent: NonNullable<DecodeOptions['indent']>
  strict: NonNullable<DecodeOptions['strict']>
}): Promise<void> {
  const lineSource = readLinesFromSource(config.input)

  const decodeStreamOptions: DecodeStreamOptions = {
    indent: config.indent,
    strict: config.strict,
  }

  const events = decodeStream(lineSource, decodeStreamOptions)
  const jsonChunks = jsonStreamFromEvents(events, config.indent)

  await writeStreamingJson(jsonChunks, config.output)

  if (config.output) {
    const relativeInputPath = formatInputLabel(config.input)
    const relativeOutputPath = path.relative(process.cwd(), config.output)
    consola.success(`Decoded \`${relativeInputPath}\` → \`${relativeOutputPath}\``)
  }
}

/**
 * Streams JSON chunks to a file or stdout, one at a time without buffering the full string.
 */
async function writeStreamingJson(
  chunks: AsyncIterable<string> | Iterable<string>,
  outputPath?: string,
): Promise<void> {
  if (outputPath) {
    let fileHandle: FileHandle | undefined

    try {
      fileHandle = await fsp.open(outputPath, 'w')

      for await (const chunk of chunks) {
        await fileHandle.write(chunk)
      }
    }
    finally {
      await fileHandle?.close()
    }
  }
  else {
    for await (const chunk of chunks) {
      process.stdout.write(chunk)
    }

    // Add final newline for stdout
    process.stdout.write('\n')
  }
}

/**
 * Streams TOON lines to a file or stdout, one at a time without buffering the full string.
 */
async function writeStreamingToon(
  lines: Iterable<string>,
  outputPath?: string,
): Promise<void> {
  let isFirst = true

  if (outputPath) {
    let fileHandle: FileHandle | undefined

    try {
      fileHandle = await fsp.open(outputPath, 'w')

      for (const line of lines) {
        if (!isFirst)
          await fileHandle.write('\n')

        await fileHandle.write(line)
        isFirst = false
      }
    }
    finally {
      await fileHandle?.close()
    }
  }
  else {
    for (const line of lines) {
      if (!isFirst)
        process.stdout.write('\n')

      process.stdout.write(line)
      isFirst = false
    }

    // Add final newline for stdout
    process.stdout.write('\n')
  }
}
