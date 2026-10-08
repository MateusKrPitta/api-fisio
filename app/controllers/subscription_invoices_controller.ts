import type { HttpContext } from '@adonisjs/core/http'
import SubscriptionInvoice from '#models/subscription_invoice'
import Company from '#models/company'
import { DateTime } from 'luxon'
import { MercadoPagoService } from '#services/mercadopago_service'

export default class SubscriptionInvoicesController {
  /**
   * Summary KPI metrics for SuperAdmin subscription dashboard
   */
  public async summary({ auth, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Acesso restrito ao Administrador Geral.' })
    }

    const companies = await Company.all()
    const invoices = await SubscriptionInvoice.query().preload('company')

    const totalCompanies = companies.length
    const activeCompanies = companies.filter((c) => c.subscriptionStatus === 'active' || c.status === 'active').length
    const trialCompanies = companies.filter((c) => c.subscriptionStatus === 'trial').length
    const pastDueCompanies = companies.filter((c) => c.subscriptionStatus === 'past_due' || c.subscriptionStatus === 'suspended').length
    const exemptCompanies = companies.filter((c) => c.subscriptionStatus === 'exempt').length

    // MRR (Monthly Recurring Revenue) Calculation based on paying active clinics
    const mrr = companies
      .filter((c) => c.subscriptionStatus === 'active')
      .reduce((acc, c) => acc + Number(c.monthlyPrice || 99.0), 0)

    const pendingInvoices = invoices.filter((i) => i.status === 'pending')
    const overdueInvoices = invoices.filter((i) => i.status === 'overdue' || (i.status === 'pending' && i.dueDate < DateTime.now()))
    const paidInvoices = invoices.filter((i) => i.status === 'paid')

    const totalPaidThisMonth = paidInvoices
      .filter((i) => i.paidAt && i.paidAt.month === DateTime.now().month && i.paidAt.year === DateTime.now().year)
      .reduce((acc, i) => acc + Number(i.amount), 0)

    const isMpConfigured = await MercadoPagoService.isConfigured()

    return {
      totalCompanies,
      activeCompanies,
      trialCompanies,
      pastDueCompanies,
      exemptCompanies,
      mrr,
      totalPaidThisMonth,
      pendingCount: pendingInvoices.length,
      overdueCount: overdueInvoices.length,
      paidCount: paidInvoices.length,
      isMpConfigured,
    }
  }

  /**
   * List invoices with search, filters and pagination
   */
  public async index({ auth, request, response }: HttpContext) {
    const user = auth.user!
    const isSuper = user.role === 'superadmin'

    const page = request.input('page', 1)
    const limit = request.input('limit', 15)
    const status = request.input('status')
    const companyId = request.input('companyId')
    const search = request.input('search')

    const query = SubscriptionInvoice.query().preload('company').orderBy('dueDate', 'desc')

    // Non-superadmins only see their company's invoices
    if (!isSuper) {
      if (!user.companyId) {
        return response.status(403).json({ error: 'Usuário sem clínica vinculada.' })
      }
      query.where('companyId', user.companyId)
    } else if (companyId) {
      query.where('companyId', companyId)
    }

    if (status && status !== 'all') {
      query.where('status', status)
    }

    if (search) {
      query.where((q) => {
        q.whereILike('title', `%${search}%`)
          .orWhereHas('company', (cq) => {
            cq.whereILike('name', `%${search}%`).orWhereILike('cnpj', `%${search}%`)
          })
      })
    }

    const invoices = await query.paginate(page, limit)
    return invoices
  }

  /**
   * Create an invoice manually
   */
  public async store({ auth, request, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Acesso restrito ao Administrador Geral.' })
    }

    const { companyId, title, amount, dueDate, notes, generatePix } = request.only([
      'companyId',
      'title',
      'amount',
      'dueDate',
      'notes',
      'generatePix',
    ])

    if (!companyId || !amount || !dueDate) {
      return response.status(400).json({ error: 'Empresa, valor e vencimento são obrigatórios.' })
    }

    const company = await Company.findOrFail(companyId)

    const invoice = await SubscriptionInvoice.create({
      companyId: company.id,
      title: title || `Mensalidade FisMovie - ${DateTime.fromISO(dueDate).toFormat('MM/yyyy')}`,
      amount: Number(amount),
      dueDate: DateTime.fromISO(dueDate),
      status: 'pending',
      notes: notes || null,
    })

    // If requested and MP is configured, generate PIX immediately
    if (generatePix) {
      try {
        if (await MercadoPagoService.isConfigured()) {
          await MercadoPagoService.createPixPayment(invoice, company)
        }
      } catch (err: any) {
        console.error('Erro ao gerar PIX inicial via Mercado Pago:', err.message)
      }
    }

    await invoice.load('company')
    return invoice
  }

