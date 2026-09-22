import type { HttpContext } from '@adonisjs/core/http'
import Patient from '#models/patient'
import Appointment from '#models/appointment'
import FinancialRecord from '#models/financial_record'
import { createPatientValidator, updatePatientValidator } from '#validators/patient'
import { DateTime } from 'luxon'
import PatientPolicy from '#policies/patient_policy'
import AuditService from '#services/audit_service'

function checkTimeOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const eA = endA && endA > startA ? endA : startA
  const eB = endB && endB > startB ? endB : startB
  if (startA === startB) return true
  return startA < eB && eA > startB
}

export default class PatientsController {
  private applyScope(query: any, user: any) {
    if (user.role === 'superadmin') {
      return query
    }
    if (user.role === 'clinic_admin' || user.role === 'secretary') {
      if (user.companyId) {
        return query.where((q: any) => {
          q.where('company_id', user.companyId).orWhere('user_id', user.id)
        })
      }
      return query.where('user_id', user.id)
    }
    // Fisioterapeuta só acessa pacientes vinculados a ele
    return query.where('user_id', user.id)
  }

  /**
   * List patients based on role & company.
   */
  async index({ auth, request }: HttpContext) {
    const user = auth.getUserOrFail()
    const search = request.input('q')
    const page = request.input('page', 1)
    const limit = request.input('limit', 20)

    const query = Patient.query()
      .select('id', 'name', 'cpf', 'phone', 'email', 'template_id', 'session_rate', 'user_id', 'company_id', 'created_at')
      .preload('template', (tQuery) => tQuery.select('id', 'title'))
      .preload('user', (uQuery) => uQuery.select('id', 'full_name', 'email'))

    this.applyScope(query, user)

    if (search) {
      query.where((q) => {
        q.whereRaw('name ILIKE ?', [`%${search}%`])
          .orWhere('cpf', 'LIKE', `%${search}%`)
      })
    }

    return await query.orderBy('name', 'asc').paginate(page, limit)
  }

  /**
   * Show a single patient.
   */
  async show({ auth, params, response, bouncer }: HttpContext) {
    const user = auth.getUserOrFail()

    const query = Patient.query()
      .where('id', params.id)
      .preload('template')
      .preload('user', (uQuery) => uQuery.select('id', 'full_name', 'email'))
      .preload('appointments', (aQuery) => aQuery.orderBy('date', 'asc').orderBy('start_time', 'asc'))

    this.applyScope(query, user)

    const patient = await query.first()

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    await bouncer.with(PatientPolicy).authorize('view', patient)

    return patient
  }

