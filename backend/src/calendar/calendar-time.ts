import { localParts } from "../attendance/attendance-risk";

/** Civil date helpers: DATE columns are UTC labels, not midnight instants. */
export function dateLabel(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function dateColumn(day: string) {
  return new Date(`${day}T00:00:00Z`);
}
export function nextDay(day: string, offset = 1) {
  return dateLabel(new Date(+dateColumn(day) + offset * 86400000));
}
export function mexicoInstant(day: string, time = "00:00:00") {
  const wall = Date.parse(`${day}T${time}Z`);
  let guess = wall;
  for (let i = 0; i < 4; i++) {
    const local = localParts(new Date(guess));
    guess += wall - Date.parse(`${local.day}T${local.time}Z`);
  }
  return new Date(guess);
}
export function weekday(day: string) {
  return [
    "DOMINGO",
    "LUNES",
    "MARTES",
    "MIERCOLES",
    "JUEVES",
    "VIERNES",
    "SABADO",
  ][dateColumn(day).getUTCDay()];
}

/** Excludes the originating date; deadlines expire at the end of the Nth business day. */
export async function businessDeadline(
  from: Date,
  count: number,
  isBusinessDay: (day: string) => Promise<boolean>,
) {
  let day = localParts(from).day;
  for (let inspected = 0; inspected < 1096 && count > 0; inspected++) {
    day = nextDay(day);
    if (await isBusinessDay(day)) count--;
  }
  if (count) throw new Error("Business calendar exceeds supported horizon");
  return new Date(+mexicoInstant(nextDay(day)) - 1);
}
