import SystemSetting from '#models/system_setting'
import SubscriptionInvoice from '#models/subscription_invoice'
import Company from '#models/company'
import env from '#start/env'
import crypto from 'node:crypto'

function isValidCpf(cpf: string): boolean {
  cpf = cpf.replace(/\D/g, '')
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i)) * (10 - i)
  let rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  if (rev !== parseInt(cpf.charAt(9))) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i)) * (11 - i)
  rev = 11 - (sum % 11)
  if (rev === 10 || rev === 11) rev = 0
  return rev === parseInt(cpf.charAt(10))
}

function isValidCnpj(cnpj: string): boolean {
  cnpj = cnpj.replace(/\D/g, '')
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false
  let length = cnpj.length - 2
  let numbers = cnpj.substring(0, length)
  const digits = cnpj.substring(length)
  let sum = 0
  let pos = length - 7
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--
    if (pos < 2) pos = 9
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (result !== parseInt(digits.charAt(0))) return false
  length = length + 1
  numbers = cnpj.substring(0, length)
  sum = 0
  pos = length - 7
  for (let i = length; i >= 1; i--) {
    sum += parseInt(numbers.charAt(length - i)) * pos--
    if (pos < 2) pos = 9
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  return result === parseInt(digits.charAt(1))
}

export class MercadoPagoService {
  /**
   * Resolve valid Mercado Pago Access Token from Database (SystemSetting) or .env
   */
  public static async getAccessToken(): Promise<string> {
    const dbToken = await SystemSetting.get('mp_access_token')
    if (dbToken && dbToken.trim().length > 15 && !dbToken.includes('...')) {
      return dbToken.trim()
    }
    const envToken = env.get('MP_ACCESS_TOKEN') || process.env.MP_ACCESS_TOKEN || ''
    return envToken.trim()
  }

  public static async isConfigured(): Promise<boolean> {
    const token = await this.getAccessToken()
    return Boolean(token && token.length > 15)
  }

  /**
   * Generates a dynamic PIX payment for a Subscription Invoice directly via Mercado Pago REST API
   */
  public static async createPixPayment(
    invoice: SubscriptionInvoice,
    company: Company,
    payerEmail?: string
  ) {
    const accessToken = await this.getAccessToken()
    if (!accessToken || accessToken.length < 15) {
      throw new Error(
        'Token de acesso do Mercado Pago não configurado. Por favor, acesse o painel Administrativo > Mercado Pago e Configurações e salve o seu Access Token.'
      )
    }

    const email = payerEmail || company?.email || 'cliente@fismovie.com.br'
    const name = company?.name || 'Cliente FisMovie'
    const rawDoc = (company?.cnpj || '').replace(/\D/g, '')
    let validIdentification: { type: 'CPF' | 'CNPJ'; number: string } | null = null

    if (rawDoc.length === 11 && isValidCpf(rawDoc)) {
      validIdentification = { type: 'CPF', number: rawDoc }
    } else if (rawDoc.length === 14 && isValidCnpj(rawDoc)) {
      validIdentification = { type: 'CNPJ', number: rawDoc }
    }

    const body: any = {
      transaction_amount: Number(invoice.amount),
      description: invoice.title || `Mensalidade FisMovie - ${name}`,
      payment_method_id: 'pix',
      payer: {
        email: email.includes('@') ? email : 'cliente@fismovie.com.br',
        first_name: name.split(' ')[0] || 'Cliente',
        last_name: name.split(' ').slice(1).join(' ') || 'FisMovie',
        ...(validIdentification ? { identification: validIdentification } : {}),
      },
      external_reference: `invoice_${invoice.id}`,
      ...(process.env.APP_URL && process.env.APP_URL.startsWith('https://')
        ? { notification_url: `${process.env.APP_URL.replace(/\/+$/, '')}/api/v1/webhooks/mercadopago` }
        : {}),
    }

    const idempotencyKey = crypto.randomUUID()

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    })

    const data: any = await mpResponse.json().catch(() => ({}))

    if (!mpResponse.ok) {
      const errorDetail =
        data.message ||
        data.error ||
        (Array.isArray(data.cause) ? data.cause.map((c: any) => c.description || c.code).join('; ') : '') ||
        `Erro ${mpResponse.status} na API do Mercado Pago`
      throw new Error(errorDetail)
    }

    const pointOfInteraction = data.point_of_interaction
    const transactionData = pointOfInteraction?.transaction_data

    const pixQrCode = transactionData?.qr_code || null
    const pixQrCodeBase64 = transactionData?.qr_code_base64 || null
    const ticketUrl = transactionData?.ticket_url || null
    const mpPaymentId = String(data.id)

    invoice.mpPaymentId = mpPaymentId
    invoice.pixQrCode = pixQrCode
    invoice.pixQrCodeBase64 = pixQrCodeBase64
    invoice.ticketUrl = ticketUrl
    invoice.paymentMethod = 'pix'
    await invoice.save()

    return {
      mpPaymentId,
      pixQrCode,
      pixQrCodeBase64,
      ticketUrl,
      status: data.status,
    }
  }

  /**
   * Creates a checkout preference (Credit Card, Boleto, PIX) directly via Mercado Pago REST API
   */
  public static async createCheckoutPreference(
    invoice: SubscriptionInvoice,
    company: Company,
    backUrl?: string
  ) {
    const accessToken = await this.getAccessToken()
    if (!accessToken || accessToken.length < 15) {
      throw new Error('Credenciais do Mercado Pago não configuradas no sistema.')
    }

    const defaultBackUrl = backUrl || `${process.env.APP_URL || 'http://localhost:3000'}/admin`

    const body = {
      items: [
        {
          id: String(invoice.id),
          title: invoice.title || `Mensalidade FisMovie - ${company?.name || 'Clínica'}`,
          quantity: 1,
          unit_price: Number(invoice.amount),
          currency_id: 'BRL',
        },
      ],
      payer: {
        name: company?.name || 'Cliente FisMovie',
        email: company?.email || 'contato@fismovie.com.br',
      },
      external_reference: `invoice_${invoice.id}`,
      back_urls: {
        success: `${defaultBackUrl}?status=success&invoice=${invoice.id}`,
        pending: `${defaultBackUrl}?status=pending&invoice=${invoice.id}`,
        failure: `${defaultBackUrl}?status=failure&invoice=${invoice.id}`,
      },
      auto_return: 'approved',
    }

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })

    const data: any = await mpResponse.json().catch(() => ({}))

    if (!mpResponse.ok) {
      throw new Error(data.message || 'Erro ao gerar preferência no Mercado Pago.')
    }

    const preferenceId = data.id
    invoice.mpPreferenceId = preferenceId
    await invoice.save()

    return {
      preferenceId,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point,
    }
  }

  /**
   * Query status of a payment directly in Mercado Pago
   */
  public static async checkPaymentStatus(mpPaymentId: string) {
    const accessToken = await this.getAccessToken()
    if (!accessToken) return null

    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!mpResponse.ok) return null
    return await mpResponse.json().catch(() => null)
  }
}
export default MercadoPagoService
