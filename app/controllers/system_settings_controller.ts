import type { HttpContext } from '@adonisjs/core/http'
import SystemSetting from '#models/system_setting'

export default class SystemSettingsController {
  /**
   * Get SuperAdmin system settings (e.g. Mercado Pago status and public configurations)
   */
  public async index({ auth, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Acesso restrito ao Administrador Geral.' })
    }

    const accessToken = await SystemSetting.get('mp_access_token')
    const publicKey = await SystemSetting.get('mp_public_key')
    const isSandbox = (await SystemSetting.get('mp_sandbox', 'false')) === 'true'
    const gracePeriodDays = Number(await SystemSetting.get('grace_period_days', '3'))
    const defaultTrialDays = Number(await SystemSetting.get('default_trial_days', '14'))
    const defaultMonthlyPrice = Number(await SystemSetting.get('default_monthly_price', '99.00'))

    // Mask access token for safety: e.g. APP_USR-1234...9876
    const maskedAccessToken = accessToken
      ? accessToken.length > 12
        ? `${accessToken.slice(0, 8)}...${accessToken.slice(-4)}`
        : '••••••••'
      : ''

    return {
      mercadopago: {
        isConfigured: Boolean(accessToken && accessToken.trim().length > 10),
        maskedAccessToken,
        publicKey: publicKey || '',
        isSandbox,
      },
      billing: {
        gracePeriodDays,
        defaultTrialDays,
        defaultMonthlyPrice,
      },
    }
  }

  /**
   * Save SuperAdmin system settings
   */
  public async update({ auth, request, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Acesso restrito ao Administrador Geral.' })
    }

    const {
      mpAccessToken,
      mpPublicKey,
      mpSandbox,
      gracePeriodDays,
      defaultTrialDays,
      defaultMonthlyPrice,
    } = request.all()

    if (mpAccessToken !== undefined && mpAccessToken.trim() !== '') {
      await SystemSetting.set('mp_access_token', mpAccessToken.trim(), 'Token de Acesso do Mercado Pago')
    }

    if (mpPublicKey !== undefined) {
      await SystemSetting.set('mp_public_key', mpPublicKey.trim(), 'Chave Pública do Mercado Pago')
    }

    if (mpSandbox !== undefined) {
      await SystemSetting.set('mp_sandbox', String(mpSandbox), 'Modo Sandbox do Mercado Pago')
    }

    if (gracePeriodDays !== undefined) {
      await SystemSetting.set('grace_period_days', String(gracePeriodDays), 'Dias de carência após vencimento')
    }

    if (defaultTrialDays !== undefined) {
      await SystemSetting.set('default_trial_days', String(defaultTrialDays), 'Dias padrão de teste grátis (Trial)')
    }

    if (defaultMonthlyPrice !== undefined) {
      await SystemSetting.set('default_monthly_price', String(defaultMonthlyPrice), 'Valor padrão da mensalidade')
    }

    return {
      success: true,
      message: 'Configurações atualizadas com sucesso!',
    }
  }

  /**
   * Test Mercado Pago connection with the configured or provided token
   */
  public async testConnection({ auth, request, response }: HttpContext) {
    const user = auth.user!
    if (user.role !== 'superadmin') {
      return response.status(403).json({ error: 'Acesso restrito ao Administrador Geral.' })
    }

    const providedToken = request.input('accessToken')
    const tokenToTest =
      providedToken || (await SystemSetting.get('mp_access_token')) || process.env.MP_ACCESS_TOKEN || ''

    if (!tokenToTest) {
      return response.status(400).json({
        error: 'Nenhum Access Token informado ou configurado.',
      })
    }

    try {
      const res = await fetch('https://api.mercadopago.com/v1/payment_methods', {
        headers: {
          Authorization: `Bearer ${tokenToTest}`,
        },
      })
      const data: any = await res.json().catch(() => ({}))

      if (!res.ok) {
        return response.status(400).json({
          error: data.message || `Falha na autenticação (HTTP ${res.status}): Verifique se o token está correto.`,
        })
      }

      return {
        success: true,
        message: 'Conexão com o Mercado Pago estabelecida com sucesso! Credenciais válidas.',
      }
    } catch (err: any) {
      return response.status(400).json({
        error: `Falha na conexão com o Mercado Pago: ${err.message || 'Token inválido'}`,
      })
    }
  }
}
