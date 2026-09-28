/** 草稿 task id → 建好的 task uuid。 */
export type CreatedTasks = Record<string, string>;

/** 單已經建好，但有 task 建立失敗；`createdTasks` 是失敗前已建好的那些。 */
export class TicketCreatedButTasksFailedError extends Error {
  readonly createdTasks: CreatedTasks;

  constructor(createdTasks: CreatedTasks, message: string) {
    super(message);
    this.name = 'TicketCreatedButTasksFailedError';
    this.createdTasks = createdTasks;
  }
}
