import { BaseModel, column, belongsTo, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasOne } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'
import Patient from '#models/patient'
import Company from '#models/company'
import FormTemplate from '#models/form_template'
import FinancialRecord from '#models/financial_record'

export default class Appointment extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number | null

  @column()
  declare userId: number

  @column()
  declare patientId: number

  @column()
  declare templateId: number | null

  @column()
  declare specialty: string

  @column.date()
  declare date: DateTime

  @column()
  declare startTime: string

  @column()
  declare endTime: string

  @column()
  declare status: 'pendente' | 'confirmado' | 'em_atendimento' | 'finalizado' | 'cancelado' | 'ausente' | 'desmarcado'

  @column()
  declare notes: string | null

  @column({
    prepare: (value: any) => (value ? (typeof value === 'string' ? value : JSON.stringify(value)) : null),
    consume: (value: any) => {
      if (!value) return []
      if (Array.isArray(value)) return value
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : [parsed]
      } catch {
        return typeof value === 'string' && value.trim() ? [value] : []
      }
    },
  })
  declare images: string[] | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Patient)
  declare patient: BelongsTo<typeof Patient>

  @belongsTo(() => FormTemplate, {
    foreignKey: 'templateId',
  })
  declare template: BelongsTo<typeof FormTemplate>

  @hasOne(() => FinancialRecord)
  declare financialRecord: HasOne<typeof FinancialRecord>
}
