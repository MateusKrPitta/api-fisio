import type { HttpContext } from '@adonisjs/core/http'
import { WhatsAppService } from '#services/whatsapp_service'
import Appointment from '#models/appointment'

export default class WhatsAppController {
  /**
   * Get current WhatsApp connection status & QR Code
   */
  async getStatus({ response }: HttpContext) {
    const waService = WhatsAppService.getInstance()
    return response.ok({
      status: waService.status,
      qrCode: waService.qrCode,
      connectedNumber: waService.connectedNumber,
    })
  }

  /**
   * Start WhatsApp connection & QR Code generation
   */
  async connect({ response }: HttpContext) {
    const waService = WhatsAppService.getInstance()
    const result = await waService.connect()
    return response.ok(result)
  }

  /**
   * Disconnect WhatsApp session
   */
  async disconnect({ response }: HttpContext) {
    const waService = WhatsAppService.getInstance()
    await waService.disconnect()
    return response.ok({ status: 'disconnected', message: 'WhatsApp desconectado com sucesso.' })
  }

  /**
   * Send automatic WhatsApp reminders for today's active appointments
   */
  async sendTodayReminders({ response }: HttpContext) {
    const waService = WhatsAppService.getInstance()

    if (waService.status !== 'connected') {
      return response.badRequest({
        error: 'O WhatsApp não está conectado. Por favor, conecte lendo o QR Code primeiro.',
      })
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const appointments = await Appointment.query()
      .where('date', todayStr)
      .whereNot('status', 'cancelado')
      .preload('patient')

    let sentCount = 0
    let failedCount = 0

    for (const app of appointments) {
      if (app.patient && app.patient.phone) {
        try {
          const dateDay = new Date(app.date.toString()).toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
          })
          const message = `Olá ${app.patient.fullName}! 👋\n\nAqui é a clínica de Fisioterapia (Dra. Milene). Gostaria de confirmar seu atendimento agendado para *hoje (${dateDay}) às ${app.startTime} hrs* (${app.specialty || 'Fisioterapia'}).\n\nPor favor, responda com *SIM* para confirmar ou nos avise caso precise remarcar. Obrigado! 😊`

          await waService.sendTextMessage(app.patient.phone, message)
          sentCount++
        } catch (e) {
          failedCount++
        }
      }
    }

    return response.ok({
      message: `Disparo automático concluído! ${sentCount} lembretes enviados com sucesso, ${failedCount} falhas.`,
      sentCount,
      failedCount,
    })
  }
}
