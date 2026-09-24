import type { HttpContext } from '@adonisjs/core/http'
import SatisfactionSurvey from '#models/satisfaction_survey'
import Patient from '#models/patient'
import { DateTime } from 'luxon'
import crypto from 'node:crypto'
import AuditService from '#services/audit_service'

export default class SatisfactionSurveysController {
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
   * List all satisfaction surveys for a specific patient
   */
  async index({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const patient = await this.getPatientScoped(params.patientId, user)
    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    const surveys = await SatisfactionSurvey.query()
      .where('patient_id', params.patientId)
      .preload('user', (u) => u.select('id', 'full_name', 'email', 'crefito'))
      .orderBy('created_at', 'desc')

    return response.ok(surveys)
  }

  /**
   * Create a new satisfaction survey link for a patient
   */
  async store({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const patient = await this.getPatientScoped(params.patientId, user)
    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    const token = crypto.randomBytes(16).toString('hex')
    const survey = await SatisfactionSurvey.create({
      companyId: user.companyId || patient.companyId || null,
      patientId: patient.id,
      userId: user.id,
      token,
      status: 'pendente',
    })

    await survey.load('user', (u) => u.select('id', 'full_name', 'email', 'crefito'))

    await AuditService.log({
      userId: user.id,
      companyId: user.companyId || null,
      action: 'CREATE',
      tableName: 'satisfaction_surveys',
      recordId: survey.id,
      newData: { patientId: patient.id, token },
    })

    return response.created(survey)
  }

  /**
   * PUBLIC: View survey details by token (no login required)
   */
  async showPublic({ params, response }: HttpContext) {
    const token = params.token
    if (!token) {
      return response.badRequest({ error: 'Token de avaliação inválido.' })
    }

    const survey = await SatisfactionSurvey.query()
      .where('token', token)
      .preload('patient')
      .preload('user')
      .preload('company')
      .first()

    if (!survey) {
      return response.notFound({ error: 'Pesquisa de avaliação não encontrada ou link expirado.' })
    }

    return response.ok({
      id: survey.id,
      token: survey.token,
      status: survey.status,
      npsScore: survey.npsScore,
      therapistRating: survey.therapistRating,
      recoveryRating: survey.recoveryRating,
      structureRating: survey.structureRating,
      feedback: survey.feedback,
      answeredAt: survey.answeredAt,
      createdAt: survey.createdAt,
      patient: survey.patient
        ? {
            id: survey.patient.id,
            name: survey.patient.name,
            firstName: survey.patient.name.split(' ')[0],
          }
        : null,
      therapist: survey.user
        ? {
            id: survey.user.id,
            fullName: survey.user.fullName,
            crefito: survey.user.crefito,
            avatarUrl: (survey.user as any).avatarUrl || null,
          }
        : null,
      clinic: survey.company
        ? {
            id: survey.company.id,
            name: survey.company.name,
            phone: survey.company.phone,
            logoUrl: survey.company.logoUrl || null,
          }
        : { name: 'Clínica FisMovie', logoUrl: null },
    })
  }

  /**
   * PUBLIC: Submit patient satisfaction ratings
   */
  async submitPublic({ params, request, response }: HttpContext) {
    const token = params.token
    if (!token) {
      return response.badRequest({ error: 'Token inválido.' })
    }

    const survey = await SatisfactionSurvey.query().where('token', token).first()
    if (!survey) {
      return response.notFound({ error: 'Pesquisa não encontrada ou expirada.' })
    }

    if (survey.status === 'respondido') {
      return response.badRequest({ error: 'Esta avaliação já foi respondida anteriormente. Muito obrigado!' })
    }

    const { npsScore, therapistRating, recoveryRating, structureRating, feedback } = request.only([
      'npsScore',
      'therapistRating',
      'recoveryRating',
      'structureRating',
      'feedback',
    ])

    if (npsScore === undefined || npsScore === null || npsScore < 0 || npsScore > 10) {
      return response.badRequest({ error: 'Por favor, selecione uma nota de recomendação de 0 a 10.' })
    }

    survey.npsScore = Number(npsScore)
    survey.therapistRating = therapistRating ? Math.min(5, Math.max(1, Number(therapistRating))) : null
    survey.recoveryRating = recoveryRating ? Math.min(5, Math.max(1, Number(recoveryRating))) : null
    survey.structureRating = structureRating ? Math.min(5, Math.max(1, Number(structureRating))) : null
    survey.feedback = feedback ? String(feedback).trim().slice(0, 1000) : null
    survey.status = 'respondido'
    survey.answeredAt = DateTime.now()

    await survey.save()

    return response.ok({
      success: true,
      message: 'Avaliação recebida com sucesso! Agradecemos sua colaboração.',
      survey: {
        id: survey.id,
        status: survey.status,
        npsScore: survey.npsScore,
        answeredAt: survey.answeredAt,
      },
    })
  }

  /**
   * Delete a survey record (authenticated)
   */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const survey = await SatisfactionSurvey.find(params.id)
    if (!survey) {
      return response.notFound({ error: 'Pesquisa não encontrada.' })
    }

    // Verify company scope
    if (user.role !== 'superadmin' && user.companyId && survey.companyId !== user.companyId) {
      return response.forbidden({ error: 'Acesso negado.' })
    }

    await survey.delete()
    return response.ok({ success: true, message: 'Pesquisa removida com sucesso.' })
  }
}
