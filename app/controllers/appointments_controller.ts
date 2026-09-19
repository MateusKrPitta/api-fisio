import type { HttpContext } from '@adonisjs/core/http'
import Appointment from '#models/appointment'
import Patient from '#models/patient'
import FinancialRecord from '#models/financial_record'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import AppointmentPolicy from '#policies/appointment_policy'

function checkTimeOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const eA = endA && endA > startA ? endA : startA
  const eB = endB && endB > startB ? endB : startB
  if (startA === startB) return true
  return startA < eB && eA > startB
}

export default class AppointmentsController {
  /**
   * Helper method to sync financial record for an appointment.
   */
  private async syncFinancialRecord(appointment: Appointment, status: string, user: any) {
    const patient = appointment.patient || (await Patient.find(appointment.patientId))
    const sessionRate = patient ? Number(patient.sessionRate || 0) : 0
    const patientName = patient ? (patient.fullName || patient.name) : 'Paciente'

    let financialRecord = await FinancialRecord.query()
      .where('appointment_id', appointment.id)
      .first()

    const isBaixadoStatus = status === 'finalizado' || status === 'confirmado'
    const isCanceledStatus = status === 'cancelado' || status === 'desmarcado' || status === 'ausente'

    if (isCanceledStatus) {
      if (financialRecord) {
        financialRecord.status = 'cancelado'
        financialRecord.paidAt = null
        await financialRecord.save()
      } else {
        await FinancialRecord.create({
          userId: appointment.userId || user.id,
          companyId: user.companyId || null,
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          title: `Atendimento - ${patientName}`,
          amount: sessionRate,
          type: 'receita',
          status: 'cancelado',
          paymentMethod: 'pix',
          date: appointment.date,
          paidAt: null,
        })
      }
    } else if (isBaixadoStatus) {
      if (!financialRecord) {
        await FinancialRecord.create({
          userId: appointment.userId || user.id,
          companyId: user.companyId || null,
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          title: `Atendimento - ${patientName}`,
          amount: sessionRate,
          type: 'receita',
          status: 'baixado',
          paymentMethod: 'pix',
          date: appointment.date,
          paidAt: DateTime.now(),
        })
      } else {
        financialRecord.status = 'baixado'
        if (sessionRate > 0) financialRecord.amount = sessionRate
        financialRecord.date = appointment.date
        financialRecord.paidAt = financialRecord.paidAt || DateTime.now()
        await financialRecord.save()
      }
    } else {
      // Status pendente, agendado ou em_atendimento
      if (!financialRecord) {
        await FinancialRecord.create({
          userId: appointment.userId || user.id,
          companyId: user.companyId || null,
          patientId: appointment.patientId,
          appointmentId: appointment.id,
          title: `Atendimento - ${patientName}`,
          amount: sessionRate,
          type: 'receita',
          status: 'pendente',
          paymentMethod: 'pix',
          date: appointment.date,
          paidAt: null,
        })
      } else {
        financialRecord.status = 'pendente'
        if (sessionRate > 0) financialRecord.amount = sessionRate
        financialRecord.date = appointment.date
        financialRecord.paidAt = null
        await financialRecord.save()
      }
    }
  }

  private applyScope(query: any, user: any) {
    if (user.role === 'superadmin') {
      return query
    }
    if (user.role === 'clinic_admin' || user.role === 'secretary') {
      if (user.companyId) {
        return query.where((q: any) => {
          q.where('appointments.company_id', user.companyId).orWhere('appointments.user_id', user.id)
        })
      }
      return query.where('appointments.user_id', user.id)
    }
    // physiotherapist
    return query.where('appointments.user_id', user.id)
  }

  async index({ auth, request }: HttpContext) {
    const user = auth.getUserOrFail()
    const dateStr = request.input('date') // Format YYYY-MM-DD
    const startDate = request.input('start_date')
    const endDate = request.input('end_date')
    const filterUserId = request.input('userId')
    const limit = request.input('limit', 1000) // Default limit

    const query = Appointment.query()
      .leftJoin('patients', 'appointments.patient_id', 'patients.id')
      .leftJoin('users', 'appointments.user_id', 'users.id')
      .select(
        'appointments.id', 'appointments.user_id', 'appointments.company_id', 'appointments.patient_id', 'appointments.template_id', 
        'appointments.specialty', 'appointments.date', 'appointments.start_time', 'appointments.end_time', 
        'appointments.status', 'appointments.notes', 'appointments.images', 'appointments.created_at', 'appointments.updated_at',
        'patients.name as patient_name',
        'patients.phone as patient_phone',
        'users.full_name as physio_name'
      )
      .select(db.raw(`CASE WHEN appointments.notes IS NOT NULL AND trim(appointments.notes) != '' AND appointments.notes NOT LIKE 'Sessão %' THEN true ELSE false END as has_evolution`))

    this.applyScope(query, user)

    if (filterUserId) {
      query.where('appointments.user_id', filterUserId)
    }

    if (startDate && endDate) {
      query.whereBetween('date', [startDate, endDate])
    } else if (dateStr) {
      query.where('date', dateStr)
    }

    const page = request.input('page', 1)
    const appointmentsData = await query.orderBy('date', 'asc').orderBy('start_time', 'asc').paginate(page, limit)
    
    const mapped = appointmentsData.all().map(app => {
      const serialized = app.serialize()
      const hasEvol = Boolean(app.$extras.has_evolution)
      serialized.has_evolution = hasEvol
      serialized.hasEvolution = hasEvol
      serialized.patientName = app.$extras.patient_name
      serialized.patientPhone = app.$extras.patient_phone
      serialized.physioName = app.$extras.physio_name
      return serialized
    })

    return {
      meta: appointmentsData.getMeta(),
      data: mapped
    }
  }

