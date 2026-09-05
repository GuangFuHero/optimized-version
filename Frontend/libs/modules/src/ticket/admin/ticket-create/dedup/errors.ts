export class TicketCreatedButTasksFailedError extends Error {
  readonly uuid: string;

  constructor(uuid: string, message: string) {
    super(message);
    this.name = 'TicketCreatedButTasksFailedError';
    this.uuid = uuid;
  }
}
