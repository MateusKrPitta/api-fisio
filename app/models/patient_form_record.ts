import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, beforeSave, afterCreate, beforeDelete } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Patient from '#models/patient'
import FormTemplate from '#models/form_template'
import User from '#models/user'

export default class PatientFormRecord extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare patientId: number

  @column()
  declare templateId: number | null

  @column()
  declare userId: number

  @column.date()
  declare recordDate: DateTime

  @column()
  declare answers: string // JSON object string { field_id: value }

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

  @column()
  declare signatureStatus: string // 'pendente' | 'assinado'

  @column()
  declare signatureToken: string | null

  @column()
  declare signatureImage: string | null // Base64 data URL

  @column.dateTime()
  declare signedAt: DateTime | null

  @column()
  declare signedByName: string | null

  @column()
  declare signedByCpf: string | null

  @belongsTo(() => Patient, {
    foreignKey: 'patientId',
  })
  declare patient: BelongsTo<typeof Patient>

  @belongsTo(() => FormTemplate, {
    foreignKey: 'templateId',
  })
  declare template: BelongsTo<typeof FormTemplate>

  @belongsTo(() => User, {
    foreignKey: 'userId',
  })
  declare user: BelongsTo<typeof User>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @beforeSave()
  static async logAuditSave(record: PatientFormRecord) {
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
      tableName: 'patient_form_records',
      recordId: record.id || 0,
      oldData: record.$original,
      newData: record.serialize(),
    })
  }

  @afterCreate()
  static async logAuditCreate(record: PatientFormRecord) {
    const HttpContext = await import('@adonisjs/core/http').then((m) => m.HttpContext)
    const ctx = HttpContext.get()
    if (!ctx || !ctx.auth || !ctx.auth.user) return

    const AuditLog = await import('#models/audit_log').then((m) => m.default)
    
    const log = await AuditLog.query()
      .where('tableName', 'patient_form_records')
      .where('action', 'CREATE')
      .where('userId', ctx.auth.user.id)
      .where('recordId', 0)
      .orderBy('createdAt', 'desc')
      .first()

    if (log) {
      log.recordId = record.id
      await log.save()
    }
  }

  @beforeDelete()
  static async logAuditDelete(record: PatientFormRecord) {
    const HttpContext = await import('@adonisjs/core/http').then((m) => m.HttpContext)
    const ctx = HttpContext.get()
    if (!ctx || !ctx.auth || !ctx.auth.user) return
    const user = ctx.auth.user

    const AuditLog = await import('#models/audit_log').then((m) => m.default)
    await AuditLog.create({
      userId: user.id,
      companyId: user.companyId || null,
      action: 'DELETE',
      tableName: 'patient_form_records',
      recordId: record.id,
      oldData: record.serialize(),
      newData: null,
    })
  }
}