  /**
   * Generate or retrieve dynamic PIX for an invoice
   */
  public async generatePix({ auth, params, response }: HttpContext) {
    try {
      const user = auth.user!
      const invoice = await SubscriptionInvoice.query()
        .where('id', params.id)
        .preload('company')
        .first()

      if (!invoice) {
        return response.status(404).json({
          error: 'Fatura de assinatura não encontrada no sistema.',
          message: 'Fatura de assinatura não encontrada no sistema.',
        })
      }

      if (user.role !== 'superadmin' && user.companyId !== invoice.companyId) {
        return response.status(403).json({
          error: 'Acesso não autorizado a esta fatura.',
          message: 'Acesso não autorizado a esta fatura.',
        })
      }

      if (invoice.status === 'paid') {
        return response.status(400).json({
          error: 'Esta fatura já está marcada como paga.',
          message: 'Esta fatura já está marcada como paga.',
        })
      }

      const pixData = await MercadoPagoService.createPixPayment(invoice, invoice.company)
      return response.status(200).json({
        success: true,
        invoice,
        pixData,
      })
    } catch (err: any) {
      console.error('[SubscriptionInvoicesController.generatePix Error]:', err)
      return response.status(400).json({
        error: err.message || 'Falha ao gerar cobrança PIX com o Mercado Pago.',
        message: err.message || 'Falha ao gerar cobrança PIX com o Mercado Pago.',
      })
    }
  }

  /**
   * Generate or retrieve Checkout Link (Cartão / Boleto / PIX)
   */
  public async generateCheckout({ auth, params, request, response }: HttpContext) {
    try {
      const user = auth.user!
      const invoice = await SubscriptionInvoice.query()
        .where('id', params.id)
        .preload('company')
        .first()

      if (!invoice) {
        return response.status(404).json({
          error: 'Fatura de assinatura não encontrada no sistema.',
          message: 'Fatura de assinatura não encontrada no sistema.',
        })
      }

      if (user.role !== 'superadmin' && user.companyId !== invoice.companyId) {
        return response.status(403).json({
          error: 'Acesso não autorizado.',
          message: 'Acesso não autorizado.',
        })
      }

      const backUrl = request.input('backUrl')

      const preference = await MercadoPagoService.createCheckoutPreference(invoice, invoice.company, backUrl)
      return response.status(200).json({
        success: true,
        initPoint: preference.initPoint,
        sandboxInitPoint: preference.sandboxInitPoint,
      })
    } catch (err: any) {
      console.error('[SubscriptionInvoicesController.generateCheckout Error]:', err)
      return response.status(400).json({
        error: err.message || 'Falha ao gerar link de pagamento.',
        message: err.message || 'Falha ao gerar link de pagamento.',
      })
    }
  }

  /**
   * Mark invoice as paid (manually or via SuperAdmin)
   */
  public async markAsPaid({ auth, params, request, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Apenas o Administrador Geral pode dar baixa manual.' })
    }

    const invoice = await SubscriptionInvoice.query().where('id', params.id).preload('company').firstOrFail()
    const paymentMethod = request.input('paymentMethod', 'manual')

    invoice.status = 'paid'
    invoice.paidAt = DateTime.now()
    invoice.paymentMethod = paymentMethod
    await invoice.save()

    // Automatically reactivate/maintain active the company
    const company = invoice.company
    if (company) {
      company.subscriptionStatus = 'active'
      company.status = 'active'
      company.lastPaymentDate = DateTime.now()

      // Advance next billing date to next month on the company's due day
      const dueDay = company.dueDay || 10
      const nextMonth = DateTime.now().plus({ months: 1 })
      company.nextBillingDate = nextMonth.set({ day: Math.min(dueDay, nextMonth.daysInMonth!) })
      await company.save()
    }

    return {
      success: true,
      message: 'Fatura marcada como paga com sucesso e clínica reativada!',
      invoice,
    }
  }

