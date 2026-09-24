import type { HttpContext } from '@adonisjs/core/http'
import FinancialRecord from '#models/financial_record'
import Appointment from '#models/appointment'
import User from '#models/user'
import Company from '#models/company'
import { DateTime } from 'luxon'
import FinancialRecordPolicy from '#policies/financial_record_policy'

export default class FinancialRecordsController {
  /**
   * Helper to check if company plan allows expenses & payroll (Prata / Ouro / SuperAdmin)
   */
  private async checkPlanAllowance(user: any): Promise<{ allowed: boolean; plan: string }> {
    if (user.role === 'superadmin') {
      return { allowed: true, plan: 'gold' }
    }
    if (!user.companyId) {
      return { allowed: true, plan: 'gold' }
    }
    const company = await Company.find(user.companyId)
    if (!company) {
      return { allowed: true, plan: 'bronze' }
    }
    const plan = (company.plan || 'bronze').toLowerCase()
    const allowed = plan === 'silver' || plan === 'gold'
    return { allowed, plan }
  }

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
   * Apply date, period, status, type, patient, category, search filters
   */
  private applyFilters(query: any, request: any) {
    const period = request.input('period', 'month') // today | week | month | last_month | all
    const status = request.input('status', 'all') // all | baixado | pendente | cancelado
    const type = request.input('type', 'all') // all | receita | despesa
    const category = request.input('category')
    const patientId = request.input('patientId')
    const recipientUserId = request.input('recipientUserId') || request.input('recipient_user_id')
    const referenceMonth = request.input('referenceMonth') || request.input('reference_month')
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

    // Filter by category
    if (category && category !== 'all') {
      query.where('category', category)
    }

    // Filter by patient
    if (patientId) {
      query.where('patient_id', patientId)
    }

    // Filter by recipient user
    if (recipientUserId) {
      query.where('recipient_user_id', recipientUserId)
    }

    // Filter by reference month
    if (referenceMonth) {
      query.where('reference_month', referenceMonth)
    }

    // Filter by search term
    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`
      query.where((q: any) => {
        q.whereRaw('LOWER(title) LIKE ?', [term])
          .orWhereHas('patient', (pQuery: any) => {
            pQuery.whereRaw('LOWER(name) LIKE ?', [term])
          })
          .orWhereHas('recipientUser', (uQuery: any) => {
            uQuery.whereRaw('LOWER(full_name) LIKE ?', [term])
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
          const pName = app.patient ? app.patient.fullName || app.patient.name : 'Paciente'
          const st = (app.status || 'pendente').toLowerCase()
          const isBaixado = st === 'finalizado' || st === 'confirmado'
          const isCanceled = st === 'cancelado' || st === 'desmarcado' || st === 'ausente'
          const recStatus = isCanceled ? 'cancelado' : isBaixado ? 'baixado' : 'pendente'

          const appDate = app.date
            ? typeof app.date === 'string'
              ? DateTime.fromISO(app.date)
              : app.date
            : DateTime.now()

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
    let totalDespesasPendentes = 0
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
      } else if (row.type === 'despesa') {
        if (row.status === 'baixado') {
          totalDespesas += val
        } else if (row.status === 'pendente') {
          totalDespesasPendentes += val
        }
      }
    }

    // Category breakdown
    const categoryQuery = FinancialRecord.query().where('type', 'despesa')
    this.applyScope(categoryQuery, user)
    this.applyFilters(categoryQuery, request)
    const categoryData = await categoryQuery
      .select('category')
      .sum('amount as total')
      .count('* as count')
      .groupBy('category')

    const expensesByCategory: Record<string, number> = {}
    for (const catRow of categoryData) {
      const catKey = (catRow as any).category || 'outros'
      const catTotal = Number((catRow as any).$extras?.total ?? (catRow as any).total ?? 0)
      expensesByCategory[catKey] = (expensesByCategory[catKey] || 0) + catTotal
    }

    // 2. Fetch paginated records with preloaded relations
    const query = FinancialRecord.query()
    this.applyScope(query, user)
    this.applyFilters(query, request)

    query
      .preload('patient', (pQuery) => pQuery.select('id', 'name', 'cpf', 'phone', 'session_rate'))
      .preload('recipientUser', (uQuery) =>
        uQuery.select('id', 'full_name', 'email', 'role', 'pix_key', 'compensation_type')
      )
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

    const paginatedRecordsData = await query
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .paginate(page, limit)
    const paginatedRecords = paginatedRecordsData.all()
    const total = paginatedRecordsData.total

    const { plan, allowed: planAllowsExpenses } = await this.checkPlanAllowance(user)

    return {
      plan,
      planAllowsExpenses,
      summary: {
        totalBaixado,
        totalPendente,
        totalCancelado,
        totalDespesas,
        totalDespesasPendentes,
        saldoLiquido: totalBaixado - totalDespesas,
        sessoesBaixadasCount,
        totalRecordsCount: Number(total),
        expensesByCategory,
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

    const {
      patientId,
      appointmentId,
      recipientUserId,
      category,
      referenceMonth,
      title,
      amount,
      type,
      status,
      paymentMethod,
      date,
    } = request.only([
      'patientId',
      'appointmentId',
      'recipientUserId',
      'category',
      'referenceMonth',
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

    const recordType = type || 'receita'

    // Plan check: Expenses are allowed only on Silver & Gold plans
    if (recordType === 'despesa') {
      const { allowed, plan } = await this.checkPlanAllowance(user)
      if (!allowed) {
        return response.forbidden({
          error: `O cadastro e gestão de Saídas/Despesas está disponível exclusivamente para os planos Prata e Ouro. Seu plano atual é ${plan.toUpperCase()}.`,
        })
      }
    }

    const recordDate = typeof date === 'string' ? DateTime.fromISO(date) : DateTime.now()
    const recordStatus = status || 'pendente'

    const record = await FinancialRecord.create({
      userId: user.id,
      companyId: user.companyId || null,
      patientId: patientId ? Number(patientId) : null,
      appointmentId: appointmentId ? Number(appointmentId) : null,
      recipientUserId: recipientUserId ? Number(recipientUserId) : null,
      category: category || (recordType === 'despesa' ? 'outros' : null),
      referenceMonth: referenceMonth || null,
      title,
      amount: Number(amount) || 0,
      type: recordType,
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

    if (record.recipientUserId) {
      await record.load('recipientUser', (uQuery) =>
        uQuery.select('id', 'full_name', 'email', 'role', 'pix_key', 'compensation_type')
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

    const {
      title,
      amount,
      type,
      category,
      recipientUserId,
      referenceMonth,
      status,
      paymentMethod,
      date,
    } = request.only([
      'title',
      'amount',
      'type',
      'category',
      'recipientUserId',
      'referenceMonth',
      'status',
      'paymentMethod',
      'date',
    ])

    if (type === 'despesa' || record.type === 'despesa') {
      const { allowed, plan } = await this.checkPlanAllowance(user)
      if (!allowed) {
        return response.forbidden({
          error: `O gerenciamento de despesas é exclusivo para os planos Prata e Ouro. Seu plano é ${plan.toUpperCase()}.`,
        })
      }
    }

    if (title) record.title = title
    if (amount !== undefined) record.amount = Number(amount) || 0
    if (type) record.type = type
    if (category !== undefined) record.category = category
    if (recipientUserId !== undefined) record.recipientUserId = recipientUserId ? Number(recipientUserId) : null
    if (referenceMonth !== undefined) record.referenceMonth = referenceMonth
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

    if (record.recipientUserId) {
      await record.load('recipientUser', (uQuery) =>
        uQuery.select('id', 'full_name', 'email', 'role', 'pix_key', 'compensation_type')
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

  /**
   * Preview Payroll calculation for team members in a specific reference month (Prata & Ouro).
   */
  async payrollPreview({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const { allowed, plan } = await this.checkPlanAllowance(user)
    if (!allowed) {
      return response.forbidden({
        error: `O Módulo de Folha de Pagamento & Repasses é exclusivo para os planos Prata e Ouro. Seu plano é ${plan.toUpperCase()}.`,
      })
    }

    const now = DateTime.now()
    const year = Number(request.input('year', now.year))
    const month = Number(request.input('month', now.month))
    const refMonth = `${year}-${String(month).padStart(2, '0')}`

    const startOfMonth = DateTime.fromObject({ year, month, day: 1 }).startOf('month').toISODate()!
    const endOfMonth = DateTime.fromObject({ year, month, day: 1 }).endOf('month').toISODate()!

    // Fetch team members
    const teamQuery = User.query().where('active', true).orderBy('fullName', 'asc')
    if (user.role === 'superadmin') {
      const qCompanyId = request.input('companyId')
      if (qCompanyId) teamQuery.where('companyId', Number(qCompanyId))
    } else if (user.companyId) {
      teamQuery.where('companyId', user.companyId)
    } else {
      teamQuery.where('id', user.id)
    }

    const team = await teamQuery

    // Fetch attended appointments in the month
    const appointmentsQuery = Appointment.query()
      .whereBetween('date', [startOfMonth, endOfMonth])
      .whereIn('status', ['finalizado', 'confirmado'])
      .preload('patient')

    if (user.companyId) {
      appointmentsQuery.where('companyId', user.companyId)
    }
    const appointments = await appointmentsQuery

    // Fetch existing payroll financial records for this month
    const existingRecordsQuery = FinancialRecord.query()
      .where('type', 'despesa')
      .where('category', 'salario')
      .where('reference_month', refMonth)

    this.applyScope(existingRecordsQuery, user)
    const existingRecords = await existingRecordsQuery

    const payrollItems = []
    let totalPayrollAmount = 0
    let totalPaidAmount = 0
    let totalPendingAmount = 0

    for (const member of team) {
      // Find appointments assigned to this physiotherapist/user
      const memberAppointments = appointments.filter((app) => app.userId === member.id)
      const sessionCount = memberAppointments.length

      let grossRevenue = 0
      for (const app of memberAppointments) {
        const rate = app.patient ? Number(app.patient.sessionRate || 0) : 0
        grossRevenue += rate
      }

      const compType = member.compensationType || (member.role === 'secretary' ? 'fixed' : member.role === 'clinic_admin' ? 'pro_labore' : 'per_session')
      const baseSalary = member.baseSalary ? Number(member.baseSalary) : 0
      const sessionRate = member.sessionRate ? Number(member.sessionRate) : 0
      const commissionPct = member.commissionPercentage ? Number(member.commissionPercentage) : 0

      let calculatedAmount = 0
      let calculationDetails = ''

      if (compType === 'fixed' || compType === 'pro_labore') {
        calculatedAmount = baseSalary
        calculationDetails = `Salário Fixo: R$ ${baseSalary.toFixed(2).replace('.', ',')}`
      } else if (compType === 'per_session') {
        calculatedAmount = sessionCount * sessionRate
        calculationDetails = `${sessionCount} sessão(ões) × R$ ${sessionRate.toFixed(2).replace('.', ',')}`
      } else if (compType === 'percentage') {
        calculatedAmount = (commissionPct / 100) * grossRevenue
        calculationDetails = `${commissionPct}% sobre faturamento bruto (R$ ${grossRevenue.toFixed(2).replace('.', ',')})`
      } else if (compType === 'hybrid') {
        const sessionTotal = sessionRate > 0 ? sessionCount * sessionRate : (commissionPct / 100) * grossRevenue
        calculatedAmount = baseSalary + sessionTotal
        calculationDetails = `Fixo (R$ ${baseSalary.toFixed(2).replace('.', ',')}) + Atendimentos (R$ ${sessionTotal.toFixed(2).replace('.', ',')})`
      } else {
        calculatedAmount = baseSalary
        calculationDetails = `Valor fixo: R$ ${baseSalary.toFixed(2).replace('.', ',')}`
      }

      // Check if financial record already exists
      const existingRecord = existingRecords.find((rec) => rec.recipientUserId === member.id)
      const isLaunched = Boolean(existingRecord)
      const launchStatus = existingRecord ? existingRecord.status : 'nao_lancado'

      totalPayrollAmount += calculatedAmount
      if (launchStatus === 'baixado') {
        totalPaidAmount += calculatedAmount
      } else {
        totalPendingAmount += calculatedAmount
      }

      payrollItems.push({
        userId: member.id,
        fullName: member.fullName,
        email: member.email,
        role: member.role,
        avatarUrl: member.avatarUrl,
        crefito: member.crefito,
        pixKey: member.pixKey,
        bankInfo: member.bankInfo,
        paymentDay: member.paymentDay,
        compensationType: compType,
        baseSalary,
        sessionRate,
        commissionPercentage: commissionPct,
        sessionCount,
        grossRevenue,
        calculatedAmount,
        calculationDetails,
        isLaunched,
        launchStatus,
        financialRecordId: existingRecord?.id || null,
      })
    }

    return response.ok({
      referenceMonth: refMonth,
      year,
      month,
      summary: {
        totalPayrollAmount,
        totalPaidAmount,
        totalPendingAmount,
        totalMembers: payrollItems.length,
        totalSessionsAttended: appointments.length,
      },
      items: payrollItems,
    })
  }

  /**
   * Generate Financial Records for Payroll items (Prata & Ouro).
   */
  async payrollGenerate({ auth, request, response }: HttpContext) {
    const user = auth.getUserOrFail()

    if (user.role !== 'superadmin' && user.role !== 'clinic_admin') {
      return response.forbidden({ error: 'Apenas administradores podem fechar a folha de pagamento.' })
    }

    const { allowed, plan } = await this.checkPlanAllowance(user)
    if (!allowed) {
      return response.forbidden({
        error: `O Fechamento de Folha de Pagamento é exclusivo para os planos Prata e Ouro. Seu plano é ${plan.toUpperCase()}.`,
      })
    }

    const { year, month, items } = request.only(['year', 'month', 'items'])
    if (!year || !month || !Array.isArray(items) || items.length === 0) {
      return response.badRequest({ error: 'Ano, mês e lista de profissionais são obrigatórios.' })
    }

    const refMonth = `${year}-${String(month).padStart(2, '0')}`
    const paymentDateStr = `${year}-${String(month).padStart(2, '0')}-05`
    const defaultDate = DateTime.fromISO(paymentDateStr).isValid
      ? DateTime.fromISO(paymentDateStr)
      : DateTime.now()

    const createdRecords: any[] = []

    for (const item of items) {
      const recipientId = Number(item.userId)
      const amount = Number(item.amount) || 0

      if (!recipientId || amount <= 0) continue

      const targetUser = await User.find(recipientId)
      if (!targetUser) continue

      let existingRecordQuery = FinancialRecord.query()
        .where('recipient_user_id', recipientId)
        .where('category', 'salario')
        .where('reference_month', refMonth)

      if (user.companyId) {
        existingRecordQuery = existingRecordQuery.where('company_id', user.companyId)
      } else {
        existingRecordQuery = existingRecordQuery.whereNull('company_id')
      }

      const existingRecord = await existingRecordQuery.first()

      const title = item.title || `Salário / Repasse - ${targetUser.fullName} (${refMonth})`
      const payStatus = item.status === 'baixado' ? 'baixado' : 'pendente'
      const payMethod = item.paymentMethod || 'pix'
      const payDate = item.date ? DateTime.fromISO(item.date) : defaultDate

      if (existingRecord) {
        existingRecord.amount = amount
        existingRecord.title = title
        existingRecord.status = payStatus
        existingRecord.paymentMethod = payMethod
        existingRecord.date = payDate
        existingRecord.paidAt = payStatus === 'baixado' ? DateTime.now() : null
        await existingRecord.save()
        createdRecords.push(existingRecord)
      } else {
        const newRecord = await FinancialRecord.create({
          userId: user.id,
          companyId: user.companyId || null,
          recipientUserId: recipientId,
          category: 'salario',
          referenceMonth: refMonth,
          title,
          amount,
          type: 'despesa',
          status: payStatus,
          paymentMethod: payMethod,
          date: payDate,
          paidAt: payStatus === 'baixado' ? DateTime.now() : null,
        })
        createdRecords.push(newRecord)
      }
    }

    return response.ok({
      message: `${createdRecords.length} lançamento(s) de folha de pagamento gerado(s) com sucesso no financeiro!`,
      records: createdRecords,
    })
  }
}
