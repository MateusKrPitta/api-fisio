import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import CustomModule from '#models/custom_module'

export default class CustomField extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare moduleId: number

  @column()
  declare label: string

  @column()
  declare fieldType: 'text' | 'long_text' | 'number' | 'scale_0_10' | 'date' | 'single_select' | 'multi_select' | 'boolean'

  @column()
  declare options: string | null // JSON string of options array

  @column()
  declare unit: string | null // 'º', 'kg', 'cm', '0-10'

  @column()
  declare helpText: string | null

  @column()
  declare group: string | null

  @column()
  declare isRequired: boolean

  @column()
  declare sortOrder: number

  @belongsTo(() => CustomModule, {
    foreignKey: 'moduleId',
  })
  declare module: BelongsTo<typeof CustomModule>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
