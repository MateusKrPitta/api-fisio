import app from '@adonisjs/core/services/app'
import { type HttpContext, ExceptionHandler } from '@adonisjs/core/http'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    const err = error as any

    if (err?.code === 'E_INVALID_CREDENTIALS') {
      return ctx.response.status(400).json({
        message: 'E-mail ou senha incorretos. Por favor, verifique os dados informados.',
      })
    }

    if (err?.code === 'E_UNAUTHORIZED_ACCESS') {
      return ctx.response.status(401).json({
        message: 'Acesso não autorizado. Sua sessão pode ter expirado.',
      })
    }

    if (err?.code === 'E_ROW_NOT_FOUND') {
      return ctx.response.status(404).json({
        message: 'O registro solicitado não foi encontrado no sistema.',
      })
    }

    if (err?.messages && Array.isArray(err.messages)) {
      const firstMessage = err.messages[0]?.message || 'Dados inválidos na requisição.'
      return ctx.response.status(422).json({
        message: firstMessage,
        errors: err.messages,
      })
    }

    return super.handle(error, ctx)
  }

  /**
   * The method is used to report error to the logging service or
   * the a third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    return super.report(error, ctx)
  }
}
