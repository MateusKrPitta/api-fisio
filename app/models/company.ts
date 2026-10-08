import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'
import Patient from '#models/patient'
import Appointment from '#models/appointment'
import FinancialRecord from '#models/financial_record'
import SubscriptionInvoice from '#models/subscription_invoice'

export default class Company extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column()
  declare cnpj: string | null

  @column()
  declare crefito: string | null

  @column()
  declare email: string | null

  @column()
  declare phone: string | null

  @column()
  declare address: string | null

  @column()
  declare logoUrl: string | null

  @column()
  declare status: 'active' | 'inactive' | 'suspended'

  @column()
  declare plan: 'bronze' | 'silver' | 'gold'

  @column()
  declare maxPhysios: number | null

  @column()
  declare maxSecretaries: number | null

  @column()
  declare subscriptionStatus: 'trial' | 'active' | 'past_due' | 'suspended' | 'canceled' | 'exempt'

  @column.dateTime()
  declare trialEndsAt: DateTime | null

  @column()
  declare dueDay: number | null

  @column()
  declare monthlyPrice: number | null

  @column.dateTime()
  declare nextBillingDate: DateTime | null

  @column.dateTime()
  declare lastPaymentDate: DateTime | null

  @column()
  declare mpCustomerId: string | null

  @column()
  declare mpSubscriptionId: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @hasMany(() => User)
  declare users: HasMany<typeof User>

  @hasMany(() => Patient)
  declare patients: HasMany<typeof Patient>

  @hasMany(() => Appointment)
  declare appointments: HasMany<typeof Appointment>

  @hasMany(() => FinancialRecord)
  declare financialRecords: HasMany<typeof FinancialRecord>

  @hasMany(() => SubscriptionInvoice)
  declare subscriptionInvoices: HasMany<typeof SubscriptionInvoice>
}

