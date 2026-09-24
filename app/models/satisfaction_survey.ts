import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Patient from '#models/patient'
import User from '#models/user'
import Company from '#models/company'

export default class SatisfactionSurvey extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number | null

  @column()
  declare patientId: number

  @column()
  declare userId: number | null

  @column()
  declare token: string

  @column()
  declare status: string // 'pendente' | 'respondido'

  @column()
  declare npsScore: number | null

  @column()
  declare therapistRating: number | null

  @column()
  declare recoveryRating: number | null

  @column()
  declare structureRating: number | null

  @column()
  declare feedback: string | null

  @column.dateTime()
  declare answeredAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Patient)
  declare patient: BelongsTo<typeof Patient>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>
}
