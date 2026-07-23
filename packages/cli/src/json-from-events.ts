import type { JsonStreamEvent } from '../../toon/src/types.ts'

/**
 * Context for tracking JSON structure state during event streaming.
 */
type JsonContext
  = | { type: 'object', needsComma: boolean, expectValue: boolean }
    | { type: 'array', needsComma: boolean }

/**
 * Converts a stream of `JsonStreamEvent` into formatted JSON string chunks,
 * streaming decode output without building the full value in memory.
 */
export async function* jsonStreamFromEvents(
  events: AsyncIterable<JsonStreamEvent>,
  indent: number = 2,
): AsyncIterable<string> {
  const stack: JsonContext[] = []
  let depth = 0

  for await (const event of events) {
    const parent = stack.length > 0 ? stack[stack.length - 1] : undefined

    switch (event.type) {
      case 'startObject': {
        if (parent) {
          if (parent.type === 'array' && parent.needsComma) {
            yield ','
          }
          else if (parent.type === 'object' && !parent.expectValue) {
            // Object field value already emitted, this is a nested object after a key.
            // The comma is handled by the key event.
          }
        }

        if (indent > 0 && parent) {
          if (parent.type === 'array') {
            yield '\n'
            yield ' '.repeat(depth * indent)
          }
        }

        yield '{'
        stack.push({ type: 'object', needsComma: false, expectValue: false })
        depth++
        break
      }

      case 'endObject': {
        const context = stack.pop()
        if (!context || context.type !== 'object') {
          throw new Error('Mismatched endObject event')
        }

        depth--

        if (indent > 0 && context.needsComma) {
          yield '\n'
          yield ' '.repeat(depth * indent)
        }

        yield '}'

        const newParent = stack.length > 0 ? stack[stack.length - 1] : undefined
        if (newParent) {
          if (newParent.type === 'object') {
            newParent.expectValue = false
            newParent.needsComma = true
          }
          else if (newParent.type === 'array') {
            newParent.needsComma = true
          }
        }
        break
      }

      case 'startArray': {
        if (parent) {
          if (parent.type === 'array' && parent.needsComma) {
            yield ','
          }
        }

        if (indent > 0 && parent) {
          if (parent.type === 'array') {
            yield '\n'
            yield ' '.repeat(depth * indent)
          }
        }

        yield '['
        stack.push({
          type: 'array',
          needsComma: false,
        })
        depth++
        break
      }

      case 'endArray': {
        const context = stack.pop()
        if (!context || context.type !== 'array') {
          throw new Error('Mismatched endArray event')
        }

        depth--

        if (indent > 0 && context.needsComma) {
          yield '\n'
          yield ' '.repeat(depth * indent)
        }

        yield ']'

        const newParent = stack.length > 0 ? stack[stack.length - 1] : undefined
        if (newParent) {
          if (newParent.type === 'object') {
            newParent.expectValue = false
            newParent.needsComma = true
          }
          else if (newParent.type === 'array') {
            newParent.needsComma = true
          }
        }
        break
      }

      case 'key': {
        if (!parent || parent.type !== 'object') {
          throw new Error('Key event outside of object context')
        }

        if (parent.needsComma) {
          yield ','
        }

        if (indent > 0) {
          yield '\n'
          yield ' '.repeat(depth * indent)
        }

        yield JSON.stringify(event.key)
        yield indent > 0 ? ': ' : ':'

        parent.expectValue = true
        parent.needsComma = true
        break
      }

      case 'primitive': {
        if (parent) {
          if (parent.type === 'array' && parent.needsComma) {
            yield ','
          }
          else if (parent.type === 'object' && !parent.expectValue) {
            // This shouldn't happen in well-formed events
            throw new Error('Primitive event in object without preceding key')
          }
        }

        if (indent > 0 && parent && parent.type === 'array') {
          yield '\n'
          yield ' '.repeat(depth * indent)
        }

        yield JSON.stringify(event.value)

        if (parent) {
          if (parent.type === 'object') {
            parent.expectValue = false
            // needsComma already true from key event
          }
          else if (parent.type === 'array') {
            parent.needsComma = true
          }
        }
        break
      }
    }
  }

  if (stack.length !== 0) {
    throw new Error('Incomplete event stream: unclosed objects or arrays')
  }
}
