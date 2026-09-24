import vine from '@vinejs/vine'

export const createEvaluationValidator = vine.compile(
  vine.object({
    date: vine.string().trim().optional(), // date string e.g. YYYY-MM-DD
    scores: vine.record(vine.any()).optional(),
    overall: vine.number().min(0).max(100).nullable().optional(),
  })
)

