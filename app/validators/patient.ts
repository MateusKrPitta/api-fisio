import vine from '@vinejs/vine'

export const createPatientValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(3).maxLength(255),
    cpf: vine.string().trim().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/),
    birthdate: vine.string().trim(), // Will be parsed as date/datetime
    gender: vine.string().trim().maxLength(50),
    phone: vine.string().trim().maxLength(30),
    email: vine.string().trim().email().nullable().optional(),
    notes: vine.string().trim().nullable().optional(),
    sessionRate: vine.number().nullable().optional(),
    session_rate: vine.number().nullable().optional(),
    maritalStatus: vine.string().trim().nullable().optional(),
    marital_status: vine.string().trim().nullable().optional(),
    emergencyContact: vine.string().trim().nullable().optional(),
    emergency_contact: vine.string().trim().nullable().optional(),
    templateId: vine.number().nullable().optional(),
    template_id: vine.number().nullable().optional(),
  })
)

export const updatePatientValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(3).maxLength(255).optional(),
    cpf: vine.string().trim().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/).optional(),
    birthdate: vine.string().trim().optional(),
    gender: vine.string().trim().maxLength(50).optional(),
    phone: vine.string().trim().maxLength(30).optional(),
    email: vine.string().trim().email().nullable().optional(),
    notes: vine.string().trim().nullable().optional(),
    sessionRate: vine.number().nullable().optional(),
    session_rate: vine.number().nullable().optional(),
    maritalStatus: vine.string().trim().nullable().optional(),
    marital_status: vine.string().trim().nullable().optional(),
    emergencyContact: vine.string().trim().nullable().optional(),
    emergency_contact: vine.string().trim().nullable().optional(),
    templateId: vine.number().nullable().optional(),
    template_id: vine.number().nullable().optional(),
  })
)
