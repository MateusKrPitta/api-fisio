import User from '#models/user'
import PatientFormRecord from '#models/patient_form_record'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'

export default class PatientFormRecordPolicy extends BasePolicy {
  before(user: User) {
    if (user.role === 'superadmin') {
      return true
    }
  }

  async view(user: User, patientFormRecord: PatientFormRecord): Promise<AuthorizerResponse> {
    if (user.companyId) {
      await patientFormRecord.load('patient')
      return patientFormRecord.patient.companyId === user.companyId || patientFormRecord.userId === user.id
    }
    return patientFormRecord.userId === user.id
  }

  async edit(user: User, patientFormRecord: PatientFormRecord): Promise<AuthorizerResponse> {
    return this.view(user, patientFormRecord)
  }

  async delete(user: User, patientFormRecord: PatientFormRecord): Promise<AuthorizerResponse> {
    return this.view(user, patientFormRecord)
  }
}