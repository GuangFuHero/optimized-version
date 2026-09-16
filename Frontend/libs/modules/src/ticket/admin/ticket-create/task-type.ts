export type TicketTaskTypeOption = 'rescue' | 'hr' | 'supply';

export const TICKET_TYPE_OPTIONS: readonly {
  value: TicketTaskTypeOption;
  label: string;
}[] = [
  { value: 'rescue', label: '救援' },
  { value: 'hr', label: '人力' },
  { value: 'supply', label: '物資' },
];

export function mapTaskTypeLabel(value: string) {
  return (
    TICKET_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}
