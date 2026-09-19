import type { HttpContext } from '@adonisjs/core/http'
import Patient from '#models/patient'
import Evaluation from '#models/evaluation'
import { createEvaluationValidator } from '#validators/evaluation'
import { DateTime } from 'luxon'

export default class EvaluationsController {
  /**
   * List all evaluations for a specific patient.
   */
  async index({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const patient = await Patient.query()
      .where('id', params.patientId)
      .where('user_id', user.id)
      .first()

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    return await patient.related('evaluations').query().orderBy('date', 'desc')
  }

  /**
   * Store a new evaluation for a patient.
   */
  async store({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()

    const patient = await Patient.query()
      .where('id', params.patientId)
      .where('user_id', user.id)
      .first()

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    const payload = await request.validateUsing(createEvaluationValidator)
    const evalDate = DateTime.fromISO(payload.date)

    const evaluation = await patient.related('evaluations').create({
      date: evalDate,
      scores: payload.scores,
      overall: payload.overall,
    })

    return response.created(evaluation)
  }

  /**
   * Delete an evaluation.
   */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()

    // Somente o administrador / superadmin pode excluir avaliações
    const isAdmin = ['superadmin', 'clinic_admin', 'admin'].includes(user.role)
    if (!isAdmin) {
      return response.forbidden({ error: 'Apenas o administrador da clínica pode excluir avaliações.' })
    }

    const evaluation = await Evaluation.query()
      .where('id', params.id)
      .whereHas('patient', (query) => {
        query.where('user_id', user.id)
      })
      .first()

    if (!evaluation) {
      return response.notFound({ error: 'Avaliação não encontrada.' })
    }

    await evaluation.delete()

    return response.noContent()
  }
}
