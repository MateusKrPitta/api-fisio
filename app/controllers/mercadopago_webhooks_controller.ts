import type { HttpContext } from '@adonisjs/core/http'
import SubscriptionInvoice from '#models/subscription_invoice'
import { MercadoPagoService } from '#services/mercadopago_service'
import { DateTime } from 'luxon'

export default class MercadoPagoWebhooksController {
  /**
   * Handle incoming notifications/webhooks from Mercado Pago
   */
  public async handleWebhook({ request, response }: HttpContext) {
    const query = request.qs()
    const body = request.body()

    // Mercado Pago sends action / type / topic either in query or body
    const type = query.type || query.topic || body.type || body.action
    const dataId = query['data.id'] || query.id || body.data?.id || body.id

    // Only process payment events
    if ((type === 'payment' || body.action?.startsWith('payment.')) && dataId) {
      try {
        const paymentData: any = await MercadoPagoService.checkPaymentStatus(String(dataId))

        if (paymentData && paymentData.status === 'approved') {
          const externalRef = paymentData.external_reference // e.g. "invoice_42"
          let invoice: SubscriptionInvoice | null = null

          if (externalRef && externalRef.startsWith('invoice_')) {
            const invoiceId = Number(externalRef.replace('invoice_', ''))
            invoice = await SubscriptionInvoice.query().where('id', invoiceId).preload('company').first()
          }

          if (!invoice) {
            invoice = await SubscriptionInvoice.query()
              .where('mpPaymentId', String(dataId))
              .preload('company')
              .first()
          }

          if (invoice && invoice.status !== 'paid') {
            invoice.status = 'paid'
            invoice.paidAt = DateTime.now()
            invoice.paymentMethod = (paymentData.payment_type_id as any) || 'pix'
            invoice.mpPaymentId = String(dataId)
            await invoice.save()

            // Update & Reactivate Company
            const company = invoice.company
            if (company) {
              company.subscriptionStatus = 'active'
              company.status = 'active'
              company.lastPaymentDate = DateTime.now()

              const dueDay = company.dueDay || 10
              const nextMonth = DateTime.now().plus({ months: 1 })
              company.nextBillingDate = nextMonth.set({
                day: Math.min(dueDay, nextMonth.daysInMonth!),
              })
              await company.save()
            }
          }
        }
      } catch (err: any) {
        console.error('Erro ao processar Webhook Mercado Pago:', err.message)
      }
    }

    // Always return 200 OK to Mercado Pago so it does not retry needlessly
    return response.status(200).send('OK')
  }
}
