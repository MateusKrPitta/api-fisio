import vine from '@vinejs/vine'

export const createEvaluationValidator = vine.compile(
  vine.object({
    date: vine.string().trim().optional(), // date string e.g. YYYY-MM-DD
    scores: vine.object({
      physical_functioning: vine.number().min(0).max(100).optional(),
      role_physical: vine.number().min(0).max(100).optional(),
      role_emotional: vine.number().min(0).max(100).optional(),
      vitality: vine.number().min(0).max(100).optional(),
      mental_health: vine.number().min(0).max(100).optional(),
      social_functioning: vine.number().min(0).max(100).optional(),
      bodily_pain: vine.number().min(0).max(100).optional(),
      general_health: vine.number().min(0).max(100).optional(),
    }).optional(),
    overall: vine.number().min(0).max(100).optional(),
  })
)

