import { BaseModel, column } from '@adonisjs/lucid/orm'
import { DateTime } from 'luxon'

export default class SystemSetting extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare key: string

  @column()
  declare value: string | null

  @column()
  declare description: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  public static async get(key: string, defaultValue: string | null = null): Promise<string | null> {
    const setting = await this.findBy('key', key)
    return setting?.value ?? defaultValue
  }

  public static async set(key: string, value: string | null, description?: string): Promise<SystemSetting> {
    return await this.updateOrCreate(
      { key },
      { key, value, ...(description ? { description } : {}) }
    )
  }
}
