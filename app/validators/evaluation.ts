import vine from '@vinejs/vine'

export const createEvaluationValidator = vine.compile(
  vine.object({
    date: vine.string().trim(), // date string e.g. YYYY-MM-DD
    scores: vine.object({
      physical_functioning: vine.number().min(0).max(100),
      role_physical: vine.number().min(0).max(100),
      role_emotional: vine.number().min(0).max(100),
      vitality: vine.number().min(0).max(100),
      mental_health: vine.number().min(0).max(100),
      social_functioning: vine.number().min(0).max(100),
      bodily_pain: vine.number().min(0).max(100),
      general_health: vine.number().min(0).max(100),
    }),
    overall: vine.number().min(0).max(100),
  })
)
