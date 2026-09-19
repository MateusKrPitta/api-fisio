import User from '#models/user'
import Appointment from '#models/appointment'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'

export default class AppointmentPolicy extends BasePolicy {
  before(user: User) {
    if (user.role === 'superadmin') {
      return true
    }
  }

  view(user: User, appointment: Appointment): AuthorizerResponse {
    if (user.companyId) {
      return appointment.companyId === user.companyId || appointment.userId === user.id
    }
    return appointment.userId === user.id
  }

  edit(user: User, appointment: Appointment): AuthorizerResponse {
    return this.view(user, appointment)
  }

  delete(user: User, appointment: Appointment): AuthorizerResponse {
    return this.view(user, appointment)
  }
}