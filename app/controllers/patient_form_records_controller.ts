import type { HttpContext } from '@adonisjs/core/http'
import PatientFormRecord from '#models/patient_form_record'
import Patient from '#models/patient'
import { DateTime } from 'luxon'
import crypto from 'node:crypto'

export default class PatientFormRecordsController {
  private async getPatientScoped(patientId: number | string, user: any) {
    const query = Patient.query().where('id', patientId)
    if (user.role === 'superadmin') {
      return await query.first()
    }
    if (user.companyId) {
      query.where((q: any) => {
        q.where('company_id', user.companyId).orWhere('user_id', user.id)
      })
    } else {
      query.where('user_id', user.id)
    }
    return await query.first()
  }

  /**
   * List all filled form records for a specific patient
   */
  async index({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const patient = await this.getPatientScoped(params.patientId, user)
    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    const records = await PatientFormRecord.query()
      .where('patient_id', params.patientId)
      .preload('template')
      .preload('user')
      .orderBy('record_date', 'desc')
      .orderBy('id', 'desc')

    // Ensure all records have a signature token for convenience
    for (const r of records) {
      if (!r.signatureToken) {
        r.signatureToken = crypto.randomUUID()
        r.signatureStatus = r.signatureStatus || 'pendente'
        await r.save()
      }
    }

    // Collect all module IDs across records
    const allModuleIds = new Set<number>()
    records.forEach((r) => {
      if (r.template?.moduleIds) {
        try {
          const ids = typeof r.template.moduleIds === 'string' ? JSON.parse(r.template.moduleIds) : r.template.moduleIds
          if (Array.isArray(ids)) {
            ids.forEach((id) => allModuleIds.add(Number(id)))
          }
        } catch (e) {}
      }
    })

    const CustomModule = (await import('#models/custom_module')).default
    const modules = allModuleIds.size > 0
      ? await CustomModule.query()
          .whereIn('id', Array.from(allModuleIds))
          .preload('fields', (q) => q.orderBy('sort_order', 'asc'))
      : []

    const modulesMap = new Map(modules.map((m) => [m.id, m]))

    const formattedRecords = records.map((r) => {
      let recModuleIds: number[] = []
      if (r.template?.moduleIds) {
        try {
          recModuleIds = typeof r.template.moduleIds === 'string' ? JSON.parse(r.template.moduleIds) : r.template.moduleIds
        } catch (e) {}
      }
      const recModules = Array.isArray(recModuleIds) ? recModuleIds.map((id) => modulesMap.get(id)).filter(Boolean) : []

      return {
        ...r.toJSON(),
        template: r.template
          ? {
              ...r.template.toJSON(),
              modules: recModules,
            }
          : null,
      }
    })

    return response.ok(formattedRecords)
  }

  /**
   * Get a single completed form record by ID with answers and template
   */
  async show({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const record = await PatientFormRecord.query()
      .where('id', params.id)
      .preload('template')
      .preload('user')
      .preload('patient')
      .first()

    if (!record) {
      return response.notFound({ error: 'Registro de formulário não encontrado.' })
    }

    const patient = await this.getPatientScoped(record.patientId, user)
    if (!patient) {
      return response.forbidden({ error: 'Acesso não autorizado a este registro.' })
    }

    if (!record.signatureToken) {
      record.signatureToken = crypto.randomUUID()
      record.signatureStatus = record.signatureStatus || 'pendente'
      await record.save()
    }

    let recModules: any[] = []
    if (record.template?.moduleIds) {
      try {
        const moduleIds: number[] = typeof record.template.moduleIds === 'string'
          ? JSON.parse(record.template.moduleIds)
          : record.template.moduleIds
        if (Array.isArray(moduleIds) && moduleIds.length > 0) {
          const CustomModule = (await import('#models/custom_module')).default
          recModules = await CustomModule.query()
            .whereIn('id', moduleIds)
            .preload('fields', (q) => q.orderBy('sort_order', 'asc'))
        }
      } catch (e) {}
    }

    return response.ok({
      ...record.toJSON(),
      template: record.template
        ? {
            ...record.template.toJSON(),
            modules: recModules,
          }
        : null,
    })
  }

  /**
   * Store a completed patient form record
   */
  async store({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const patient = await this.getPatientScoped(params.patientId, user)
    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    const { templateId, recordDate, answers, notes } = request.only([
      'templateId',
      'recordDate',
      'answers',
      'notes',
    ])

    if (!answers) {
      return response.badRequest({ error: 'As respostas do formulário são obrigatórias.' })
    }

    const rDate = recordDate ? DateTime.fromISO(recordDate) : DateTime.now()
    const signatureToken = crypto.randomUUID()

    const record = await PatientFormRecord.create({
      patientId: Number(params.patientId),
      templateId: templateId || null,
      userId: user.id,
      recordDate: rDate,
      answers: typeof answers === 'object' ? JSON.stringify(answers) : answers,
      notes: notes || null,
      signatureStatus: 'pendente',
      signatureToken,
      signatureImage: null,
      signedAt: null,
      signedByName: null,
      signedByCpf: null,
    })

    await record.load('template')
    await record.load('user')

    // Sincronizar com agendamento do paciente na data para marcar evolução como preenchida
    try {
      const Appointment = (await import('#models/appointment')).default
      const dateStr = rDate.toISODate()
      if (dateStr) {
        const matchingApp = await Appointment.query()
          .where('patient_id', Number(params.patientId))
          .where('date', dateStr)
          .whereNotIn('status', ['cancelado', 'desmarcado', 'ausente'])
          .first()

        if (matchingApp) {
          matchingApp.notes = notes || record.template?.title || 'Evolução preenchida'
          await matchingApp.save()
        }
      }
    } catch (e) {
      console.error('Erro ao sincronizar evolução com agendamento:', e)
    }

    return response.created(record)
  }

  /**
   * Update a completed patient form record
   */
  async update({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const record = await PatientFormRecord.query()
      .where('id', params.id)
      .first()

    if (!record) {
      return response.notFound({ error: 'Registro de formulário não encontrado.' })
    }

    const patient = await this.getPatientScoped(record.patientId, user)
    if (!patient) {
      return response.forbidden({ error: 'Acesso não autorizado a este registro.' })
    }

    const { templateId, recordDate, answers, notes, signatureStatus, signatureImage, signedByName, signedByCpf } = request.only([
      'templateId',
      'recordDate',
      'answers',
      'notes',
      'signatureStatus',
      'signatureImage',
      'signedByName',
      'signedByCpf',
    ])

    if (recordDate) {
      record.recordDate = DateTime.fromISO(recordDate)
    }
    if (templateId !== undefined) {
      record.templateId = templateId || null
    }
    if (answers !== undefined) {
      record.answers = typeof answers === 'object' ? JSON.stringify(answers) : answers
    }
    if (notes !== undefined) {
      record.notes = notes || null
    }
    if (signatureStatus !== undefined) {
      record.signatureStatus = signatureStatus
    }
    if (signatureImage !== undefined) {
      record.signatureImage = signatureImage
    }
    if (signedByName !== undefined) {
      record.signedByName = signedByName
    }
    if (signedByCpf !== undefined) {
      record.signedByCpf = signedByCpf
    }

    if (!record.signatureToken) {
      record.signatureToken = crypto.randomUUID()
    }

    await record.save()
    await record.load('template')
    await record.load('user')
    return response.ok(record)
  }

  /**
   * Delete a patient form record
   */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()

    // Somente o administrador / superadmin pode excluir avaliações
    const isAdmin = ['superadmin', 'clinic_admin', 'admin'].includes(user.role)
    if (!isAdmin) {
      return response.forbidden({ error: 'Apenas o administrador da clínica pode excluir avaliações e laudos.' })
    }

    const record = await PatientFormRecord.query()
      .where('id', params.id)
      .first()

    if (!record) {
      return response.notFound({ error: 'Registro não encontrado.' })
    }

    const patient = await this.getPatientScoped(record.patientId, user)
    if (!patient) {
      return response.forbidden({ error: 'Acesso não autorizado a este registro.' })
    }

    await record.delete()
    return response.ok({ message: 'Registro excluído com sucesso.' })
  }

  /**
   * PUBLIC: Show evaluation summary by public signature token
   */
  async showPublic({ params, response }: HttpContext) {
    const token = params.token
    if (!token) {
      return response.badRequest({ error: 'Token de assinatura inválido.' })
    }

    const record = await PatientFormRecord.query()
      .where('signature_token', token)
      .preload('template')
      .preload('patient')
      .preload('user')
      .first()

    if (!record) {
      return response.notFound({ error: 'Avaliação não encontrada ou link de assinatura inválido.' })
    }

    let recModules: any[] = []
    if (record.template?.moduleIds) {
      try {
        const moduleIds: number[] = typeof record.template.moduleIds === 'string'
          ? JSON.parse(record.template.moduleIds)
          : record.template.moduleIds
        if (Array.isArray(moduleIds) && moduleIds.length > 0) {
          const CustomModule = (await import('#models/custom_module')).default
          recModules = await CustomModule.query()
            .whereIn('id', moduleIds)
            .preload('fields', (q) => q.orderBy('sort_order', 'asc'))
        }
      } catch (e) {}
    }

    let parsedAnswers: Record<string, any> = {}
    try {
      parsedAnswers = typeof record.answers === 'string' ? JSON.parse(record.answers) : record.answers
    } catch (e) {
      parsedAnswers = {}
    }

    return response.ok({
      id: record.id,
      recordDate: record.recordDate,
      signatureStatus: record.signatureStatus || 'pendente',
      signatureToken: record.signatureToken,
      signatureImage: record.signatureImage,
      signedAt: record.signedAt,
      signedByName: record.signedByName,
      signedByCpf: record.signedByCpf,
      notes: record.notes,
      patient: record.patient ? {
        id: record.patient.id,
        name: record.patient.name,
        fullName: record.patient.name,
        cpf: record.patient.cpf,
        birthdate: record.patient.birthdate,
        gender: record.patient.gender,
      } : null,
      evaluator: record.user ? {
        id: record.user.id,
        fullName: record.user.fullName,
        email: record.user.email,
        crefito: record.user.crefito,
      } : null,
      template: record.template ? {
        id: record.template.id,
        title: record.template.title,
        description: record.template.description,
        modules: recModules,
      } : null,
      answers: parsedAnswers,
    })
  }

  /**
   * PUBLIC: Submit patient digital signature
   */
  async signPublic({ params, request, response }: HttpContext) {
    const token = params.token
    if (!token) {
      return response.badRequest({ error: 'Token de assinatura inválido.' })
    }

    const record = await PatientFormRecord.query()
      .where('signature_token', token)
      .preload('patient')
      .first()

    if (!record) {
      return response.notFound({ error: 'Avaliação não encontrada ou link de assinatura inválido.' })
    }

    const { signatureImage, signedByName, signedByCpf } = request.only([
      'signatureImage',
      'signedByName',
      'signedByCpf',
    ])

    if (!signatureImage || typeof signatureImage !== 'string' || !signatureImage.startsWith('data:image')) {
      return response.badRequest({ error: 'Imagem da assinatura é obrigatória.' })
    }

    record.signatureImage = signatureImage
    record.signatureStatus = 'assinado'
    record.signedAt = DateTime.now()
    record.signedByName = signedByName?.trim() || record.patient?.name || 'Paciente'
    record.signedByCpf = signedByCpf?.trim() || record.patient?.cpf || null

    await record.save()

    return response.ok({
      success: true,
      message: 'Avaliação assinada com sucesso pelo paciente!',
      signatureStatus: record.signatureStatus,
      signedAt: record.signedAt,
      signedByName: record.signedByName,
    })
  }
}
