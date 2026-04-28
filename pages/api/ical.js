import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

function nextSaturday() {
  const d = new Date();
  const diff = (6 - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d;
}

function isDueForSaturday(task, saturday) {
  if (task.frequencyDays === 0) {
    if (task.lastDoneDate) return false;
    const taskDate = new Date(task.startDate + 'T00:00:00');
    const alertDate = new Date(taskDate.getTime() - (task.alertDays || 21) * 86400000);
    return saturday >= alertDate;
  }
  if (!task.lastDoneDate) return true;
  const elapsed = (saturday - task.lastDoneDate) / 86400000;
  return elapsed >= task.frequencyDays;
}

function toIcalDate(d) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function escapeIcal(str) {
  return str.replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

export default async function handler(req, res) {
  const tasks = await redis.get('tasks') || [];
  const sat = nextSaturday();
  const dueTasks = tasks.filter(t => isDueForSaturday(t, sat));

  const start = new Date(sat); start.setHours(9, 0, 0, 0);
  const end   = new Date(sat); end.setHours(9, 30, 0, 0);

  const summary = dueTasks.length > 0
    ? `Taches du samedi — ${dueTasks.length} a faire`
    : 'Taches du samedi — rien a faire';

  const description = dueTasks.length > 0
    ? dueTasks.map(t => `• ${t.name}${t.category ? ' [' + t.category + ']' : ''}`).join('\n')
    : 'Toutes les taches sont a jour.';

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Taches Recurrentes//FR',
    'CALSCALE:GREGORIAN',
    'REFRESH-INTERVAL;VALUE=DURATION:P1D',
    'X-WR-CALNAME:Taches recurrentes',
    'BEGIN:VEVENT',
    `UID:taches-samedi-${sat.toISOString().split('T')[0]}@recurrentes`,
    `DTSTART:${toIcalDate(start)}`,
    `DTEND:${toIcalDate(end)}`,
    `SUMMARY:${escapeIcal(summary)}`,
    `DESCRIPTION:${escapeIcal(description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.status(200).send(ical);
}