  /**
   * Manually update invoice status (SuperAdmin)
   */
  public async updateStatus({ auth, params, request, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Apenas o Administrador Geral pode alterar o status da fatura.' })
    }

    const { status, paymentMethod } = request.only(['status', 'paymentMethod'])
    if (!['pending', 'paid', 'overdue', 'canceled'].includes(status)) {
      return response.status(400).json({ error: 'Status de fatura inválido. Opções: pending, paid, overdue, canceled' })
    }

    const invoice = await SubscriptionInvoice.query().where('id', params.id).preload('company').firstOrFail()
    invoice.status = status as any

    if (status === 'paid') {
      invoice.paidAt = invoice.paidAt || DateTime.now()
      invoice.paymentMethod = paymentMethod || invoice.paymentMethod || 'manual'

      if (invoice.company && invoice.company.subscriptionStatus !== 'exempt') {
        invoice.company.subscriptionStatus = 'active'
        invoice.company.status = 'active'
        invoice.company.lastPaymentDate = DateTime.now()
        await invoice.company.save()
      }
    } else {
      invoice.paidAt = null
    }

    await invoice.save()

    return {
      success: true,
      message: `Status da fatura atualizado com sucesso!`,
      invoice,
    }
  }

  /**
   * Update invoice details (amount, title, dueDate, notes) and optionally regenerate PIX
   */
  public async update({ auth, params, request, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Acesso restrito ao Administrador Geral.' })
    }

    const invoice = await SubscriptionInvoice.query().where('id', params.id).preload('company').firstOrFail()
    const { title, amount, dueDate, notes, regeneratePix } = request.only([
      'title',
      'amount',
      'dueDate',
      'notes',
      'regeneratePix',
    ])

    if (title !== undefined) invoice.title = title
    if (amount !== undefined) invoice.amount = Number(amount)
    if (dueDate !== undefined && dueDate) invoice.dueDate = DateTime.fromISO(dueDate)
    if (notes !== undefined) invoice.notes = notes

    await invoice.save()

    // If invoice is not paid and MP is configured, regenerate PIX with new amount
    if (regeneratePix !== false && invoice.status !== 'paid') {
      try {
        if (await MercadoPagoService.isConfigured() && invoice.company) {
          await MercadoPagoService.createPixPayment(invoice, invoice.company)
          await invoice.refresh()
        }
      } catch (err: any) {
        console.error('Erro ao regerar PIX após alteração de valor:', err.message)
      }
    }

    await invoice.load('company')
    return {
      success: true,
      message: 'Fatura atualizada com sucesso!',
      invoice,
    }
  }

  /**
   * Automatically generate upcoming monthly invoices for active companies
   */
  public async generateMonthlyBatch({ auth, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Acesso restrito ao Administrador Geral.' })
    }

    const companies = await Company.query().whereIn('subscriptionStatus', ['active', 'past_due', 'trial'])
    const now = DateTime.now()
    const currentMonthYear = now.toFormat('MM/yyyy')
    let generatedCount = 0

    for (const company of companies) {
      const dueDay = company.dueDay || 10
      const targetDueDate = now.set({ day: Math.min(dueDay, now.daysInMonth!) })

      // Check if invoice for this month/year already exists
      const existing = await SubscriptionInvoice.query()
        .where('companyId', company.id)
        .whereILike('title', `%${currentMonthYear}%`)
        .first()

      if (!existing) {
        const monthlyAmount = Number(company.monthlyPrice || 99.0)
        const invoice = await SubscriptionInvoice.create({
          companyId: company.id,
          title: `Mensalidade FisMovie - ${currentMonthYear}`,
          amount: monthlyAmount,
          dueDate: targetDueDate,
          status: 'pending',
        })

        // Attempt PIX creation if MP is ready
        try {
          if (await MercadoPagoService.isConfigured()) {
            await MercadoPagoService.createPixPayment(invoice, company)
          }
        } catch (_) {}

        generatedCount++
      }
    }

    return {
      success: true,
      message: `${generatedCount} faturas geradas para o ciclo ${currentMonthYear}.`,
      generatedCount,
    }
  }

  /**
   * Delete an invoice
   */
  public async destroy({ auth, params, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Acesso restrito ao Administrador Geral.' })
    }

    const invoice = await SubscriptionInvoice.findOrFail(params.id)
    await invoice.delete()

    return { success: true, message: 'Fatura removida com sucesso.' }
  }
}