  /**
   * Get paginated evolutions / appointments for a patient with status filter (all, pending, completed).
   */
  async evolutions({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()

    // Secretária não tem acesso ao módulo de evoluções
    if (user.role === 'secretary') {
      return response.forbidden({ error: 'Secretárias não têm permissão para acessar o módulo de evoluções.' })
    }

    const patientId = params.id
    const page = Number(request.input('page', 1)) || 1
    const limit = Number(request.input('limit', 5)) || 5
    const status = String(request.input('status', 'all')).toLowerCase() // 'all' | 'pending' | 'completed'

    const patientQuery = Patient.query().where('id', patientId)
    this.applyScope(patientQuery, user)
    const patient = await patientQuery.first()

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    const completedCondition = (q: any) => {
      q.where((sub: any) => {
        sub.whereNotNull('notes')
          .whereRaw("LENGTH(TRIM(notes)) > 0")
          .where((nSub: any) => {
            nSub.whereRaw("notes NOT LIKE 'Sessão %'")
              .orWhereRaw("LENGTH(TRIM(notes)) > 40")
          })
      }).orWhere((sub: any) => {
        sub.whereNotNull('images')
          .whereRaw("images != '[]'")
          .whereRaw("images != ''")
      })
    }

    // Get total counts
    const allCountQuery = Appointment.query().where('patient_id', patientId)
    const completedCountQuery = Appointment.query().where('patient_id', patientId).where(completedCondition)

    const [totalCountResult, completedCountResult] = await Promise.all([
      allCountQuery.count('* as total'),
      completedCountQuery.count('* as total'),
    ])

    const totalCount = Number(totalCountResult[0]?.$extras?.total || 0)
    const completedCount = Number(completedCountResult[0]?.$extras?.total || 0)
    const pendingCount = Math.max(0, totalCount - completedCount)

    // Query for paginated list
    const query = Appointment.query()
      .where('patient_id', patientId)
      .orderBy('date', 'asc')
      .orderBy('start_time', 'asc')

    if (status === 'completed') {
      query.where(completedCondition)
    } else if (status === 'pending') {
      query.whereNot(completedCondition)
    }

    const paginated = await query.paginate(page, limit)

    const isEvolutionCheck = (notes?: string | null, images?: any) => {
      if (Array.isArray(images) && images.length > 0) return true
      if (typeof images === 'string' && images !== '[]' && images.trim() !== '') return true
      if (!notes || typeof notes !== 'string' || notes.trim() === '') return false
      const clean = notes.trim()
      if (clean.startsWith('Sessão ') && (clean.includes('Recorrente') || clean.includes('Inicial') || clean.includes('Mensal') || clean.length < 40)) {
        return false
      }
      return true
    }

    return {
      patient: {
        id: patient.id,
        name: patient.name,
        fullName: patient.name,
        phone: patient.phone,
        cpf: patient.cpf,
      },
      counts: {
        total: totalCount,
        completed: completedCount,
        pending: pendingCount,
      },
      data: paginated.all().map((a) => {
        const hasEvol = isEvolutionCheck(a.notes, a.images)
        return {
          id: a.id,
          patientId: a.patientId,
          date: a.date ? (typeof a.date === 'string' ? a.date : a.date.toISODate()) : '',
          startTime: a.startTime,
          endTime: a.endTime,
          specialty: a.specialty,
          status: a.status,
          notes: a.notes,
          images: a.images || [],
          hasEvolution: hasEvol,
          has_evolution: hasEvol,
        }
      }),
      meta: paginated.getMeta(),
    }
  }

  /**
   * Create a new patient with optional recurring treatment plan.
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const payload = await request.validateUsing(createPatientValidator)
    const templateId = request.input('templateId')
    const schedulePlan = request.input('schedulePlan')
    const sessionRateRaw = request.input('sessionRate') ?? request.input('session_rate') ?? payload.sessionRate ?? payload.session_rate ?? 0
    const sessionRate = Number(sessionRateRaw) || 0

    // Check if CPF is already registered
    const existing = await Patient.query().where('cpf', payload.cpf).first()
    if (existing) {
      return response.badRequest({ error: 'Já existe um paciente cadastrado com este CPF.' })
    }

    // Convert birthdate string to DateTime object
    const birthdate = DateTime.fromISO(payload.birthdate)

    const maritalStatus = request.input('maritalStatus') ?? request.input('marital_status') ?? payload.maritalStatus ?? payload.marital_status ?? null
    const emergencyContact = request.input('emergencyContact') ?? request.input('emergency_contact') ?? payload.emergencyContact ?? payload.emergency_contact ?? null

    const assignedUserId = request.input('userId') ? Number(request.input('userId')) : user.id

    const patient = await Patient.create({
      userId: assignedUserId,
      companyId: user.companyId || null,
      name: payload.name,
      cpf: payload.cpf,
      templateId: templateId ? Number(templateId) : null,
      birthdate,
      gender: payload.gender,
      phone: payload.phone,
      email: payload.email || null,
      notes: payload.notes || null,
      sessionRate,
      maritalStatus,
      emergencyContact,
    })

    // Process recurring appointment schedule plan if provided
    if (schedulePlan) {
      await this.generateRecurringAppointments(patient, schedulePlan, assignedUserId, user)
    }

    await patient.load('template')
    await patient.load('appointments', (aQuery) => aQuery.orderBy('date', 'asc').orderBy('start_time', 'asc'))
    await patient.load('user', (u) => u.select('id', 'full_name', 'email'))

    return response.created(patient)
  }

  /**
   * Helper method to generate recurring appointments and pending financial records.
   */
  private async generateRecurringAppointments(
    patient: Patient,
    schedulePlan: any,
    targetUserId: number,
    currentUser: any
  ) {
    if (
      !schedulePlan ||
      !Array.isArray(schedulePlan.slots) ||
      schedulePlan.slots.length === 0 ||
      !schedulePlan.startDate
    ) {
      return
    }

    const totalSessions = Number(schedulePlan.totalSessions) || 0
    if (totalSessions <= 0) return

    const startDate = DateTime.fromISO(schedulePlan.startDate)
    if (!startDate.isValid) return

    const specialty = schedulePlan.specialty || 'Atendimento Fisioterapêutico'
    const planTemplateId = schedulePlan.templateId ? Number(schedulePlan.templateId) : patient.templateId

    const slotsByWeekday: { [key: number]: { startTime: string; endTime: string } } = {}
    for (const slot of schedulePlan.slots) {
      const rawDay = slot.dayOfWeek ?? slot.weekday ?? slot.day ?? slot.day_of_week
      if (rawDay === undefined || rawDay === null) continue
      const numDay = Number(rawDay)
      const luxonDay = numDay === 0 ? 7 : numDay

      if (slot.enabled === false) continue

      if (slot.startTime && slot.endTime) {
        slotsByWeekday[luxonDay] = {
          startTime: slot.startTime,
          endTime: slot.endTime,
        }
      }
    }

    if (Object.keys(slotsByWeekday).length === 0) return

    const appointmentsToCreate: any[] = []
    let currentDate = startDate
    let sessionsCount = 0
    let daysChecked = 0
    const MAX_DAYS = 365

    while (sessionsCount < totalSessions && daysChecked < MAX_DAYS) {
      const luxonWeekday = currentDate.weekday // 1 = Mon ... 7 = Sun
      const slot = slotsByWeekday[luxonWeekday]

      if (slot) {
        const dateIso = currentDate.toISODate()!
        const existingAppointments = await Appointment.query()
          .where('user_id', targetUserId)
          .where('date', dateIso)
          .whereNotIn('status', ['cancelado', 'desmarcado', 'ausente'])

        let hasConflict = false
        for (const app of existingAppointments) {
          if (checkTimeOverlap(slot.startTime, slot.endTime, app.startTime, app.endTime)) {
            hasConflict = true
            break
          }
        }

        if (!hasConflict) {
          appointmentsToCreate.push({
            userId: targetUserId,
            companyId: patient.companyId || currentUser.companyId || null,
            patientId: patient.id,
            templateId: planTemplateId || null,
            specialty,
            date: currentDate,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: 'pendente',
          })
          sessionsCount++
        }
      }
      currentDate = currentDate.plus({ days: 1 })
      daysChecked++
    }

    if (appointmentsToCreate.length > 0) {
      const createdApps = await Appointment.createMany(appointmentsToCreate)
      const sessionRate = Number(patient.sessionRate || 0)
      const patientName = patient.fullName || patient.name || 'Paciente'

      const financialRecordsToCreate = createdApps.map((app) => ({
        userId: targetUserId,
        companyId: patient.companyId || currentUser.companyId || null,
        patientId: patient.id,
        appointmentId: app.id,
        title: `Atendimento - ${patientName}`,
        amount: sessionRate,
        type: 'receita' as const,
        status: 'pendente' as const,
        paymentMethod: 'pix',
        date: app.date,
        paidAt: null,
      }))

      if (financialRecordsToCreate.length > 0) {
        await FinancialRecord.createMany(financialRecordsToCreate)
      }
    }
  }

  /**
   * Update patient details.
   */
  async update({ auth, params, request, response, bouncer }: HttpContext) {
    const user = auth.getUserOrFail()
    const query = Patient.query().where('id', params.id)
    this.applyScope(query, user)
    const patient = await query.first()

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    await bouncer.with(PatientPolicy).authorize('edit', patient)

    const payload = await request.validateUsing(updatePatientValidator)
    const templateId = request.input('templateId')
    const sessionRateRaw = request.input('sessionRate') ?? request.input('session_rate') ?? payload.sessionRate ?? payload.session_rate
    const maritalStatus = request.input('maritalStatus') ?? request.input('marital_status') ?? payload.maritalStatus ?? payload.marital_status
    const emergencyContact = request.input('emergencyContact') ?? request.input('emergency_contact') ?? payload.emergencyContact ?? payload.emergency_contact
    const assignedUserId = request.input('userId')
    const schedulePlan = request.input('schedulePlan')

    if (payload.cpf && payload.cpf !== patient.cpf) {
      const existing = await Patient.query().where('cpf', payload.cpf).whereNot('id', patient.id).first()
      if (existing) {
        return response.badRequest({ error: 'Já existe um paciente cadastrado com este CPF.' })
      }
      patient.cpf = payload.cpf
    }

    if (payload.name) patient.name = payload.name
    if (payload.birthdate) patient.birthdate = DateTime.fromISO(payload.birthdate)
    if (payload.gender) patient.gender = payload.gender
    if (payload.phone) patient.phone = payload.phone
    if (payload.email !== undefined) patient.email = payload.email || null
    if (payload.notes !== undefined) patient.notes = payload.notes || null
    if (sessionRateRaw !== undefined) patient.sessionRate = Number(sessionRateRaw) || 0
    if (maritalStatus !== undefined) patient.maritalStatus = maritalStatus || null
    if (emergencyContact !== undefined) patient.emergencyContact = emergencyContact || null
    if (templateId !== undefined) patient.templateId = templateId ? Number(templateId) : null
    if (assignedUserId && (user.role === 'superadmin' || user.role === 'clinic_admin' || user.role === 'secretary')) {
      patient.userId = Number(assignedUserId)
    }

    await patient.save()

    // Handle recurring schedule plan if provided in update
    if (schedulePlan) {
      const targetUserId = (assignedUserId && (user.role === 'superadmin' || user.role === 'clinic_admin' || user.role === 'secretary'))
        ? Number(assignedUserId)
        : (patient.userId || user.id)

      await this.generateRecurringAppointments(patient, schedulePlan, targetUserId, user)
    }

    await patient.load('template')
    await patient.load('appointments', (aQuery) => aQuery.orderBy('date', 'asc').orderBy('start_time', 'asc'))
    await patient.load('user', (u) => u.select('id', 'full_name', 'email'))

    return patient
  }

  /**
   * Delete a patient.
   */
  async destroy({ auth, params, response, bouncer }: HttpContext) {
    const user = auth.getUserOrFail()

    // Secretary cannot delete patients
    if (user.role === 'secretary') {
      return response.forbidden({ error: 'Secretárias não têm permissão para excluir pacientes.' })
    }

    const query = Patient.query().where('id', params.id)
    this.applyScope(query, user)
    const patient = await query.first()

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    await bouncer.with(PatientPolicy).authorize('delete', patient)

    await AuditService.log({
      userId: user.id,
      companyId: user.companyId,
      action: 'DELETE',
      tableName: 'patients',
      recordId: patient.id,
      oldData: { name: patient.name, cpf: patient.cpf },
    })

    await patient.delete()
    return response.noContent()
  }

  /**
   * Get birthday notifications and patient list.
   */
  async birthdays({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const query = Patient.query().preload('template')
    this.applyScope(query, user)
    const patients = await query

    const today = DateTime.local()
    const currentMonth = today.month
    const currentDay = today.day

    const todayBirthdays: any[] = []
    const monthBirthdays: any[] = []
    const allBirthdays: any[] = []

    for (const patient of patients) {
      if (!patient.birthdate) continue

      const bdate = patient.birthdate
      const isToday = bdate.month === currentMonth && bdate.day === currentDay
      const isThisMonth = bdate.month === currentMonth

      let ageToComplete = today.year - bdate.year
      if (today.month < bdate.month || (today.month === bdate.month && today.day < bdate.day)) {
        ageToComplete -= 1
      }

      const pData = {
        ...patient.toJSON(),
        isToday,
        isThisMonth,
        ageToComplete,
        day: bdate.day,
        month: bdate.month,
      }

      if (isToday) {
        todayBirthdays.push(pData)
      }
      if (isThisMonth) {
        monthBirthdays.push(pData)
      }
      allBirthdays.push(pData)
    }

    return {
      today: todayBirthdays,
      month: monthBirthdays,
      all: allBirthdays,
      countToday: todayBirthdays.length,
    }
  }
}
