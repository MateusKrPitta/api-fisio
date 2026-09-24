import { BaseModel, column, belongsTo, beforeSave, afterCreate, beforeDelete } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'
import Patient from '#models/patient'
import Appointment from '#models/appointment'
import Company from '#models/company'

export default class FinancialRecord extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number | null

  @column()
  declare userId: number

  @column()
  declare patientId: number | null

  @column()
  declare appointmentId: number | null

  @column()
  declare title: string

  @column()
  declare amount: number

  @column()
  declare type: 'receita' | 'despesa'

  @column()
  declare status: 'baixado' | 'pendente' | 'cancelado'

  @column()
  declare paymentMethod: string

  @column.date()
  declare date: DateTime

  @column.dateTime()
  declare paidAt: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column()
  declare category: string | null

  @column()
  declare recipientUserId: number | null

  @column()
  declare referenceMonth: string | null

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => User, { foreignKey: 'recipientUserId' })
  declare recipientUser: BelongsTo<typeof User>

  @belongsTo(() => Patient)
  declare patient: BelongsTo<typeof Patient>

  @belongsTo(() => Appointment)
  declare appointment: BelongsTo<typeof Appointment>

  @beforeSave()
  static async logAuditSave(record: FinancialRecord) {
    try {
      const HttpContext = await import('@adonisjs/core/http').then((m) => m.HttpContext)
      const ctx = HttpContext.get()
      if (!ctx || !ctx.auth) return

      const user = ctx.auth.user
      if (!user) return

      const AuditLog = await import('#models/audit_log').then((m) => m.default)
      const action = record.id ? 'UPDATE' : 'CREATE'

      await AuditLog.create({
        userId: user.id,
        companyId: user.companyId || null,
        action,
        tableName: 'financial_records',
        recordId: record.id || 0,
        oldData: record.$original || null,
        newData: record.serialize ? record.serialize() : null,
      })
    } catch (e) {
      // Ignore audit log error so transaction succeeds
    }
  }

  @afterCreate()
  static async logAuditCreate(record: FinancialRecord) {
    try {
      const HttpContext = await import('@adonisjs/core/http').then((m) => m.HttpContext)
      const ctx = HttpContext.get()
      if (!ctx || !ctx.auth || !ctx.auth.user) return

      const AuditLog = await import('#models/audit_log').then((m) => m.default)
      
      const log = await AuditLog.query()
        .where('tableName', 'financial_records')
        .where('action', 'CREATE')
        .where('userId', ctx.auth.user.id)
        .where('recordId', 0)
        .orderBy('createdAt', 'desc')
        .first()

      if (log) {
        log.recordId = record.id
        await log.save()
      }
    } catch (e) {
      // Ignore audit log error
    }
  }

  @beforeDelete()
  static async logAuditDelete(record: FinancialRecord) {
    try {
      const HttpContext = await import('@adonisjs/core/http').then((m) => m.HttpContext)
      const ctx = HttpContext.get()
      if (!ctx || !ctx.auth || !ctx.auth.user) return
      const user = ctx.auth.user

      const AuditLog = await import('#models/audit_log').then((m) => m.default)
      await AuditLog.create({
        userId: user.id,
        companyId: user.companyId || null,
        action: 'DELETE',
        tableName: 'financial_records',
        recordId: record.id,
        oldData: record.serialize ? record.serialize() : null,
        newData: null,
      })
    } catch (e) {
      // Ignore audit log error
    }
  }
}
