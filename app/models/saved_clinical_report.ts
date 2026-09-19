import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'
import Patient from '#models/patient'
import Company from '#models/company'

export default class SavedClinicalReport extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare userId: number

  @column()
  declare companyId: number | null

  @column()
  declare patientId: number

  @column()
  declare scaleKey: string

  @column()
  declare scaleTitle: string

  @column()
  declare tone: string

  @column()
  declare reportText: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => Patient)
  declare patient: BelongsTo<typeof Patient>

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>
}
