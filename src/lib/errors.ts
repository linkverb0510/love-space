export class ConflictError extends Error {
  readonly name = 'ConflictError';

  constructor(readonly entityId: string) {
    super(`内容 ${entityId} 已被另一台设备修改，请刷新后重试。`);
  }
}
