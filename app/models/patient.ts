import { BaseModel, column, belongsTo, hasMany, beforeSave, afterCreate, beforeDelete } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import { DateTime } from 'luxon'
import User from '#models/user'
import Company from '#models/company'
import Evaluation from '#models/evaluation'
import Appointment from '#models/appointment'
import FormTemplate from '#models/form_template'
import PatientFormRecord from '#models/patient_form_record'

export default class Patient extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare companyId: number | null

  @column()
  declare userId: number

  @column()
  declare templateId: number | null

  @column()
  declare name: string

  public get fullName(): string {
    return this.name
  }

  @column()
  declare cpf: string

  @column.date()
  declare birthdate: DateTime

  @column()
  declare gender: string

  @column()
  declare phone: string

  @column()
  declare email: string | null

  @column()
  declare notes: string | null

  @column()
  declare sessionRate: number

  @column()
  declare maritalStatus: string | null

  @column()
  declare emergencyContact: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @belongsTo(() => User)
  declare user: BelongsTo<typeof User>

  @belongsTo(() => FormTemplate, {
    foreignKey: 'templateId',
  })
  declare template: BelongsTo<typeof FormTemplate>

  @hasMany(() => Evaluation)
  declare evaluations: HasMany<typeof Evaluation>

  @hasMany(() => Appointment)
  declare appointments: HasMany<typeof Appointment>

  @hasMany(() => PatientFormRecord)
  declare formRecords: HasMany<typeof PatientFormRecord>

  @beforeSave()
  static async logAuditSave(patient: Patient) {
    const HttpContext = await import('@adonisjs/core/http').then((m) => m.HttpContext)
    const ctx = HttpContext.get()
    if (!ctx || !ctx.auth) return

    const user = ctx.auth.user
    if (!user) return

    const AuditLog = await import('#models/audit_log').then((m) => m.default)
    const action = patient.id ? 'UPDATE' : 'CREATE'

    await AuditLog.create({
      userId: user.id,
      companyId: user.companyId || null,
      action,
      tableName: 'patients',
      recordId: patient.id || 0, // In create, id is assigned after insert, so this hook might need to be afterCreate for CREATE
      oldData: patient.$original,
      newData: patient.serialize(),
    })
  }

  @afterCreate()
  static async logAuditCreate(patient: Patient) {
    const HttpContext = await import('@adonisjs/core/http').then((m) => m.HttpContext)
    const ctx = HttpContext.get()
    if (!ctx || !ctx.auth || !ctx.auth.user) return

    const AuditLog = await import('#models/audit_log').then((m) => m.default)
    
    // Find the log that was created in beforeSave with recordId 0 and update it
    const log = await AuditLog.query()
      .where('tableName', 'patients')
      .where('action', 'CREATE')
      .where('userId', ctx.auth.user.id)
      .where('recordId', 0)
      .orderBy('createdAt', 'desc')
      .first()

    if (log) {
      log.recordId = patient.id
      await log.save()
    }
  }

  @beforeDelete()
  static async logAuditDelete(patient: Patient) {
    const HttpContext = await import('@adonisjs/core/http').then((m) => m.HttpContext)
    const ctx = HttpContext.get()
    if (!ctx || !ctx.auth || !ctx.auth.user) return
    const user = ctx.auth.user

    const AuditLog = await import('#models/audit_log').then((m) => m.default)
    await AuditLog.create({
      userId: user.id,
      companyId: user.companyId || null,
      action: 'DELETE',
      tableName: 'patients',
      recordId: patient.id,
      oldData: patient.serialize(),
      newData: null,
    })
  }
}
