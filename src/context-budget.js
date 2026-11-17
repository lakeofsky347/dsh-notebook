import { Buffer } from 'node:buffer'

const positiveInteger = value => Number.isSafeInteger(value) && value > 0
const bytes = text => Buffer.byteLength(text, 'utf8')
const budgetError = message => Object.assign(new Error(message), { code: 'notebook/context-budget' })

/** Use the mounted native pruner; its durable replacements retain the raw journal. */
export function pruneWorkbenchContext(agent, agentPresets) {
  if (!agent?.session) return null
  // Native preset services can live inside an isolated composition group,
  // outside agent.ctx.get(). Resolve that group through the public registry.
  const pruner = agent.ctx?.get?.('toolResultPruner')
    ?? agentPresets?.serviceFor?.(agent, 'toolResultPruner')
  if (typeof pruner?.pruneSession !== 'function') return null
  // Do not turn persistence failures into a successful no-op.
  return pruner.pruneSession(agent.session)
}

/** Reserve completion and framing space before assembling a standalone artifact call. */
export async function resolveArtifactBudget(llm, selected, maxTokens, signal) {
  if (!positiveInteger(maxTokens)) throw new TypeError('maxTokens must be a positive integer')
  signal?.throwIfAborted()
  const info = typeof llm?.resolveModelInfo === 'function'
    ? await llm.resolveModelInfo(selected.provider, selected.model, signal)
    : null
  signal?.throwIfAborted()
  // defaultMaxTokens is a route default, not a claimed model hard maximum.
  // Choosing the smaller cap here avoids unexpectedly expanding that route's output.
  const requestedOutput = positiveInteger(info?.defaultMaxTokens)
    ? Math.min(maxTokens, info.defaultMaxTokens)
    : maxTokens
  const contextWindow = positiveInteger(info?.context?.contextWindow) ? info.context.contextWindow : null
  if (contextWindow === null) return { maxTokens: requestedOutput, inputTokenBudget: null, contextWindow }
  const output = Math.min(requestedOutput, Math.max(1, Math.floor(contextWindow / 4)))
  const guard = Math.min(1024, Math.max(1, Math.floor(contextWindow / 8)))
  const inputTokenBudget = contextWindow - output - guard
  if (inputTokenBudget < 1) throw budgetError('所选模型的上下文窗口过小，无法同时容纳资料与回答。请选择上下文更大的模型。')
  return { maxTokens: output, inputTokenBudget, contextWindow }
}

function prefixWithinBytes(text, maximum) {
  if (bytes(text) <= maximum) return text
  let size = 0
  let end = 0
  for (const character of text) {
    const next = bytes(character)
    if (size + next > maximum) break
    size += next
    end += character.length
  }
  return text.slice(0, end).trimEnd()
}

/** Share a source's allowance between its passages, redistributing unused space. */
function passageAllowances(lengths, allowance) {
  const assigned = lengths.map(() => 0)
  let remaining = allowance
  let active = lengths.map((_, index) => index)
  while (remaining > 0 && active.length) {
    const share = Math.max(1, Math.floor(remaining / active.length))
    for (const index of active) {
      const amount = Math.min(lengths[index] - assigned[index], share, remaining)
      assigned[index] += amount
      remaining -= amount
    }
    active = active.filter(index => assigned[index] < lengths[index])
  }
  return assigned
}

/**
 * Fit evidence, never the user's instructions, into a conservative UTF-8 token bound.
 * The callback rebuilds source metadata from each candidate passage set.
 */
export function fitArtifactPrompt(buildPrompt, passages, inputTokenBudget) {
  if (typeof buildPrompt !== 'function' || !Array.isArray(passages)) throw new TypeError('buildPrompt and passages are required')
  const originals = passages.filter(passage => typeof passage?.text === 'string' && passage.text.trim())
    .map(passage => ({ ...passage }))
  if (!originals.length) throw budgetError('没有可用于生成的正文片段。请先选择可用来源或补充资料后重试。')
  const render = selected => {
    const prompt = buildPrompt(selected)
    if (typeof prompt !== 'string') throw new TypeError('buildPrompt must return a string')
    return { prompt, passages: selected, estimatedTokens: bytes(prompt) }
  }
  const full = render(originals)
  if (inputTokenBudget === null || inputTokenBudget === undefined) return full
  if (!positiveInteger(inputTokenBudget)) throw new TypeError('inputTokenBudget must be a positive integer or null')
  // Covers the direct call's short system message and role/framing overhead.
  const margin = Math.max(1, Math.min(256, Math.floor(inputTokenBudget * 0.05)))
  const limit = inputTokenBudget - margin
  if (full.estimatedTokens <= limit) return full
  if (render([]).estimatedTokens > limit) {
    throw budgetError('生成要求、笔记本说明及固定提示已超过所选模型的上下文预算。请缩短要求或说明，或选择上下文更大的模型；原始要求不会被截断。')
  }

  const groups = new Map()
  for (const [index, passage] of originals.entries()) {
    const key = passage.sourceId ?? index
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(index)
  }
  const lengths = originals.map(passage => bytes(passage.text))
  const candidate = perSource => {
    const selected = originals.map(passage => ({ ...passage }))
    for (const indices of groups.values()) {
      const allowances = passageAllowances(indices.map(index => lengths[index]), perSource)
      indices.forEach((index, offset) => { selected[index].text = prefixWithinBytes(originals[index].text, allowances[offset]) })
    }
    return render(selected.filter(passage => passage.text.trim()))
  }

  // Retain a small useful excerpt from every represented source. If even that
  // cannot fit, fail explicitly instead of silently dropping whole sources.
  let lower = 128
  let upper = Math.max(...[...groups.values()].map(indices => indices.reduce((sum, index) => sum + lengths[index], 0)), lower)
  let best = candidate(lower)
  const covered = new Set(best.passages.map(passage => passage.sourceId))
  if (!best.passages.length || originals.some(passage => !covered.has(passage.sourceId)) || best.estimatedTokens > limit) {
    throw budgetError('所选模型的上下文预算不足以容纳这些来源的正文与引用。请减少本次选中的来源、缩短生成要求，或选择上下文更大的模型。')
  }
  while (lower < upper) {
    const middle = Math.floor((lower + upper + 1) / 2)
    const next = candidate(middle)
    if (next.estimatedTokens <= limit) { lower = middle; best = next }
    else upper = middle - 1
  }
  return best
}
