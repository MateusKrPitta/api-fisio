import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Patient from '#models/patient'

export default class Evaluation extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare patientId: number

  @column.date()
  declare date: DateTime

  @column({
    prepare: (value: any) => JSON.stringify(value),
    consume: (value: any) => {
      if (typeof value === 'string') {
        try {
          return JSON.parse(value)
        } catch {
          return {}
        }
      }
      return value || {}
    }
  })
  declare scores: Record<string, number>

  @column()
  declare overall: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Patient)
  declare patient: BelongsTo<typeof Patient>
}
