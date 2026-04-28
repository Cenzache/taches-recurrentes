import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const tasks = await redis.get('tasks') || [];
    return res.status(200).json(tasks);
  }

  if (req.method === 'POST') {
    const { name, startDate, frequencyDays } = req.body;
    const tasks = await redis.get('tasks') || [];
    const newTask = {
      id: Date.now().toString(),
      name,
      startDate,
      frequencyDays: Number(frequencyDays),
      lastDoneDate: null,
    };
    await redis.set('tasks', [...tasks, newTask]);
    return res.status(201).json(newTask);
  }

  if (req.method === 'PATCH') {
    const { id, lastDoneDate } = req.body;
    const tasks = await redis.get('tasks') || [];
    const updated = tasks.map(t => t.id === id ? { ...t, lastDoneDate } : t);
    await redis.set('tasks', updated);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    const tasks = await redis.get('tasks') || [];
    await redis.set('tasks', tasks.filter(t => t.id !== id));
    return res.status(200).json({ ok: true });
  }

  res.status(405).end();
}