  /**
   * Get details of a single appointment.
   */
  async show({ auth, params, response, bouncer }: HttpContext) {
    const user = auth.getUserOrFail()

    const query = Appointment.query()
      .where('appointments.id', params.id)
      .preload('user', (u) => u.select('id', 'full_name', 'email'))
      .preload('patient', (pQuery) => {
        pQuery.preload('formRecords', (fQuery) => {
          fQuery.select('id', 'patient_id', 'record_date')
        })
      })
      .preload('template')
      .preload('financialRecord')

    this.applyScope(query, user)

    const appointment = await query.first()

    if (!appointment) {
      return response.notFound({ error: 'Agendamento não encontrado.' })
    }

    await bouncer.with(AppointmentPolicy).authorize('view', appointment)

    const hasEvolution = !!appointment.notes && appointment.notes.trim() !== '' && !appointment.notes.startsWith('Sessão ')
    const serialized = appointment.serialize()
    serialized.has_evolution = hasEvolution
    serialized.hasEvolution = hasEvolution

    return response.ok(serialized)
  }

  /**
   * Create a new appointment.
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const patientId = request.input('patientId')
    const templateId = request.input('templateId')
    const specialty = request.input('specialty') || request.input('type') || 'Atendimento Fisioterapêutico'
    const dateStr = request.input('date') // YYYY-MM-DD
    const startTime = request.input('startTime') || request.input('time')
    let endTime = request.input('endTime')
    if (!endTime && startTime) {
      const parsedStart = DateTime.fromFormat(startTime, 'HH:mm')
      endTime = parsedStart.isValid ? parsedStart.plus({ hours: 1 }).toFormat('HH:mm') : '15:00'
    }
    const notes = request.input('notes')
    const images = request.input('images')
    const initialStatus = request.input('status', 'pendente')
    const assignedUserId = request.input('userId') ? Number(request.input('userId')) : user.id

    // Validation
    if (!patientId || !dateStr || !startTime) {
      return response.badRequest({ error: 'Todos os campos obrigatórios devem ser preenchidos.' })
    }

    // Verify patient access
    const pQuery = Patient.query().where('id', patientId)
    if (user.role === 'superadmin') {
      // access all
    } else if (user.companyId) {
      const cId = user.companyId
      pQuery.where((q) => q.where('company_id', cId).orWhere('user_id', user.id))
    } else {
      pQuery.where('user_id', user.id)
    }
    const patient = await pQuery.first()

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado ou não acessível por este usuário.' })
    }

    // Parse date
    const date = DateTime.fromISO(dateStr)

    // Check for schedule time collision for the assigned professional
    const existingAppointments = await Appointment.query()
      .where('user_id', assignedUserId)
      .where('date', dateStr)
      .whereNot('status', 'cancelado')
      .preload('patient')

    const conflict = existingAppointments.find((app) =>
      checkTimeOverlap(startTime, endTime, app.startTime, app.endTime)
    )

    if (conflict) {
      const conflictPatientName = conflict.patient?.fullName || conflict.patient?.name || 'outro paciente'
      const formattedDate = date.toFormat('dd/MM/yyyy')
      return response.badRequest({
        error: `Conflito de Horário: Já existe um atendimento para ${conflictPatientName} no dia ${formattedDate} (${conflict.startTime} - ${conflict.endTime}). Não é permitido agendar mais de um paciente no mesmo dia e horário.`
      })
    }

    const appointment = await Appointment.create({
      userId: assignedUserId,
      companyId: user.companyId || patient.companyId || null,
      patientId,
      templateId: templateId ? Number(templateId) : null,
      specialty,
      date,
      startTime,
      endTime,
      status: initialStatus as any,
      notes: notes || null,
      images: images && Array.isArray(images) ? images : (images ? [images] : []),
    })

    // Sync financial record for the created appointment
    await this.syncFinancialRecord(appointment, appointment.status, user)

    // Preload patient and template info before returning
    await appointment.load('patient')
    await appointment.load('template')
    await appointment.load('user', (u) => u.select('id', 'full_name', 'email'))

    return response.created(appointment)
  }

  /**
   * Update an appointment status or other details.
   */
  async update({ auth, params, request, response, bouncer }: HttpContext) {
    const user = auth.getUserOrFail()

    const query = Appointment.query().where('appointments.id', params.id)
    this.applyScope(query, user)
    const appointment = await query.first()

    if (!appointment) {
      return response.notFound({ error: 'Agendamento não encontrado.' })
    }

    await bouncer.with(AppointmentPolicy).authorize('edit', appointment)

    const { status, date, startTime, endTime, notes, images, specialty, templateId, userId } = request.only([
      'status',
      'date',
      'startTime',
      'endTime',
      'notes',
      'images',
      'specialty',
      'templateId',
      'userId',
    ])

    const targetUserId = userId ? Number(userId) : appointment.userId

    // Check conflict if date or time changed
    if ((date && date !== appointment.date.toISODate()) || (startTime && startTime !== appointment.startTime) || (userId && Number(userId) !== appointment.userId)) {
      const targetDate = date || appointment.date.toISODate()!
      const targetStart = startTime || appointment.startTime
      const targetEnd = endTime || appointment.endTime

      const conflicts = await Appointment.query()
        .where('user_id', targetUserId)
        .where('date', targetDate)
        .whereNot('id', appointment.id)
        .whereNot('status', 'cancelado')
        .preload('patient')

      const conflict = conflicts.find((app) =>
        checkTimeOverlap(targetStart, targetEnd, app.startTime, app.endTime)
      )

      if (conflict) {
        const conflictPatientName = conflict.patient?.fullName || conflict.patient?.name || 'outro paciente'
        return response.badRequest({
          error: `Conflito de Horário: Já existe um atendimento para ${conflictPatientName} neste dia e horário (${conflict.startTime} - ${conflict.endTime}).`
        })
      }
    }

    if (status) appointment.status = status
    if (date) appointment.date = DateTime.fromISO(date)
    if (startTime) appointment.startTime = startTime
    if (endTime) appointment.endTime = endTime
    if (notes !== undefined) appointment.notes = notes
    if (images !== undefined) appointment.images = images
    if (specialty) appointment.specialty = specialty
    if (templateId !== undefined) appointment.templateId = templateId ? Number(templateId) : null
    if (userId && (user.role === 'superadmin' || user.role === 'clinic_admin' || user.role === 'secretary')) {
      appointment.userId = Number(userId)
    }

    await appointment.save()

    // Sync financial record if status, date or notes changed
    await this.syncFinancialRecord(appointment, appointment.status, user)

    await appointment.load('patient')
    await appointment.load('template')
    await appointment.load('user', (u) => u.select('id', 'full_name', 'email'))

    return response.ok(appointment)
  }

