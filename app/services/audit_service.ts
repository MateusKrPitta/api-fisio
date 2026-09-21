import AuditLog from '#models/audit_log'

export default class AuditService {
  /**
   * Record an audit event into audit_logs table in a non-blocking, fail-safe manner.
   */
  static async log(params: {
    userId?: number | string | null
    companyId?: number | string | null
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'LOGIN' | 'LOGOUT' | 'SIGN'
    tableName: string
    recordId: number | string
    oldData?: any
    newData?: any
  }) {
    try {
      await AuditLog.create({
        userId: params.userId ? Number(params.userId) : null,
        companyId: params.companyId ? Number(params.companyId) : null,
        action: params.action,
        tableName: params.tableName,
        recordId: Number(params.recordId) || 0,
        oldData: params.oldData ? JSON.stringify(params.oldData) : null,
        newData: params.newData ? JSON.stringify(params.newData) : null,
      })
    } catch (e) {
      // Fail-safe: Audit logging error should never interrupt the primary transaction
      console.error('AuditLog failure:', e)
    }
  }
}
