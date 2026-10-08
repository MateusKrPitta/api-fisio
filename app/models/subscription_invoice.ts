import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import Company from '#models/company'

export default class SubscriptionInvoice extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number

  @column()
  declare title: string

  @column()
  declare amount: number

  @column.dateTime()
  declare dueDate: DateTime

  @column.dateTime()
  declare paidAt: DateTime | null

  @column()
  declare status: 'pending' | 'paid' | 'overdue' | 'canceled'

  @column()
  declare paymentMethod: 'pix' | 'credit_card' | 'bank_slip' | 'manual' | null

  @column()
  declare mpPaymentId: string | null

  @column()
  declare mpPreferenceId: string | null

  @column()
  declare pixQrCode: string | null

  @column({ columnName: 'pix_qr_code_base64' })
  declare pixQrCodeBase64: string | null

  @column()
  declare ticketUrl: string | null

  @column()
  declare notes: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>
}
