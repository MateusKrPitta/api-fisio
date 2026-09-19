import QRCode from 'qrcode'
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  Browsers,
} from '@whiskeysockets/baileys'
import pino from 'pino'
import fs from 'node:fs'
import path from 'node:path'
import Appointment from '#models/appointment'
import Patient from '#models/patient'

export class WhatsAppService {
  private static instance: WhatsAppService
  private sock: any = null
  public status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' = 'disconnected'
  public qrCode: string | null = null
  public connectedNumber: string | null = null

  private constructor() {}

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService()
    }
    return WhatsAppService.instance
  }

  public async connect() {
    if (this.status === 'connected' && this.sock) {
      return { status: this.status, qrCode: this.qrCode, connectedNumber: this.connectedNumber }
    }

    // Terminate existing socket if any
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners('connection.update')
        this.sock.ev.removeAllListeners('creds.update')
        this.sock.end(undefined)
      } catch (e) {}
      this.sock = null
    }

    // Always clean old auth folder to force fresh pairing QR generation
    const authDir = path.resolve('tmp/whatsapp_auth_info')
    if (fs.existsSync(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true })
      } catch (e) {}
    }

    this.status = 'connecting'
    this.qrCode = null

    return new Promise(async (resolve) => {
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          resolve({ status: this.status, qrCode: this.qrCode, connectedNumber: this.connectedNumber })
        }
      }, 10000)

      try {
        const { state, saveCreds } = await useMultiFileAuthState('tmp/whatsapp_auth_info')

        this.sock = makeWASocket({
          auth: state,
          printQRInTerminal: true, // Also prints QR in terminal as backup
          logger: pino({ level: 'silent' }),
          browser: Browsers.ubuntu('Chrome'),
          syncFullHistory: false,
          connectTimeoutMs: 30000,
        })

        this.sock.ev.on('creds.update', saveCreds)

        this.sock.ev.on('connection.update', async (update: any) => {
          const { connection, lastDisconnect, qr } = update

          if (qr) {
            this.status = 'qr_ready'
            this.qrCode = await QRCode.toDataURL(qr)
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              resolve({ status: this.status, qrCode: this.qrCode })
            }
          }

          if (connection === 'open') {
            this.status = 'connected'
            this.qrCode = null
            this.connectedNumber = this.sock?.user?.id?.split(':')[0] || 'Conectado'
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              resolve({ status: this.status, connectedNumber: this.connectedNumber })
            }
          }

          if (connection === 'close') {
            const statusCode = (lastDisconnect?.error as any)?.output?.statusCode
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut

            if (shouldReconnect && this.status !== 'connected') {
              this.status = 'disconnected'
              this.qrCode = null
            }

            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              resolve({ status: this.status, qrCode: this.qrCode })
            }
          }
        })

        // Auto-reply and auto-confirm appointment on "SIM"
        this.sock.ev.on('messages.upsert', async (m: any) => {
          if (m.type === 'notify') {
            for (const msg of m.messages) {
              if (!msg.key.fromMe && msg.message) {
                const body =
                  msg.message.conversation ||
                  msg.message.extendedTextMessage?.text ||
                  ''
                const normalizedText = body.trim().toLowerCase()
                const senderJid = msg.key.remoteJid || ''
                const senderPhone = senderJid.split('@')[0]

                if (['sim', '1', 'confirmar', 'confirmo', 's', 'ok'].includes(normalizedText)) {
                  await this.handleAutoConfirmation(senderPhone, senderJid)
                }
              }
            }
          }
        })
      } catch (error) {
        this.status = 'disconnected'
        this.qrCode = null
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve({ status: 'disconnected', qrCode: null })
        }
      }
    })
  }

  private async handleAutoConfirmation(phone: string, jid: string) {
    try {
      const cleanPhone = phone.replace(/\D/g, '')
      const patients = await Patient.all()
      const patient = patients.find((p) => (p.phone || '').replace(/\D/g, '').endsWith(cleanPhone.slice(-8)))

      if (patient) {
        const todayStr = new Date().toISOString().split('T')[0]
        const appointment = await Appointment.query()
          .where('patient_id', patient.id)
          .where('date', todayStr)
          .first()

        if (appointment) {
          appointment.status = 'confirmado'
          await appointment.save()

          await this.sock?.sendMessage(jid, {
            text: `Perfeito ${patient.fullName}! Seu atendimento para hoje às ${appointment.startTime} foi CONFIRMADO com sucesso. Te esperamos! 😊`,
          })
        }
      }
    } catch (e) {
      console.error('Error handling auto confirmation:', e)
    }
  }

  public async sendTextMessage(toPhone: string, text: string) {
    if (this.status !== 'connected' || !this.sock) {
      throw new Error('WhatsApp não está conectado. Escaneie o QR Code primeiro no sistema.')
    }
    const cleanNumber = toPhone.replace(/\D/g, '')
    const jid = `55${cleanNumber}@s.whatsapp.net`
    await this.sock.sendMessage(jid, { text })
  }

  public async disconnect() {
    if (this.sock) {
      try {
        await this.sock.logout()
      } catch (e) {}
      this.sock = null
    }

    const authDir = path.resolve('tmp/whatsapp_auth_info')
    if (fs.existsSync(authDir)) {
      try {
        fs.rmSync(authDir, { recursive: true, force: true })
      } catch (e) {}
    }

    this.status = 'disconnected'
    this.qrCode = null
  }
}
