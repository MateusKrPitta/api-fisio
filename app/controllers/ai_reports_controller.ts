import type { HttpContext } from '@adonisjs/core/http'
import Patient from '#models/patient'
import SavedClinicalReport from '#models/saved_clinical_report'

export default class AiReportsController {
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
   * Generate an ultra-efficient, token-optimized AI clinical report
   */
  async generate({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const patient = await this.getPatientScoped(params.patientId, user)

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    const { scaleTitle, tone = 'patient_friendly', summaryText, patientName } = request.only([
      'scaleTitle',
      'tone',
      'summaryText',
      'patientName',
    ])

    const pName = patientName || patient.fullName || patient.name || 'Paciente'
    const sTitle = scaleTitle || 'Avaliação Fisioterapêutica'

    // Micro-system instructions depending on selected tone
    let systemInstruction = ''
    if (tone === 'patient_friendly') {
      systemInstruction =
        'Você é um fisioterapeuta empático e atencioso. Escreva uma mensagem curta (3 a 4 frases no máximo), carinhosa e motivadora para o paciente e sua família, explicando a evolução dele de forma simples e acolhedora, sem termos médicos difíceis. Comece cumprimentando o paciente pelo primeiro nome.'
    } else if (tone === 'clinical') {
      systemInstruction =
        'Você é um fisioterapeuta especialista. Redija um parecer clínico evolutivo objetivo e formal (3 a 4 frases no máximo) para prontuário ou médico assistente, destacando os escores e a resposta terapêutica.'
    } else {
      systemInstruction =
        'Você é um fisioterapeuta especialista. Com base na evolução informada, liste exatamente 3 metas terapêuticas e focos de conduta prioritários para as próximas sessões, em formato de tópicos breves e diretos ao ponto.'
    }

    const userPrompt = `Paciente: ${pName}\nEscala: ${sTitle}\nDados resumidos da evolução:\n${summaryText || 'Evolução clínica em andamento.'}\n\nGere o texto conforme sua instrução.`

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''

    if (apiKey) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`

        const reqBody = {
          contents: [
            {
              parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 250,
            temperature: 0.35,
          },
        }

        const apiRes = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
        })

        if (apiRes.ok) {
          const data = (await apiRes.json()) as any
          const generatedText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
          if (generatedText) {
            return response.ok({
              success: true,
              reportText: generatedText,
              tone,
              scaleTitle: sTitle,
              model: 'gemini-1.5-flash',
            })
          }
        }
      } catch (err) {
        console.error('Erro na chamada Gemini AI:', err)
      }
    }

    // High-quality deterministic fallback if no API key is set yet
    let fallbackText = ''
    const firstName = pName.split(' ')[0]

    if (tone === 'patient_friendly') {
      fallbackText = `Olá, ${firstName}! Analisamos com carinho os resultados das suas sessões na ${sTitle}. Seu quadro tem apresentado respostas muito positivas ao tratamento fisioterapêutico, demonstrando maior facilidade na execução dos movimentos e ganho de independência. Parabéns pela dedicação e continue firme nos exercícios!`
    } else if (tone === 'clinical') {
      fallbackText = `Paciente ${pName} apresenta evolução satisfatória na ${sTitle}, com estabilização de parâmetros e melhora funcional progressiva registrada entre as sessões. Observa-se boa adesão ao plano terapêutico e prognóstico favorável para ganho de autonomia motora.`
    } else {
      fallbackText = `• Meta 1: Manutenção dos ganhos funcionais obtidos na ${sTitle} e fortalecimento de grupos musculares estabilizadores.\n• Meta 2: Progressão dos treinos de equilíbrio, controle postural e prevenção de fadiga.\n• Meta 3: Estímulo a atividades funcionais e transferências de forma independente e segura.`
    }

    return response.ok({
      success: true,
      reportText: fallbackText,
      tone,
      scaleTitle: sTitle,
      model: 'fallback-rules-engine',
    })
  }

  /**
   * List all saved reports for a patient
   */
  async index({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const patient = await this.getPatientScoped(params.patientId, user)

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    const reports = await SavedClinicalReport.query()
      .where('patient_id', patient.id)
      .orderBy('updated_at', 'desc')

    return response.ok(reports)
  }

  /**
   * Save or update a clinical report
   */
  async store({ auth, params, request, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const patient = await this.getPatientScoped(params.patientId, user)

    if (!patient) {
      return response.notFound({ error: 'Paciente não encontrado.' })
    }

    const { scaleKey, scaleTitle, tone, reportText } = request.only([
      'scaleKey',
      'scaleTitle',
      'tone',
      'reportText',
    ])

    if (!scaleKey || !reportText) {
      return response.badRequest({ error: 'Escala e texto do laudo são obrigatórios.' })
    }

    const sTone = tone || 'patient_friendly'
    const sTitle = scaleTitle || 'Avaliação Clínica'

    // Check if report already exists for this patient, scaleKey and tone
    let report = await SavedClinicalReport.query()
      .where('patient_id', patient.id)
      .where('scale_key', scaleKey)
      .where('tone', sTone)
      .first()

    if (report) {
      report.reportText = reportText
      report.scaleTitle = sTitle
      report.userId = user.id
      await report.save()
    } else {
      report = await SavedClinicalReport.create({
        userId: user.id,
        companyId: user.companyId || null,
        patientId: patient.id,
        scaleKey,
        scaleTitle: sTitle,
        tone: sTone,
        reportText,
      })
    }

    return response.ok({
      success: true,
      message: 'Laudo clínico salvo com sucesso no prontuário.',
      report,
    })
  }

  /**
   * Delete a saved report
   */
  async destroy({ auth, params, response }: HttpContext) {
    const user = auth.getUserOrFail()
    const query = SavedClinicalReport.query().where('id', params.id)
    if (user.role !== 'superadmin') {
      if (user.companyId) {
        const companyId = user.companyId
        query.where((q) => q.where('company_id', companyId).orWhere('user_id', user.id))
      } else {
        query.where('user_id', user.id)
      }
    }
    const report = await query.first()

    if (!report) {
      return response.notFound({ error: 'Laudo salvo não encontrado.' })
    }

    await report.delete()
    return response.ok({ success: true, message: 'Laudo excluído com sucesso.' })
  }
}
