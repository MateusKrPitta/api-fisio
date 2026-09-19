import User from '#models/user'
import Patient from '#models/patient'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'

export default class PatientPolicy extends BasePolicy {
  before(user: User) {
    if (user.role === 'superadmin') {
      return true
    }
  }

  view(user: User, patient: Patient): AuthorizerResponse {
    if (user.companyId) {
      return patient.companyId === user.companyId || patient.userId === user.id
    }
    return patient.userId === user.id
  }

  edit(user: User, patient: Patient): AuthorizerResponse {
    return this.view(user, patient)
  }

  delete(user: User, patient: Patient): AuthorizerResponse {
    return this.view(user, patient)
  }
}