  /**
   * Baixa rápida de atendimento
   */
  async baixa({ auth, params, request, response, bouncer }: HttpContext) {
    const user = auth.getUserOrFail()

    const query = Appointment.query().where('appointments.id', params.id)
    this.applyScope(query, user)
    const appointment = await query.first()

    if (!appointment) {
      return response.notFound({ error: 'Agendamento não encontrado.' })
    }

    await bouncer.with(AppointmentPolicy).authorize('edit', appointment)

    const { paymentMethod, amount } = request.only(['paymentMethod', 'amount'])
    appointment.status = 'finalizado'
    await appointment.save()

    const patient = await Patient.find(appointment.patientId)
    const patientName = patient ? (patient.fullName || patient.name) : 'Paciente'
    const finalAmount = amount ? Number(amount) : (patient ? Number(patient.sessionRate || 0) : 0)

    let financialRecord = await FinancialRecord.query()
      .where('appointment_id', appointment.id)
      .first()

    if (!financialRecord) {
      financialRecord = await FinancialRecord.create({
        userId: appointment.userId || user.id,
        companyId: user.companyId || null,
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        title: `Atendimento - ${patientName}`,
        amount: finalAmount,
        type: 'receita',
        status: 'baixado',
        paymentMethod: paymentMethod || 'pix',
        date: appointment.date,
        paidAt: DateTime.now(),
      })
    } else {
      financialRecord.status = 'baixado'
      if (finalAmount > 0) financialRecord.amount = finalAmount
      if (paymentMethod) financialRecord.paymentMethod = paymentMethod
      financialRecord.paidAt = financialRecord.paidAt || DateTime.now()
      await financialRecord.save()
    }

    await appointment.load('patient')
    await appointment.load('template')
    await appointment.load('financialRecord')

    return response.ok({
      message: 'Atendimento e financeiro baixados com sucesso!',
      appointment,
      financialRecord,
    })
  }

  /**
   * Delete an appointment.
   */
  async destroy({ auth, params, response, bouncer }: HttpContext) {
    const user = auth.getUserOrFail()

    const query = Appointment.query().where('appointments.id', params.id)
    this.applyScope(query, user)
    const appointment = await query.first()

    if (!appointment) {
      return response.notFound({ error: 'Agendamento não encontrado.' })
    }

    await bouncer.with(AppointmentPolicy).authorize('delete', appointment)

    // Delete associated financial record
    await FinancialRecord.query().where('appointment_id', appointment.id).delete()

    await appointment.delete()
    return response.noContent()
  }
}
