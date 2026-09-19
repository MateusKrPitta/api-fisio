import type { HttpContext } from '@adonisjs/core/http'
import Patient from '#models/patient'
import Appointment from '#models/appointment'
import { DateTime } from 'luxon'

export default class DashboardController {
  private applyScope(query: any, user: any, tablePrefix = '') {
    if (user.role === 'superadmin') {
      return query
    }
    const prefix = tablePrefix ? `${tablePrefix}.` : ''
    
    if (user.role === 'clinic_admin' || user.role === 'secretary') {
      if (user.companyId) {
        return query.where((q: any) => {
          q.where(`${prefix}company_id`, user.companyId).orWhere(`${prefix}user_id`, user.id)
        })
      }
      return query.where(`${prefix}user_id`, user.id)
    }
    
    // physiotherapist
    return query.where(`${prefix}user_id`, user.id)
  }

  async metrics({ auth }: HttpContext) {
    const user = auth.getUserOrFail()
    const now = DateTime.local()
    const currentMonth = now.month
    const currentYear = now.year
    const currentDay = now.day
    const todayStr = now.toISODate()

    // 1. Total Patients
    const patientsQuery = Patient.query().count('* as total')
    this.applyScope(patientsQuery, user)
    const patientsCountRes = await patientsQuery.first()
    const totalPatients = Number(patientsCountRes?.$extras?.total || 0)

    // 2. Pending Evolutions
    const pendingEvolutionsQuery = Appointment.query()
      .select('appointments.id', 'appointments.date', 'appointments.start_time', 'appointments.status', 'appointments.specialty', 'appointments.patient_id')
      .leftJoin('patients', 'appointments.patient_id', 'patients.id')
      .select('patients.name as patient_name')
      .whereRaw(`(appointments.notes IS NULL OR trim(appointments.notes) = '' OR appointments.notes LIKE 'Sessão %')`)
      .whereNotIn('appointments.status', ['cancelado', 'desmarcado', 'ausente'])
      .where((q) => {
        q.where('appointments.date', '<=', todayStr)
          .orWhereIn('appointments.status', ['finalizado', 'concluido', 'concluído', 'atendido'])
      })
      .orderBy('appointments.date', 'desc')
      .limit(20)
    
    this.applyScope(pendingEvolutionsQuery, user, 'appointments')
    const pendingEvolutionsList = await pendingEvolutionsQuery

    const pendingEvolutions = pendingEvolutionsList.map((app) => ({
      id: app.id,
      patientId: app.patientId,
      patientName: app.$extras.patient_name,
      date: app.date,
      startTime: app.startTime,
      specialty: app.specialty,
      status: app.status,
      hasEvolution: false
    }))

    // 3. Appointments logic (this month)
    const monthlyAppointmentsQuery = Appointment.query()
      .whereRaw(`EXTRACT(MONTH FROM date) = ?`, [currentMonth])
      .whereRaw(`EXTRACT(YEAR FROM date) = ?`, [currentYear])

    this.applyScope(monthlyAppointmentsQuery, user)
    const monthlyApps = await monthlyAppointmentsQuery

    let pendingAppointmentsThisMonth = 0
    let completedAppointmentsMonth = 0
    let todayAppointments = 0

    // 4. Weekly Chart Data (this month)
    const daysOfWeek = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
    const weeklyCounts = [0, 0, 0, 0, 0, 0] // index 0=Mon, 5=Sat

    for (const app of monthlyApps) {
      const st = (app.status || 'pendente').toLowerCase()
      const isConcluded = ['finalizado', 'concluido', 'concluído', 'atendido'].includes(st)
      const isCanceled = ['cancelado', 'desmarcado', 'ausente'].includes(st)

      if (!isCanceled && !isConcluded) {
        pendingAppointmentsThisMonth++
      }
      if (isConcluded) {
        completedAppointmentsMonth++
      }

      if (app.date && app.date.toISODate() === todayStr) {
        todayAppointments++
      }

      const weekday = app.date ? app.date.weekday : 0 // 1=Mon, 7=Sun
      if (weekday >= 1 && weekday <= 6) {
        weeklyCounts[weekday - 1]++
      }
    }

    const weeklyChartData = daysOfWeek.map((label, idx) => ({
      dia: label,
      atendimentos: weeklyCounts[idx],
    }))

    // 5. Recent Patients (last 5)
    const recentPatientsQuery = Patient.query()
      .select('id', 'name', 'cpf', 'phone')
      .orderBy('created_at', 'desc')
      .limit(5)
    this.applyScope(recentPatientsQuery, user)
    const recentPatients = await recentPatientsQuery

    // 6. Birthdays of the Month
    const birthdaysQuery = Patient.query()
      .select('id', 'name', 'birthdate')
      .whereRaw(`EXTRACT(MONTH FROM birthdate) = ?`, [currentMonth])
    
    this.applyScope(birthdaysQuery, user)
    const birthdaysOfMonthRows = await birthdaysQuery

    const birthdaysOfMonth = birthdaysOfMonthRows.map(p => ({
      id: p.id,
      name: p.fullName || p.name,
      day: p.birthdate?.day,
      isToday: p.birthdate?.day === currentDay
    })).sort((a, b) => (a.day || 0) - (b.day || 0))

    return {
      totalPatients,
      pendingEvolutions,
      pendingAppointmentsThisMonth,
      completedAppointmentsMonth,
      todayAppointments,
      monthlyAppointmentsTotal: monthlyApps.length,
      weeklyChartData,
      recentPatients,
      birthdaysOfMonth
    }
  }
}
