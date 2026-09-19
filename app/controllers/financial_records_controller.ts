import type { HttpContext } from '@adonisjs/core/http'
import FinancialRecord from '#models/financial_record'
import Appointment from '#models/appointment'
import { DateTime } from 'luxon'
import FinancialRecordPolicy from '#policies/financial_record_policy'

export default class FinancialRecordsController {
  /**
   * Helper to apply role & company scope
   */
  private applyScope(query: any, user: any) {
    if (user.role === 'superadmin') {
      return query
    }
    if (user.companyId && (user.role === 'clinic_admin' || user.role === 'secretary')) {
      return query.where((q: any) => {
        q.where('company_id', user.companyId).orWhere('user_id', user.id)
      })
    }
    return query.where('user_id', user.id)
  }

  /**
   * Apply date, period, status, type, patient, search filters
   */
  private applyFilters(query: any, request: any) {
    const period = request.input('period', 'month') // today | week | month | last_month | all
    const status = request.input('status', 'all') // all | baixado | pendente | cancelado
    const type = request.input('type', 'all') // all | receita | despesa
    const patientId = request.input('patientId')
    const search = request.input('search')

    const startDate = request.input('startDate') || request.input('start_date')
    const endDate = request.input('endDate') || request.input('end_date')
    const year = request.input('year')
    const month = request.input('month')

    const now = DateTime.now()
    if (startDate && endDate) {
      query.whereBetween('date', [startDate, endDate])
    } else if (startDate) {
      query.where('date', '>=', startDate)
    } else if (endDate) {
      query.where('date', '<=', endDate)
    } else if (year && month) {
      const selectedMonth = DateTime.fromObject({ year: Number(year), month: Number(month), day: 1 })
      const startOfMonth = selectedMonth.startOf('month').toISODate()!
      const endOfMonth = selectedMonth.endOf('month').toISODate()!
      query.whereBetween('date', [startOfMonth, endOfMonth])
    } else if (period === 'today') {
      const todayStr = now.toISODate()!
      query.where('date', todayStr)
    } else if (period === 'week') {
      const startOfWeek = now.startOf('week').toISODate()!
      const endOfWeek = now.endOf('week').toISODate()!
      query.whereBetween('date', [startOfWeek, endOfWeek])
    } else if (period === 'month') {
      const startOfMonth = now.startOf('month').toISODate()!
      const endOfMonth = now.endOf('month').toISODate()!
      query.whereBetween('date', [startOfMonth, endOfMonth])
    } else if (period === 'last_month') {
      const lastMonth = now.minus({ months: 1 })
      const startOfLastMonth = lastMonth.startOf('month').toISODate()!
      const endOfLastMonth = lastMonth.endOf('month').toISODate()!
      query.whereBetween('date', [startOfLastMonth, endOfLastMonth])
    }

    // Filter by status
    if (status && status !== 'all') {
      query.where('status', status)
    }

    // Filter by type
    if (type && type !== 'all') {
      query.where('type', type)
    }

    // Filter by patient
    if (patientId) {
      query.where('patient_id', patientId)
    }

    // Filter by search term
    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`
      query.where((q: any) => {
        q.whereRaw('LOWER(title) LIKE ?', [term]).orWhereHas('patient', (pQuery: any) => {
          pQuery.whereRaw('LOWER(name) LIKE ?', [term])
        })
      })
    }
  }

  /**
   * Get financial summary metrics and transaction list with filters.
   */
  async index({ auth, request }: HttpContext) {
    const user = auth.getUserOrFail()

    // Auto-sincronizar atendimentos existentes que ainda não possuem lançamento financeiro
    try {
      const unlinkedQuery = Appointment.query().whereDoesntHave('financialRecord', () => {}).preload('patient')
      this.applyScope(unlinkedQuery, user)
      const unlinkedAppointments = await unlinkedQuery

      if (unlinkedAppointments.length > 0) {
        const toInsert: any[] = []
        for (const app of unlinkedAppointments) {
          const pRate = app.patient ? Number(app.patient.sessionRate || 0) : 0
          const pName = app.patient ? (app.patient.fullName || app.patient.name) : 'Paciente'
          const st = (app.status || 'pendente').toLowerCase()
          const isBaixado = st === 'finalizado' || st === 'confirmado'
          const isCanceled = st === 'cancelado' || st === 'desmarcado' || st === 'ausente'
          const recStatus = isCanceled ? 'cancelado' : isBaixado ? 'baixado' : 'pendente'

          const appDate = app.date ? (typeof app.date === 'string' ? DateTime.fromISO(app.date) : app.date) : DateTime.now()

          toInsert.push({
            userId: app.userId || user.id,
            companyId: user.companyId || null,
            patientId: app.patientId || null,
            appointmentId: app.id,
            title: `Atendimento - ${pName}`,
            amount: pRate,
            type: 'receita',
            status: recStatus,
            paymentMethod: 'pix',
            date: appDate,
            paidAt: recStatus === 'baixado' ? DateTime.now() : null,
          })
        }
        if (toInsert.length > 0) {
          await FinancialRecord.createMany(toInsert)
        }
      }
    } catch (e) {
      console.error('Erro na auto-sincronização financeira:', e)
    }

    // 1. Calculate Summary aggregates on a clean query without preloads
    const summaryQuery = FinancialRecord.query()
    this.applyScope(summaryQuery, user)
    this.applyFilters(summaryQuery, request)

    const summaryData = await summaryQuery
      .select('type', 'status')
      .sum('amount as total')
      .count('* as count')
      .groupBy('type', 'status')

    let totalBaixado = 0
    let totalPendente = 0
    let totalCancelado = 0
    let totalDespesas = 0
    let sessoesBaixadasCount = 0

    for (const row of summaryData) {
      const val = Number((row as any).$extras?.total ?? (row as any).total ?? 0)
      const count = Number((row as any).$extras?.count ?? (row as any).count ?? 0)

      if (row.type === 'receita') {
        if (row.status === 'baixado') {
          totalBaixado += val
          sessoesBaixadasCount += count
        } else if (row.status === 'pendente') {
          totalPendente += val
        } else if (row.status === 'cancelado') {
          totalCancelado += val
        }
      } else if (row.type === 'despesa' && row.status === 'baixado') {
        totalDespesas += val
      }
    }

    // 2. Fetch paginated records with preloaded relations
    const query = FinancialRecord.query()
    this.applyScope(query, user)
    this.applyFilters(query, request)

    query
      .preload('patient', (pQuery) => pQuery.select('id', 'name', 'cpf', 'phone', 'session_rate'))
      .preload('appointment', (aQuery) =>
        aQuery.select(
          'id',
          'user_id',
          'patient_id',
          'specialty',
          'date',
          'start_time',
          'end_time',
          'status',
          'notes'
        )
      )

    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const limit = Math.max(1, Number(request.input('limit', 10)) || 10)

    const paginatedRecordsData = await query.orderBy('date', 'desc').orderBy('id', 'desc').paginate(page, limit)
    const paginatedRecords = paginatedRecordsData.all()
    const total = paginatedRecordsData.total

    return {
      summary: {
        totalBaixado,
        totalPendente,
        totalCancelado,
        totalDespesas,
        saldoLiquido: totalBaixado - totalDespesas,
        sessoesBaixadasCount,
        totalRecordsCount: Number(total),
      },
      records: paginatedRecords,
      meta: paginatedRecordsData.getMeta(),
    }
  }

  /**
   * Create a manual financial transaction or entry.
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const { patientId, appointmentId, title, amount, type, status, paymentMethod, date } =
      request.only([
        'patientId',
        'appointmentId',
        'title',
        'amount',
        'type',
        'status',
        'paymentMethod',
        'date',
      ])

    if (!title || amount === undefined || !date) {
      return response.badRequest({ error: 'Título, valor e data são obrigatórios.' })
    }

    const recordDate = typeof date === 'string' ? DateTime.fromISO(date) : DateTime.now()
    const recordStatus = status || 'pendente'

    const record = await FinancialRecord.create({
      userId: user.id,
      companyId: user.companyId || null,
      patientId: patientId ? Number(patientId) : null,
      appointmentId: appointmentId ? Number(appointmentId) : null,
      title,
      amount: Number(amount) || 0,
      type: type || 'receita',
      status: recordStatus,
      paymentMethod: paymentMethod || 'pix',
      date: recordDate,
      paidAt: recordStatus === 'baixado' ? DateTime.now() : null,
    })

    if (record.patientId) {
      await record.load('patient', (pQuery) =>
        pQuery.select('id', 'name', 'cpf', 'phone', 'session_rate')
      )
    }

    if (record.appointmentId) {
      await record.load('appointment', (aQuery) =>
        aQuery.select(
          'id',
          'user_id',
          'patient_id',
          'specialty',
          'date',
          'start_time',
          'end_time',
          'status',
          'notes'
        )
      )
    }

    return response.created(record)
  }

  /**
   * Update financial record (e.g. Dar baixa manual, alterar método de pagamento, etc).
   */
  async update({ auth, params, request, response, bouncer }: HttpContext) {
    const user = auth.getUserOrFail()

    const query = FinancialRecord.query().where('id', params.id)
    this.applyScope(query, user)
    const record = await query.first()

    if (!record) {
      return response.notFound({ error: 'Registro financeiro não encontrado.' })
    }

    await bouncer.with(FinancialRecordPolicy).authorize('edit', record)

    const { title, amount, type, status, paymentMethod, date } = request.only([
      'title',
      'amount',
      'type',
      'status',
      'paymentMethod',
      'date',
    ])

    if (title) record.title = title
    if (amount !== undefined) record.amount = Number(amount) || 0
    if (type) record.type = type
    if (paymentMethod) record.paymentMethod = paymentMethod
    if (date) record.date = typeof date === 'string' ? DateTime.fromISO(date) : date

    if (status && status !== record.status) {
      record.status = status
      if (status === 'baixado') {
        record.paidAt = DateTime.now()
      } else {
        record.paidAt = null
      }
    }

    await record.save()

    if (record.patientId) {
      await record.load('patient', (pQuery) =>
        pQuery.select('id', 'name', 'cpf', 'phone', 'session_rate')
      )
    }

    if (record.appointmentId) {
      await record.load('appointment', (aQuery) =>
        aQuery.select(
          'id',
          'user_id',
          'patient_id',
          'specialty',
          'date',
          'start_time',
          'end_time',
          'status',
          'notes'
        )
      )
    }

    return response.ok(record)
  }

  /**
   * Delete financial record.
   */
  async destroy({ auth, params, response, bouncer }: HttpContext) {
    const user = auth.getUserOrFail()

    const query = FinancialRecord.query().where('id', params.id)
    this.applyScope(query, user)
    const record = await query.first()

    if (!record) {
      return response.notFound({ error: 'Registro financeiro não encontrado.' })
    }

    await bouncer.with(FinancialRecordPolicy).authorize('delete', record)

    await record.delete()
    return response.ok({ message: 'Registro financeiro excluído com sucesso.' })
  }
}
