import { UserSchema } from '#database/schema'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { type AccessToken, DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import { hasMany, belongsTo } from '@adonisjs/lucid/orm'
import type { HasMany, BelongsTo } from '@adonisjs/lucid/types/relations'
import Patient from '#models/patient'
import Appointment from '#models/appointment'
import Company from '#models/company'

export default class User extends compose(UserSchema, withAuthFinder(hash)) {
  static accessTokens = DbAccessTokensProvider.forModel(User, {
    expiresIn: '10 hours',
  })
  declare currentAccessToken?: AccessToken

  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>

  @hasMany(() => Patient)
  declare patients: HasMany<typeof Patient>

  @hasMany(() => Appointment)
  declare appointments: HasMany<typeof Appointment>

  get initials() {
    const [first, last] = this.fullName ? this.fullName.split(' ') : this.email.split('@')
    if (first && last) {
      return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
    }
    return `${first.slice(0, 2)}`.toUpperCase()
  }
}
