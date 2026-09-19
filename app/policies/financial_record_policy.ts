import User from '#models/user'
import FinancialRecord from '#models/financial_record'
import { BasePolicy } from '@adonisjs/bouncer'
import type { AuthorizerResponse } from '@adonisjs/bouncer/types'

export default class FinancialRecordPolicy extends BasePolicy {
  before(user: User) {
    if (user.role === 'superadmin') {
      return true
    }
  }

  view(user: User, financialRecord: FinancialRecord): AuthorizerResponse {
    if (user.companyId) {
      return financialRecord.companyId === user.companyId || financialRecord.userId === user.id
    }
    return financialRecord.userId === user.id
  }

  edit(user: User, financialRecord: FinancialRecord): AuthorizerResponse {
    return this.view(user, financialRecord)
  }

  delete(user: User, financialRecord: FinancialRecord): AuthorizerResponse {
    return this.view(user, financialRecord)
  }
}